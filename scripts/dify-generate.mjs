// 用 Dify App1(采购诊断) + App2(经营洞察) 真 AI 重生成 data/insights.json。
// 安全纪律：
//  - 未配 DIFY_BASE_URL/DIFY_APP1_KEY → 跳过，不动现有 insights.json。
//  - 单条诊断失败 → 回退“现有卡 > 规则兜底”，标 aiGenerated:false，不中断整批。
//  - App2 失败 → presetAnswers/execActions 回退现有，绝不影响 App1 已生成的 anomalyCards。
//  - App1/App2 均无有效输出 → 不覆盖现有 insights.json，避免把好数据洗成兜底。
//  - 未配 DIFY_APP2_KEY → 仅跑 App1，洞察沿用现有，不报错。
// 运行：node --env-file=.env scripts/dify-generate.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { detectAnomalies, DEFAULT_CONFIG } from "../src/lib/ruleEngine.js";

const BASE = process.env.DIFY_BASE_URL; // 已含 /v1，例 http://localhost/v1
const APP1 = process.env.DIFY_APP1_KEY;
const APP2 = process.env.DIFY_APP2_KEY;
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

// 规则引擎异常 + 采购数据 → App2 的 InsightSummaryInput（见 contracts.schema.json#InsightSummaryInput）
function toSummaryInput(anomalies, products, procurement) {
  const productLines = products.map((p) => ({
    id: p.id,
    name: p.name,
    total_amount: procurement.records
      .filter((r) => r.productLine === p.id)
      .reduce((sum, r) => sum + (r.amount ?? 0), 0),
    anomaly_count: anomalies.filter((a) => a.productLine === p.id).length
  }));
  return {
    anomalies: anomalies.map((a) => ({
      sku: a.sku, supplier: a.supplier, product_line: a.productLine,
      risk_level: a.riskLevel, triggered_rules: a.triggeredRules,
      divergence: a.metrics.divergence, concentration: a.metrics.concentration
    })),
    product_lines: productLines
  };
}

// 调 App2；带有效性守卫（succeeded ≠ 有效，三段非空 + execActions 至少 1 条）。失败返回 null。
async function summarize(input) {
  try {
    const res = await fetch(`${BASE}/workflows/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${APP2}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: { summary_json: JSON.stringify(input) },
        response_mode: "blocking", user: "procure-sentinel"
      })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    const o = data?.outputs ?? {};
    const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";
    const actions = Array.isArray(o.execActions) ? o.execActions.filter(nonEmpty) : [];
    const valid = data?.status === "succeeded"
      && nonEmpty(o.biggestRisk) && nonEmpty(o.costPressure) && nonEmpty(o.savingOpp)
      && actions.length >= 1;
    if (!valid) { console.warn("  ✗ App2 洞察无效（空洞察），回退现有"); return null; }
    return {
      presetAnswers: { biggestRisk: o.biggestRisk, costPressure: o.costPressure, savingOpp: o.savingOpp },
      execActions: actions
    };
  } catch (e) {
    console.warn(`  ✗ App2 调用失败（${e.message}），回退现有`);
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

  // App2 经营洞察：全盘异常 + 产品线汇总 → 预设问答 + 行动建议（独立于 App1，失败不影响卡）
  let summary = null;
  if (APP2) {
    console.log("调用 App2 生成经营洞察…");
    summary = await summarize(toSummaryInput(anomalies, products, procurement));
    console.log(summary ? "  ✓ App2 洞察生成" : "  · App2 回退现有洞察");
  } else {
    console.log("未配置 DIFY_APP2_KEY，跳过 App2，洞察沿用现有。");
  }

  if (aiCount === 0 && !summary) {
    console.warn("⚠ App1/App2 均无有效 AI 输出，保留现有 insights.json 不覆盖。");
    return;
  }

  const models = [];
  if (aiCount > 0) models.push("采购诊断(App1)");
  if (summary) models.push("经营洞察(App2)");

  const out = {
    _aiGenerated: true,
    _generatedAt: new Date().toISOString(),
    _model: `dify:${models.join("+")}`,
    // App2 洞察是否本批真 AI 生成；回退现有时沿用旧标志，供前端 ④ 区域精确打 ✨
    _app2Generated: summary ? true : (existing._app2Generated === true),
    anomalyCards: cards,
    presetAnswers: summary ? summary.presetAnswers : (existing.presetAnswers ?? {}),
    execActions: summary ? summary.execActions : (existing.execActions ?? [])
  };
  if (existing.correlation) out.correlation = existing.correlation;

  writeFileSync(INSIGHTS_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log(`已写入 ${INSIGHTS_PATH}：${aiCount}/${anomalies.length} 条为 AI 诊断。`);
}

main().catch((e) => { console.error("dify-generate 失败:", e); process.exit(1); });
