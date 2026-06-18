// 用 Dify App1 真 AI 诊断重生成 data/insights.json。
// 安全纪律：
//  - 未配 DIFY_BASE_URL/DIFY_APP1_KEY → 跳过，不动现有 insights.json。
//  - 单条诊断失败 → 回退“现有卡 > 规则兜底”，标 aiGenerated:false，不中断整批。
//  - 全部失败（无一条 AI 成功）→ 不覆盖现有 insights.json，避免把好数据洗成兜底。
// 运行：node --env-file=.env scripts/dify-generate.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { detectAnomalies, DEFAULT_CONFIG } from "../src/lib/ruleEngine.js";

const BASE = process.env.DIFY_BASE_URL; // 已含 /v1，例 http://localhost/v1
const APP1 = process.env.DIFY_APP1_KEY;
const INSIGHTS_PATH = "data/insights.json";

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// 规则引擎异常对象 → App1 的 AnomalyInput（见 contracts.schema.json#AnomalyInput）
function toAnomalyInput(a, products) {
  const product = products.find((p) => p.id === a.productLine);
  const m = a.metrics;
  return {
    key: a.key, sku: a.sku, supplier: a.supplier, product_line: a.productLine,
    risk_level: a.riskLevel, material_name: product?.materials?.[0]?.name ?? "",
    triggered_rules: a.triggeredRules,
    metrics: {
      price: m.price, price_pct: m.pricePct, material_pct: m.materialPct,
      divergence: m.divergence, peer_dev: m.peerDev, concentration: m.concentration
    }
  };
}

// 调 App1；带有效性守卫（succeeded ≠ 有效）。失败返回 null。
async function diagnose(input) {
  try {
    const res = await fetch(`${BASE}/workflows/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${APP1}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: { anomaly_json: JSON.stringify(input) },
        response_mode: "blocking", user: "procure-sentinel"
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    const o = data?.outputs ?? {};
    const valid = data?.status === "succeeded"
      && typeof o.conclusion === "string" && o.conclusion.trim() !== ""
      && Array.isArray(o.suggestions) && o.suggestions.length >= 1;
    if (!valid) { console.warn(`  ✗ ${input.key} 诊断无效（空诊断），回退`); return null; }
    return {
      conclusion: o.conclusion,
      attribution: typeof o.attribution === "string" ? o.attribution : "",
      suggestions: o.suggestions,
      notify: Array.isArray(o.notify) ? o.notify : ["采购部负责人"],
      confidence: typeof o.confidence === "number" ? o.confidence : null
    };
  } catch (e) {
    console.warn(`  ✗ ${input.key} 调用失败（${e.message}），回退`);
    return null;
  }
}

async function main() {
  if (!BASE || !APP1) {
    console.log("未配置 DIFY_BASE_URL / DIFY_APP1_KEY，保留现有 insights.json，跳过。");
    return;
  }
  const products = readJson("data/products.json").productLines;
  const market = readJson("data/market.json");
  const procurement = readJson("data/procurement.json");
  const existing = existsSync(INSIGHTS_PATH) ? readJson(INSIGHTS_PATH) : {};

  const anomalies = detectAnomalies(procurement.records, market, products, DEFAULT_CONFIG);
  console.log(`检出 ${anomalies.length} 条异常，调用 App1 诊断…`);

  const cards = {};
  let aiCount = 0;
  for (const a of anomalies) {
    const base = { riskLevel: a.riskLevel, title: `${a.sku} · ${a.supplier}` };
    const ai = await diagnose(toAnomalyInput(a, products));
    if (ai) {
      cards[a.key] = { ...base, ...ai, aiGenerated: true };
      aiCount++;
      console.log(`  ✓ AI  ${a.key}`);
    } else if (existing.anomalyCards?.[a.key]) {
      // 失败时优先保留现有（可能是上次 AI 或精心手写的）卡
      cards[a.key] = { ...existing.anomalyCards[a.key], aiGenerated: existing.anomalyCards[a.key].aiGenerated === true };
      console.log(`  · 保留现有 ${a.key}`);
    } else {
      cards[a.key] = {
        ...base,
        conclusion: `命中规则：${a.triggeredRules.join("、")}，需关注。`,
        attribution: "由规则引擎判定，AI 诊断未生成。",
        suggestions: ["复盘报价", "询比价", "评估替代供应商"],
        notify: ["采购部负责人"], confidence: null, aiGenerated: false
      };
      console.log(`  · 规则兜底 ${a.key}`);
    }
  }

  if (aiCount === 0) {
    console.warn("⚠ 无一条 AI 诊断成功，保留现有 insights.json 不覆盖。");
    return;
  }

  const out = {
    _aiGenerated: true,
    _generatedAt: new Date().toISOString(),
    _model: "dify:采购诊断工作流(App1)",
    anomalyCards: cards,
    // App2/App3 尚未部署：沿用现有预生成内容
    presetAnswers: existing.presetAnswers ?? {},
    execActions: existing.execActions ?? []
  };
  if (existing.correlation) out.correlation = existing.correlation;

  writeFileSync(INSIGHTS_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`已写入 ${INSIGHTS_PATH}：${aiCount}/${anomalies.length} 条为 AI 诊断。`);
}

main().catch((e) => { console.error("dify-generate 失败:", e); process.exit(1); });
