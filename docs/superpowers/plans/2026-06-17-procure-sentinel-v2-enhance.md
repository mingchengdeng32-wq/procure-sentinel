# ProcureSentinel v2 增强实现计划（报价合理性 + 实时抓取）

> **For agentic workers:** 用 TDD 实现核心逻辑，UI/脚本走构建+浏览器目视。Steps 用 `- [ ]`。

**Goal:** 给 demo 加"报价合理性引擎"（AI 判报价偏高/偏低）+ 真实按天抓取层（新浪期货抓沪铜/沪铝）+「市场报价雷达」看板区，并预留关联分析与 Dify 接口。

**Architecture:** 纯前端不变；新增确定性可测的 `priceModel.js`；新增 Node 抓取脚本 `scripts/fetch-market.mjs` 写 `data/live-market.json`，由 GitHub Actions cron 每日跑；新增 `radar.js` 看板组件。

**Tech Stack:** 原生 ESM JS + ECharts；Node `fetch`；GitHub Actions。

参考：spec `docs/superpowers/specs/2026-06-17-procure-sentinel-design.md` §16。

---

## Task E1: 报价合理性引擎 priceModel.js（TDD）

**Files:** Create `src/lib/priceModel.js`、Test `tests/priceModel.test.js`

- [ ] **Step 1: 写失败测试 tests/priceModel.test.js**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonablePrice, assessQuote, DEFAULT_MODEL } from "../src/lib/priceModel.js";

test("reasonablePrice 按成本传导推算合理价", () => {
  // base 100, 材料涨10%, passThrough 0.6 => 100*(1+0.06)=106
  assert.ok(Math.abs(reasonablePrice(100, 0.10) - 106) < 1e-9);
});

test("assessQuote 实际远高于区间 => 偏高", () => {
  const r = assessQuote(100, 0.10, 120, DEFAULT_MODEL); // 合理106, 上界106*1.08=114.48
  assert.equal(r.verdict, "偏高");
  assert.ok(r.deviation > 0.1);
});

test("assessQuote 区间内 => 合理", () => {
  const r = assessQuote(100, 0.10, 107);
  assert.equal(r.verdict, "合理");
});

test("assessQuote 低于下界 => 偏低", () => {
  const r = assessQuote(100, 0.10, 90); // 下界106*0.92=97.52
  assert.equal(r.verdict, "偏低");
});
```

- [ ] **Step 2: 运行看失败** `node --test "tests/priceModel.test.js"` → FAIL（模块不存在）

- [ ] **Step 3: 实现 src/lib/priceModel.js**

```js
// 报价合理性引擎：可解释的成本传导模型（非黑盒），demo 够用且经得起追问。
export const DEFAULT_MODEL = { passThrough: 0.6, band: 0.08 };

// 合理基准价 = 基准价 × (1 + 材料涨跌幅 × 传导系数)
export function reasonablePrice(basePrice, materialDelta, model = DEFAULT_MODEL) {
  return basePrice * (1 + materialDelta * model.passThrough);
}

// 评估单条报价：返回合理价、区间、偏离、判定
export function assessQuote(basePrice, materialDelta, actual, model = DEFAULT_MODEL) {
  const reasonable = reasonablePrice(basePrice, materialDelta, model);
  const low = reasonable * (1 - model.band);
  const high = reasonable * (1 + model.band);
  const deviation = (actual - reasonable) / reasonable;
  let verdict = "合理";
  if (actual > high) verdict = "偏高";
  else if (actual < low) verdict = "偏低";
  return { reasonable, low, high, actual, deviation, verdict };
}
```

- [ ] **Step 4: 运行看通过** `node --test "tests/priceModel.test.js"` → PASS（4/4）；再 `npm test` 全绿。

- [ ] **Step 5: Commit** `feat: add price-reasonableness engine with tests`

---

## Task E2: 抓取脚本 + benchmark 种子 + GitHub Actions

**Files:** Create `scripts/fetch-market.mjs`、`data/benchmark.json`、`data/live-market.json`（脚本生成的初值也提交一份）、`.github/workflows/daily-fetch.yml`

- [ ] **Step 1: 创建 data/benchmark.json（市场成交价锚点，种子，明确标注）**

```json
{
  "_seeded": true,
  "_note": "CCL/PCB 等无稳定免费接口，此为示例锚点；真实成交价待 ccgp/Dify AI 节点接入",
  "categories": {
    "cable": { "marketAvgPrice": 99, "unit": "指数" },
    "connector": { "marketAvgPrice": 11.4, "unit": "元" },
    "pcb": { "marketAvgPrice": 102, "unit": "指数" }
  }
}
```

- [ ] **Step 2: 创建抓取脚本 scripts/fetch-market.mjs（真抓沪铜/沪铝，失败回落 seeded 并标注）**

```js
// 按天抓材料行情。真实源：新浪财经期货（无鉴权，需 Referer）。
// 失败时回落 seeded，并在输出标 real:false，绝不冒充真抓。
import { writeFileSync } from "node:fs";

const SOURCES = [
  { id: "copper", name: "沪铜", code: "nf_CU0", seeded: 70000 },
  { id: "aluminum", name: "沪铝", code: "nf_AL0", seeded: 20000 }
];

// 从新浪返回文本中提取第一个像价格的数（忽略 GBK 名称乱码，数字是 ASCII）
function parsePrice(text) {
  const m = text.match(/="([^"]+)"/);
  if (!m) return null;
  const fields = m[1].split(",").map(Number).filter((n) => Number.isFinite(n) && n > 0);
  // 期货串里盘中价通常在前几个字段，取一个合理的正数
  return fields.length ? fields.find((n) => n > 100) ?? fields[0] : null;
}

async function fetchOne(src) {
  try {
    const res = await fetch(`https://hq.sinajs.cn/list=${src.code}`, {
      headers: { Referer: "https://finance.sina.com.cn" }
    });
    const text = await res.text();
    const price = parsePrice(text);
    if (price) return { id: src.id, name: src.name, price, real: true };
  } catch (e) {
    console.error(`抓取 ${src.name} 失败:`, e.message);
  }
  return { id: src.id, name: src.name, price: src.seeded, real: false };
}

const sources = await Promise.all(SOURCES.map(fetchOne));
const out = { updatedAt: new Date().toISOString().slice(0, 10), sources };
writeFileSync("data/live-market.json", JSON.stringify(out, null, 2) + "\n");
console.log("live-market.json 已更新:", JSON.stringify(out));
```

- [ ] **Step 3: 运行脚本一次，生成 data/live-market.json**

Run: `node scripts/fetch-market.mjs`
Expected: 打印结果并生成 `data/live-market.json`。**如实记录**沪铜/沪铝是 `real:true`（真抓到）还是 `real:false`（回落 seeded）。两种都不算失败，但报告里要写清。

- [ ] **Step 4: 创建 GitHub Actions 工作流 .github/workflows/daily-fetch.yml**

```yaml
name: daily-market-fetch
on:
  schedule:
    - cron: "0 1 * * *"   # 每日 UTC 01:00
  workflow_dispatch:
jobs:
  fetch:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: node scripts/fetch-market.mjs
      - name: commit if changed
        run: |
          git config user.name "github-actions"
          git config user.email "actions@github.com"
          git add data/live-market.json
          git diff --staged --quiet || git commit -m "chore: daily market data refresh"
          git push
```

- [ ] **Step 5: Commit** `feat: add daily market scraper, benchmark seed and GitHub Actions cron`

---

## Task E3: 「市场报价雷达」看板组件 radar.js

**Files:** Create `src/components/radar.js`、Modify `index.html`（加 `<section id="radar">`）、Modify `src/app.js`（加载 live-market/benchmark + 渲染 radar）

- [ ] **Step 1: index.html 在 `<section id="dashboard">` 后插入**

```html
    <section id="radar"></section>
```

- [ ] **Step 2: app.js 加载新数据并渲染**

在 `provider` 数据加载处（`main()` 的 Promise.all）追加读取（用 fetch 直接读，容错：缺失不致崩）：

```js
  const [liveMarket, benchmark] = await Promise.all([
    fetch("data/live-market.json").then((r) => r.ok ? r.json() : null).catch(() => null),
    fetch("data/benchmark.json").then((r) => r.ok ? r.json() : null).catch(() => null)
  ]);
  state.liveMarket = liveMarket;
  state.benchmark = benchmark;
```

在 `renderAll()` 的 ctx 里加入 `liveMarket: state.liveMarket, benchmark: state.benchmark`，并在 `renderDashboard` 调用后追加：

```js
  renderRadar(document.getElementById("radar"), ctx);
```

并在文件顶部 `import { renderRadar } from "./components/radar.js";`

- [ ] **Step 3: 实现 src/components/radar.js**

```js
import { assessQuote, DEFAULT_MODEL } from "../lib/priceModel.js";
import { pctChange } from "../lib/stats.js";
import { signedPct } from "../lib/format.js";

// 用材料环比 + 基准价评估当前产品线报价是否偏高
function assessCurrent(ctx) {
  const rec = ctx.procurement.records.find((r) => r.productLine === ctx.productLine);
  if (!rec) return null;
  const product = ctx.products.find((p) => p.id === ctx.productLine);
  const matSeries = ctx.market.materials[product.materials[0].id] || [];
  const matDelta = matSeries.length >= 2 ? pctChange(matSeries.at(-1), matSeries.at(-2)) : 0;
  const basePrice = rec.unitPrice.at(-2);
  const actual = rec.unitPrice.at(-1);
  return { rec, ...assessQuote(basePrice, matDelta, actual, DEFAULT_MODEL) };
}

const VERDICT_META = {
  偏高: { color: "var(--risk-high)", tip: "建议谈判压价" },
  偏低: { color: "var(--risk-low)", tip: "采购表现优于合理区间" },
  合理: { color: "var(--text-1)", tip: "处于合理区间内" }
};

export function renderRadar(el, ctx) {
  const live = ctx.liveMarket;
  const a = assessCurrent(ctx);
  const updated = live?.updatedAt ?? "—";
  const ticker = (live?.sources ?? []).map((s) => {
    const tag = s.real
      ? `<span style="color:var(--risk-low);font-size:10px">●实时</span>`
      : `<span style="color:var(--risk-mid);font-size:10px">●示例</span>`;
    return `<span class="mr-5">${s.name} <b class="big-num">${s.price}</b> ${tag}</span>`;
  }).join("");

  const meta = a ? VERDICT_META[a.verdict] : null;
  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">市场报价雷达 · AI 报价合理性</h2>
    <div class="card p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
      <div>${ticker || '<span style="color:var(--text-1)">行情数据加载中…</span>'}</div>
      <div class="text-xs" style="color:var(--text-1)">更新于 ${updated}</div>
    </div>
    ${a ? `
    <div class="grid md:grid-cols-2 gap-4">
      <div class="card p-4">
        <div class="text-sm mb-2">${a.rec.sku}：实际报价 vs AI 合理区间</div>
        <div id="radar-band" style="height:240px"></div>
      </div>
      <div class="card p-5 flex flex-col justify-center">
        <div class="text-xs" style="color:var(--text-1)">AI 报价合理性判定</div>
        <div class="big-num text-4xl my-2" style="color:${meta.color}">${a.verdict} ${signedPct(a.deviation)}</div>
        <div class="text-sm" style="color:var(--text-1)">合理区间 ${a.low.toFixed(1)} ~ ${a.high.toFixed(1)}，实际 ${a.actual.toFixed(1)}</div>
        <div class="text-sm mt-2" style="color:${meta.color}">${meta.tip}</div>
      </div>
    </div>
    <div class="card p-4 mt-4" style="border:1px dashed var(--line)">
      <div class="text-sm" style="color:var(--text-1)">🔗 采购关系 × 行为 × 报价 关联分析</div>
      <div class="text-xs mt-1" style="color:var(--text-1)">接入真实采购/供应商/采购员数据后启用，可识别"系统性偏高报价"等议价漏洞线索。</div>
    </div>` : ""}`;

  if (a) {
    const chart = echarts.init(document.getElementById("radar-band"), "dark");
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: "category", data: ["合理下界", "合理价", "合理上界", "实际报价"], axisLabel: { color: "#9aa7c0" } },
      yAxis: { type: "value", scale: true, axisLabel: { color: "#9aa7c0" } },
      series: [{
        type: "bar",
        data: [
          { value: Number(a.low.toFixed(1)), itemStyle: { color: "#22c55e" } },
          { value: Number(a.reasonable.toFixed(1)), itemStyle: { color: "#3b82f6" } },
          { value: Number(a.high.toFixed(1)), itemStyle: { color: "#f59e0b" } },
          { value: Number(a.actual.toFixed(1)), itemStyle: { color: a.verdict === "偏高" ? "#ef4444" : "#9aa7c0" } }
        ]
      }]
    });
  }
}
```

- [ ] **Step 4: 浏览器目视核验**

后台 `python -m http.server 8000`，Playwright 打开 `http://localhost:8000/`：
- 「市场报价雷达」区出现行情条（沪铜/沪铝 + 实时/示例角标）+ 更新日期；
- 切连接器：右侧大字"偏高 +X%"红色 + 合理区间；band 图四根柱（下界绿/合理蓝/上界黄/实际，偏高时红）；下方虚线占位关联卡。
- 控制台无 JS 报错。截图存 `.shots/`。

- [ ] **Step 5: Commit** `feat: add market quote radar with AI reasonableness assessment`

---

## Task E4: 把"偏高"接入③风险预警 + README/验收

**Files:** Modify `src/components/alerts.js`（可选：偏高也作为一条软提醒）、Modify `README.md`（说明抓取与 Actions）

- [ ] **Step 1: README 增补**

```markdown
## 实时行情抓取
`node scripts/fetch-market.mjs` 抓沪铜/沪铝（新浪期货）写 `data/live-market.json`；
GitHub Actions（.github/workflows/daily-fetch.yml）每日自动跑并提交，Pages 自动刷新。
CCL/PCB/成交价为示例数据（角标标注），真实成交价待 ccgp/Dify 接入。
```

- [ ] **Step 2: 全量测试** `npm test` → 全绿（含 priceModel）。

- [ ] **Step 3: 浏览器终检（自测，硬要求）**

Playwright 跑全站：四区 + 市场报价雷达均正常；三条产品线切换联动；导出报告可用；控制台干净；视觉无明显错位；交互（切换、预设问答、雷达）可用。逐项记录，发现小错/视觉/交互问题就修。

- [ ] **Step 4: Commit** `docs: document scraper; v2 acceptance pass`

---

## 自查（对齐 spec §16.5）
- 报价合理性引擎 + 测试 → E1 ✅
- 真抓沪铜/沪铝 + seeded 标注 + Actions cron → E2 ✅
- 「市场报价雷达」看板（趋势/更新日期/band 图/关联占位）→ E3 ✅
- 浏览器自测无报错/视觉/交互 → E3/E4 ✅
