# 采购智能哨兵 ProcureSentinel 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯前端的深色数据驾驶舱网站，呈现金信诺三条主营产品线的采购横向/纵向对比与 LLM 驱动的异常预警，可一键导出经营分析报告，全程无需联网/无 API key 即可演示。

**Architecture:** 纯静态站点，无后端。确定性规则引擎（`src/lib`，纯 ESM，可 node 测试）负责所有数值计算与异常检测；LLM 层做可插拔设计，demo 默认读取预生成的 `data/insights.json`，保证零翻车。UI 组件（`src/components`）用原生 JS + ECharts 渲染，深色大屏视觉。数据真假混合：横向真实快照、纵向拟真合成。

**Tech Stack:** HTML + Tailwind(CDN) + ECharts(CDN) + 原生 ESM JavaScript；测试用 Node 内置 `node --test`；部署 GitHub Pages / 本地直接打开。

---

## 测试策略说明

- **核心逻辑（`stats.js` / `ruleEngine.js` / `format.js`）走 TDD**：这是真正有计算逻辑、值得测试的部分，用 `node --test` 跑。
- **UI 组件与数据文件走"构建 → 浏览器目视验证 → 提交"**：纯展示渲染不做脆弱的 DOM 单测，靠目视和验收清单把关（符合 web/testing 规则：视觉回归优先于脆弱标记断言）。

---

## 文件结构

```
procure-sentinel/
├── index.html                 # 单页驾驶舱主页面（4 区滚动）
├── report-template.html       # 《采购经营分析报告》模板
├── package.json               # {"type":"module"}，测试脚本
├── src/
│   ├── app.js                 # 入口：加载数据、产品线切换、装配各区
│   ├── lib/
│   │   ├── stats.js           # 统计：环比/均值/标准差/zscore/背离/偏离/集中度
│   │   ├── ruleEngine.js      # 确定性异常检测，输出结构化异常项
│   │   ├── format.js          # 金额(万)/百分比/带符号 格式化
│   │   ├── llmClient.js       # LLM 可插拔接口，默认读 insights.json
│   │   └── dataProvider.js    # 数据可插拔接口：JsonDataProvider(demo)/ApiDataProvider(未来)
│   ├── components/
│   │   ├── dashboard.js       # ① 经营驾驶舱（KPI 卡 + 降本金额 + 健康仪表盘）
│   │   ├── comparison.js      # ② 对比分析（横向+纵向 ECharts + 一句结论）
│   │   ├── alerts.js          # ③ 风险预警中心（LLM 解读卡）
│   │   ├── insights.js        # ④ 一键智能洞察（预设问题 + 3 条行动建议）
│   │   └── report.js          # 产物：生成报告 HTML
│   └── styles/
│       └── theme.css          # 深色大屏设计令牌
├── data/
│   ├── products.json          # 三条产品线主数据
│   ├── market.json            # 横向真实快照（原材料/同行）
│   ├── procurement.json       # 纵向拟真采购历史（含 3–5 条设计异常）
│   └── insights.json          # 预生成 LLM 解读（解读卡/预设答/行动建议）
└── tests/
    ├── stats.test.js
    ├── ruleEngine.test.js
    └── format.test.js
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/styles/theme.css`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "procure-sentinel",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

- [ ] **Step 2: 创建深色大屏设计令牌 src/styles/theme.css**

```css
:root {
  --bg-0: #0a0e1a;          /* 最底背景 */
  --bg-1: #111729;          /* 卡片表面 */
  --bg-2: #1a2238;          /* 抬升表面 */
  --line: #243049;          /* 分隔线 */
  --text-0: #e8edf7;        /* 主文字 */
  --text-1: #9aa7c0;        /* 次文字 */
  --accent: #3b82f6;        /* 科技蓝主色 */
  --accent-glow: #60a5fa;
  --risk-high: #ef4444;     /* 警示红 */
  --risk-mid: #f59e0b;      /* 琥珀黄 */
  --risk-low: #22c55e;      /* 正常绿 */
  --num: "Oswald", "DIN", sans-serif;

  --space-section: clamp(3rem, 2rem + 4vw, 6rem);
  --radius: 14px;
  --shadow-card: 0 8px 30px rgba(0,0,0,.35);
}

* { box-sizing: border-box; }
body {
  margin: 0;
  background:
    radial-gradient(1200px 600px at 80% -10%, rgba(59,130,246,.12), transparent),
    var(--bg-0);
  color: var(--text-0);
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}
.card {
  background: linear-gradient(180deg, var(--bg-1), var(--bg-0));
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}
.big-num { font-family: var(--num); font-weight: 700; letter-spacing: .5px; }
```

- [ ] **Step 3: 创建 index.html 骨架（CDN + 区块容器）**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>采购智能哨兵 ProcureSentinel</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="src/styles/theme.css" />
</head>
<body>
  <header class="px-8 py-5 flex items-center justify-between border-b" style="border-color:var(--line)">
    <div class="flex items-center gap-3">
      <span class="big-num text-2xl" style="color:var(--accent-glow)">采购智能哨兵</span>
      <span class="text-sm" style="color:var(--text-1)">ProcureSentinel · 经营决策驾驶舱</span>
    </div>
    <div id="product-switch" class="flex gap-2"></div>
  </header>

  <main class="px-8 py-6 space-y-12 max-w-[1400px] mx-auto">
    <section id="dashboard"></section>
    <section id="comparison"></section>
    <section id="alerts"></section>
    <section id="insights"></section>
  </main>

  <footer class="px-8 py-6 text-center text-xs" style="color:var(--text-1)">
    数据口径：横向为公开行情快照，纵向待接入贵司 ERP · 系统已就绪
  </footer>

  <script type="module" src="src/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: 目视验证骨架**

在浏览器打开 `index.html`。
Expected: 深色背景、顶部标题栏可见，控制台报错仅为 `src/app.js` 等尚未创建的 404（本任务可接受）。

- [ ] **Step 5: Commit**

```bash
git add package.json index.html src/styles/theme.css
git commit -m "chore: scaffold procure-sentinel static site shell"
```

---

## Task 2: 统计工具 stats.js（TDD）

**Files:**
- Create: `src/lib/stats.js`
- Test: `tests/stats.test.js`

- [ ] **Step 1: 写失败测试 tests/stats.test.js**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { pctChange, mean, std, zScore, divergence, peerDeviation, concentration } from "../src/lib/stats.js";

test("pctChange 计算环比涨跌幅", () => {
  assert.equal(pctChange(112, 100), 0.12);
  assert.equal(pctChange(90, 100), -0.1);
});

test("mean 与 std", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(Math.abs(std([2, 4, 6]) - 1.632993) < 1e-5);
});

test("zScore 偏离度", () => {
  assert.equal(zScore(4, [2, 4, 6]), 0);
  assert.ok(zScore(8, [2, 4, 6]) > 2);
});

test("divergence 价格涨幅减原材料涨幅", () => {
  assert.ok(Math.abs(divergence(0.14, 0.03) - 0.11) < 1e-9);
});

test("peerDeviation 相对同行均价偏离", () => {
  assert.ok(Math.abs(peerDeviation(12.8, 11.5) - 0.113043) < 1e-5);
});

test("concentration 返回最大供应商占比", () => {
  assert.equal(concentration([0.82, 0.1, 0.08]), 0.82);
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/stats.test.js`
Expected: FAIL，报错 `Cannot find module '../src/lib/stats.js'`

- [ ] **Step 3: 实现 src/lib/stats.js**

```js
// 纯统计工具，无副作用，浏览器与 node 通用 ESM。

export function pctChange(curr, prev) {
  if (prev === 0) return 0;
  return (curr - prev) / prev;
}

export function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function std(arr) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

export function zScore(value, arr) {
  const s = std(arr);
  if (s === 0) return 0;
  return (value - mean(arr)) / s;
}

// 价格涨幅 - 原材料涨幅；正值越大=成本背离越明显
export function divergence(pricePct, materialPct) {
  return pricePct - materialPct;
}

// 相对同行均价的偏离比例
export function peerDeviation(price, peerAvg) {
  if (peerAvg === 0) return 0;
  return (price - peerAvg) / peerAvg;
}

// 供应商占比数组中的最大值
export function concentration(shares) {
  return Math.max(...shares);
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --test tests/stats.test.js`
Expected: PASS，6 个测试全绿

- [ ] **Step 5: Commit**

```bash
git add src/lib/stats.js tests/stats.test.js
git commit -m "feat: add deterministic stats utilities with tests"
```

---

## Task 3: 格式化工具 format.js（TDD）

**Files:**
- Create: `src/lib/format.js`
- Test: `tests/format.test.js`

- [ ] **Step 1: 写失败测试 tests/format.test.js**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { wan, pct, signedPct } from "../src/lib/format.js";

test("wan 把元转成万元字符串", () => {
  assert.equal(wan(1280000), "128.0 万");
  assert.equal(wan(-560000), "-56.0 万");
});

test("pct 保留 1 位百分比", () => {
  assert.equal(pct(0.1234), "12.3%");
});

test("signedPct 带正负号", () => {
  assert.equal(signedPct(0.14), "+14.0%");
  assert.equal(signedPct(-0.1), "-10.0%");
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/format.test.js`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 src/lib/format.js**

```js
// 展示层格式化工具。

export function wan(yuan) {
  return (yuan / 10000).toFixed(1) + " 万";
}

export function pct(ratio) {
  return (ratio * 100).toFixed(1) + "%";
}

export function signedPct(ratio) {
  const sign = ratio >= 0 ? "+" : "";
  return sign + (ratio * 100).toFixed(1) + "%";
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --test tests/format.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.js tests/format.test.js
git commit -m "feat: add display formatting helpers with tests"
```

---

## Task 4: 数据文件

**Files:**
- Create: `data/products.json`
- Create: `data/market.json`
- Create: `data/procurement.json`
- Create: `data/insights.json`

> 横向数据用 WebSearch 取真实快照；纵向数据为拟真合成，须刻意埋入与解读卡一一对应的异常。

- [ ] **Step 1: 创建 data/products.json**

```json
{
  "productLines": [
    {
      "id": "cable",
      "name": "电缆及电缆组件",
      "materials": [{ "id": "copper", "name": "铜价" }, { "id": "pvc", "name": "PVC护套料" }],
      "peers": ["立讯精密", "亨通光电"]
    },
    {
      "id": "connector",
      "name": "连接器及连接系统",
      "materials": [{ "id": "copper", "name": "铜价" }, { "id": "gold", "name": "镀金" }],
      "peers": ["立讯精密", "中航光电"]
    },
    {
      "id": "pcb",
      "name": "PCB 印制电路板",
      "materials": [{ "id": "ccl", "name": "覆铜板CCL" }, { "id": "gold", "name": "金价" }],
      "peers": ["鹏鼎控股", "生益科技"]
    }
  ]
}
```

- [ ] **Step 2: 用 WebSearch 取横向真实快照，写入 data/market.json**

依次检索并记录近 4 个季度的真实数值（指数化到 Q1=100 亦可）：
- `LME 铜价 2025 2026 季度`
- `覆铜板 CCL 价格指数 2025 2026`
- `黄金价格 2025 2026 季度均价`
- `立讯精密 / 中航光电 / 鹏鼎控股 / 生益科技 毛利率 2025`

按下列结构写入（数值替换为检索到的真实快照，期次 4 期对齐）：

```json
{
  "periods": ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"],
  "materials": {
    "copper": [100, 103, 106, 109],
    "gold":   [100, 105, 112, 120],
    "ccl":    [100, 101, 102, 104],
    "pvc":    [100, 100, 101, 102]
  },
  "peerAvgPrice": {
    "cable":     [98, 99, 100, 101],
    "connector": [11.0, 11.2, 11.4, 11.5],
    "pcb":       [100, 101, 102, 103]
  },
  "_source": "WebSearch 快照，检索日期 2026-06-17，仅作 demo 锚点"
}
```

- [ ] **Step 3: 创建 data/procurement.json（纵向拟真，埋入异常）**

刻意设计：连接器供应商A成本背离（价 +14% vs 铜 +3%）、PCB 供应商集中度过高（82%）、电缆正常对照。

```json
{
  "periods": ["2025-Q3", "2025-Q4", "2026-Q1", "2026-Q2"],
  "records": [
    {
      "productLine": "connector", "sku": "高速背板连接器", "supplier": "供应商A",
      "unitPrice": [11.0, 11.2, 11.2, 12.8], "qty": [10000, 10200, 9800, 10000],
      "freq": [4, 4, 4, 4], "supplierShare": [0.5, 0.5, 0.5, 0.6], "amount": 12800000
    },
    {
      "productLine": "pcb", "sku": "高频高速板", "supplier": "供应商B",
      "unitPrice": [100, 101, 102, 104], "qty": [5000, 5200, 5300, 5400],
      "freq": [3, 3, 3, 3], "supplierShare": [0.7, 0.75, 0.8, 0.82], "amount": 5616000
    },
    {
      "productLine": "cable", "sku": "射频同轴电缆", "supplier": "供应商C",
      "unitPrice": [98, 99, 100, 101], "qty": [20000, 20500, 21000, 21000],
      "freq": [5, 5, 5, 5], "supplierShare": [0.4, 0.4, 0.4, 0.4], "amount": 2121000
    }
  ]
}
```

- [ ] **Step 4: 创建 data/insights.json（预生成 LLM 解读，键与异常对应）**

```json
{
  "anomalyCards": {
    "connector::高速背板连接器::供应商A": {
      "riskLevel": "high",
      "title": "高速背板连接器 · 供应商A",
      "conclusion": "本期采购单价异常上涨14%，原材料仅涨3%、同行均价低11%，成本背离明显。",
      "attribution": "涨幅无法由原材料解释，疑似供应商单方提价或议价权流失。",
      "suggestions": ["复盘该供应商近3期报价", "询比价引入替代供应商", "谈判要求成本拆解"],
      "notify": ["采购部负责人", "分管副总"]
    },
    "pcb::高频高速板::供应商B": {
      "riskLevel": "mid",
      "title": "高频高速板 · 供应商B",
      "conclusion": "该 SKU 对供应商B依赖度升至82%，超出70%安全线，供应链集中度风险偏高。",
      "attribution": "单一供应商占比持续走高，议价与断供风险同步上升。",
      "suggestions": ["启动二供导入", "约定保供与价格条款", "评估替代料"],
      "notify": ["采购部负责人", "供应链风控"]
    }
  },
  "presetAnswers": {
    "biggestRisk": "本季度最大风险来自连接器类目：供应商A单价背离原材料14个百分点，叠加PCB类目供应商集中度达82%。建议优先处置这两项。",
    "costPressure": "PCB类目受覆铜板与金价上行驱动成本压力最大，但当前采购价仍与市场同步，属可控；连接器类目则是议价问题而非材料问题。",
    "savingOpp": "连接器二供导入预计可压回约8%单价，PCB分散采购可降低断供溢价，合计潜在年化降本可观。"
  },
  "execActions": [
    "对连接器类目供应商A启动询比价与二供导入，目标压回议价空间。",
    "对PCB高频高速板分散采购、签订保供条款，将集中度降至70%以下。",
    "建立原材料-采购价联动看板，对成本背离>10%的SKU自动预警。"
  ]
}
```

- [ ] **Step 5: 校验 JSON 合法性**

Run: `node -e "['products','market','procurement','insights'].forEach(f=>JSON.parse(require('fs').readFileSync('data/'+f+'.json','utf8')));console.log('all json valid')"`
Expected: 输出 `all json valid`

- [ ] **Step 6: Commit**

```bash
git add data/
git commit -m "feat: add product/market/procurement/insights demo datasets"
```

---

## Task 5: 规则引擎 ruleEngine.js（TDD）

**Files:**
- Create: `src/lib/ruleEngine.js`
- Test: `tests/ruleEngine.test.js`

- [ ] **Step 1: 写失败测试 tests/ruleEngine.test.js**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies, DEFAULT_CONFIG } from "../src/lib/ruleEngine.js";

const market = {
  periods: ["P1", "P2", "P3", "P4"],
  materials: { copper: [100, 101, 102, 103], gold: [100, 100, 100, 100] },
  peerAvgPrice: { connector: [11.0, 11.2, 11.4, 11.5] }
};

const records = [
  {
    productLine: "connector", sku: "高速背板连接器", supplier: "供应商A",
    unitPrice: [11.0, 11.2, 11.2, 12.8], qty: [10000, 10200, 9800, 10000],
    freq: [4, 4, 4, 4], supplierShare: [0.5, 0.5, 0.5, 0.6], amount: 12800000
  }
];

test("检出成本背离异常并给出高风险", () => {
  const products = [{ id: "connector", name: "连接器", materials: [{ id: "copper" }] }];
  const out = detectAnomalies(records, market, products, DEFAULT_CONFIG);
  assert.equal(out.length, 1);
  const a = out[0];
  assert.equal(a.key, "connector::高速背板连接器::供应商A");
  assert.ok(a.triggeredRules.includes("成本背离"));
  assert.ok(a.triggeredRules.includes("环比异动"));
  assert.equal(a.riskLevel, "high");
  assert.ok(Math.abs(a.metrics.pricePct - 0.142857) < 1e-4);
});

test("供应商集中度超阈值触发规则", () => {
  const recs = [{
    productLine: "pcb", sku: "板", supplier: "供应商B",
    unitPrice: [100, 101, 102, 103], qty: [1, 1, 1, 1],
    freq: [3, 3, 3, 3], supplierShare: [0.7, 0.75, 0.8, 0.82], amount: 1
  }];
  const products = [{ id: "pcb", name: "PCB", materials: [{ id: "ccl" }] }];
  const mkt = { ...market, materials: { ...market.materials, ccl: [100, 101, 102, 103] }, peerAvgPrice: { pcb: [100, 101, 102, 103] } };
  const out = detectAnomalies(recs, mkt, products, DEFAULT_CONFIG);
  assert.ok(out[0].triggeredRules.includes("供应商集中度"));
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `node --test tests/ruleEngine.test.js`
Expected: FAIL，模块不存在

- [ ] **Step 3: 实现 src/lib/ruleEngine.js**

```js
import { pctChange, divergence, peerDeviation, concentration } from "./stats.js";

export const DEFAULT_CONFIG = {
  momThreshold: 0.10,        // 环比异动阈值
  divergenceThreshold: 0.08, // 成本背离阈值
  peerThreshold: 0.05,       // 同行偏离阈值
  concentrationThreshold: 0.70 // 供应商集中度阈值
};

// 取产品线第一个原材料的环比作为材料涨幅代理
function materialPct(productLine, market, products) {
  const product = products.find((p) => p.id === productLine);
  const matId = product?.materials?.[0]?.id;
  const series = market.materials[matId];
  if (!series || series.length < 2) return 0;
  return pctChange(series.at(-1), series.at(-2));
}

function classify(triggeredRules, metrics) {
  const strong = triggeredRules.includes("成本背离") || triggeredRules.includes("同行偏离");
  if (triggeredRules.length >= 2 && strong) return "high";
  if (Math.abs(metrics.divergence) > 0.10) return "high";
  if (triggeredRules.length >= 1) return "mid";
  return "low";
}

export function detectAnomalies(records, market, products, config = DEFAULT_CONFIG) {
  const out = [];
  for (const r of records) {
    const price = r.unitPrice.at(-1);
    const prevPrice = r.unitPrice.at(-2);
    const pricePct = pctChange(price, prevPrice);
    const matPct = materialPct(r.productLine, market, products);
    const div = divergence(pricePct, matPct);
    const peerSeries = market.peerAvgPrice[r.productLine] || [];
    const peerAvg = peerSeries.at(-1) ?? price;
    const peerDev = peerDeviation(price, peerAvg);
    const conc = concentration(r.supplierShare);

    const triggeredRules = [];
    if (Math.abs(pricePct) > config.momThreshold) triggeredRules.push("环比异动");
    if (div > config.divergenceThreshold) triggeredRules.push("成本背离");
    if (peerDev > config.peerThreshold) triggeredRules.push("同行偏离");
    if (conc > config.concentrationThreshold) triggeredRules.push("供应商集中度");

    if (triggeredRules.length === 0) continue;

    const metrics = { price, pricePct, materialPct: matPct, divergence: div, peerAvg, peerDev, concentration: conc };
    out.push({
      key: `${r.productLine}::${r.sku}::${r.supplier}`,
      productLine: r.productLine,
      sku: r.sku,
      supplier: r.supplier,
      metrics,
      triggeredRules,
      riskLevel: classify(triggeredRules, metrics)
    });
  }
  return out;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `node --test tests/ruleEngine.test.js`
Expected: PASS，2 个测试全绿

- [ ] **Step 5: 运行全量测试**

Run: `npm test`
Expected: stats / format / ruleEngine 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/ruleEngine.js tests/ruleEngine.test.js
git commit -m "feat: add rule engine for deterministic anomaly detection"
```

---

## Task 6: LLM 可插拔客户端 llmClient.js

**Files:**
- Create: `src/lib/llmClient.js`

- [ ] **Step 1: 实现 src/lib/llmClient.js**

```js
// LLM 可插拔层：demo 默认读预生成 insights.json，零翻车。
// 未来切实时：把 source 换成对 Dify/Claude 的 fetch，签名不变。

export function createLlmClient(insights) {
  return {
    // 取某条异常的解读卡；无预生成时用规则结果兜底，绝不留空。
    getAnomalyCard(anomaly) {
      const hit = insights.anomalyCards?.[anomaly.key];
      if (hit) return hit;
      return {
        riskLevel: anomaly.riskLevel,
        title: `${anomaly.sku} · ${anomaly.supplier}`,
        conclusion: `命中规则：${anomaly.triggeredRules.join("、")}，需关注。`,
        attribution: "由规则引擎判定，待 LLM 接入后生成归因。",
        suggestions: ["复盘报价", "询比价", "评估替代供应商"],
        notify: ["采购部负责人"]
      };
    },
    getPresetAnswer(id) {
      return insights.presetAnswers?.[id] ?? "暂无该问题的预生成洞察。";
    },
    getExecActions() {
      return insights.execActions ?? [];
    }
  };
}
```

- [ ] **Step 2: 目视/节点验证导入正常**

Run: `node -e "import('./src/lib/llmClient.js').then(m=>console.log(typeof m.createLlmClient))"`
Expected: 输出 `function`

- [ ] **Step 3: Commit**

```bash
git add src/lib/llmClient.js
git commit -m "feat: add pluggable LLM client backed by pre-generated insights"
```

---

## Task 6b: 数据访问层 dataProvider.js（可插拔，对齐 spec §14）

**Files:**
- Create: `src/lib/dataProvider.js`

> demo 用 `JsonDataProvider` 读本地 JSON；接口签名与 spec §14 REST/Schema 一致，未来加 `ApiDataProvider` 即可零改动切换。

- [ ] **Step 1: 实现 src/lib/dataProvider.js**

```js
// 数据可插拔层（仓储模式）。demo: JsonDataProvider；未来: ApiDataProvider。
// 两者实现同一接口，规则引擎与 UI 不感知数据来自 JSON 还是真实 API。

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`加载失败：${path}`);
  return res.json();
}

// Demo 实现：读本地 data/*.json
export class JsonDataProvider {
  constructor(base = "data") { this.base = base; }
  async getProductLines() { return (await loadJson(`${this.base}/products.json`)).productLines; }
  async getProcurement() { return (await loadJson(`${this.base}/procurement.json`)); }
  async getMarket() { return (await loadJson(`${this.base}/market.json`)); }
  async getInsights() { return (await loadJson(`${this.base}/insights.json`)); }
  // demo 仅本地反馈；未来 ApiDataProvider 改为 POST /api/v1/alerts
  async pushAlert(card) { console.info("[demo] 预警推送：", card.title); return { delivered: true }; }
}

// 未来真实接口实现骨架（先留位，不在 demo 启用）。
export class ApiDataProvider {
  constructor(baseUrl) { this.baseUrl = baseUrl; }
  async getProductLines() { return (await (await fetch(`${this.baseUrl}/api/v1/product-lines`)).json()).data; }
  async getProcurement(productLine, from, to) {
    const q = new URLSearchParams({ productLine: productLine ?? "", from: from ?? "", to: to ?? "" });
    return (await (await fetch(`${this.baseUrl}/api/v1/procurement?${q}`)).json()).data;
  }
  async getMarket() { throw new Error("ApiDataProvider 待系统对接后实现"); }
  async getInsights() { throw new Error("接入实时 LLM 后实现"); }
  async pushAlert(card) {
    const res = await fetch(`${this.baseUrl}/api/v1/alerts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card)
    });
    return (await res.json()).data;
  }
}
```

- [ ] **Step 2: 节点验证导入正常**

Run: `node -e "import('./src/lib/dataProvider.js').then(m=>console.log(typeof m.JsonDataProvider, typeof m.ApiDataProvider))"`
Expected: 输出 `function function`

- [ ] **Step 3: Commit**

```bash
git add src/lib/dataProvider.js
git commit -m "feat: add pluggable data provider (Json demo / Api future) per spec section 14"
```

---

## Task 7: 应用入口与数据装配 app.js

**Files:**
- Create: `src/app.js`

- [ ] **Step 1: 实现 src/app.js（加载数据 + 产品线切换 + 调用各区渲染）**

```js
import { detectAnomalies, DEFAULT_CONFIG } from "./lib/ruleEngine.js";
import { createLlmClient } from "./lib/llmClient.js";
import { JsonDataProvider } from "./lib/dataProvider.js";
import { renderDashboard } from "./components/dashboard.js";
import { renderComparison } from "./components/comparison.js";
import { renderAlerts } from "./components/alerts.js";
import { renderInsights } from "./components/insights.js";

// 切换真实接口时，仅改这一行为 new ApiDataProvider(baseUrl)
const provider = new JsonDataProvider();

const state = { products: null, market: null, procurement: null, insights: null, current: "cable", anomalies: [], llm: null };

function renderSwitch() {
  const el = document.getElementById("product-switch");
  el.innerHTML = "";
  for (const p of state.products.productLines) {
    const btn = document.createElement("button");
    btn.textContent = p.name;
    btn.className = "px-4 py-2 rounded-lg text-sm transition";
    btn.style.cssText = p.id === state.current
      ? "background:var(--accent);color:#fff"
      : "background:var(--bg-2);color:var(--text-1)";
    btn.onclick = () => { state.current = p.id; renderAll(); };
    el.appendChild(btn);
  }
}

function renderAll() {
  renderSwitch();
  const ctx = {
    productLine: state.current,
    products: state.products.productLines,
    market: state.market,
    procurement: state.procurement,
    anomalies: state.anomalies.filter((a) => a.productLine === state.current),
    allAnomalies: state.anomalies,
    llm: state.llm
  };
  renderDashboard(document.getElementById("dashboard"), ctx);
  renderComparison(document.getElementById("comparison"), ctx);
  renderAlerts(document.getElementById("alerts"), ctx);
  renderInsights(document.getElementById("insights"), ctx);
}

async function main() {
  const [productLines, market, procurement, insights] = await Promise.all([
    provider.getProductLines(),
    provider.getMarket(),
    provider.getProcurement(),
    provider.getInsights()
  ]);
  state.products = { productLines };
  state.market = market;
  state.procurement = procurement;
  state.insights = insights;
  state.anomalies = detectAnomalies(procurement.records, market, productLines, DEFAULT_CONFIG);
  state.llm = createLlmClient(insights);
  renderAll();
}

main().catch((e) => {
  document.getElementById("dashboard").innerHTML = `<p style="color:var(--risk-high)">${e.message}（请用本地服务器打开，见 README）</p>`;
});
```

- [ ] **Step 2: 先建占位组件以便加载（临时）**

为让页面可加载，先创建四个组件文件各导出空渲染函数（后续任务替换实现）：

```js
// 临时占位：src/components/dashboard.js / comparison.js / alerts.js / insights.js
export function renderDashboard(el) { el.innerHTML = "<p>dashboard</p>"; }
```
（comparison/alerts/insights 同理改函数名 renderComparison / renderAlerts / renderInsights）

- [ ] **Step 3: 用本地服务器打开验证装配**

Run: `python -m http.server 8000`（在项目根目录）
浏览器访问 `http://localhost:8000/`
Expected: 顶部出现三个产品线切换按钮，四个区显示占位文字，控制台无报错

- [ ] **Step 4: Commit**

```bash
git add src/app.js src/components/
git commit -m "feat: wire data loading, product switch and section assembly"
```

---

## Task 8: 经营驾驶舱组件 dashboard.js

**Files:**
- Modify: `src/components/dashboard.js`

- [ ] **Step 1: 实现 renderDashboard（KPI 卡 + 降本金额 + 健康仪表盘）**

```js
import { wan, signedPct } from "../lib/format.js";

// 计算本产品线的汇总指标
function summarize(ctx) {
  const recs = ctx.procurement.records.filter((r) => r.productLine === ctx.productLine);
  const totalAmount = recs.reduce((s, r) => s + r.amount, 0);
  const anomalyCount = ctx.anomalies.length;
  // 降本/超支：用异常项的背离金额估算（背离比例 × 金额），正=超支
  let overspend = 0;
  for (const a of ctx.anomalies) {
    const rec = recs.find((r) => r.sku === a.sku && r.supplier === a.supplier);
    if (rec && a.metrics.divergence > 0) overspend += rec.amount * a.metrics.divergence;
  }
  const health = anomalyCount === 0 ? 90 : Math.max(30, 90 - anomalyCount * 20 - (overspend > 0 ? 15 : 0));
  return { totalAmount, anomalyCount, overspend, health };
}

function kpiCard(label, value, sub, color) {
  return `<div class="card p-5">
    <div class="text-xs mb-2" style="color:var(--text-1)">${label}</div>
    <div class="big-num text-3xl" style="color:${color || "var(--text-0)"}">${value}</div>
    <div class="text-xs mt-1" style="color:var(--text-1)">${sub || ""}</div>
  </div>`;
}

export function renderDashboard(el, ctx) {
  const s = summarize(ctx);
  const overColor = s.overspend > 0 ? "var(--risk-high)" : "var(--risk-low)";
  const overLabel = s.overspend > 0 ? "本期超支" : "本期成本可控";
  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">① 经营驾驶舱</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      ${kpiCard("本期采购总额", wan(s.totalAmount), "当前产品线", "var(--accent-glow)")}
      ${kpiCard(overLabel, wan(Math.abs(s.overspend)), "成本背离估算", overColor)}
      ${kpiCard("异常项数量", s.anomalyCount, "规则引擎检出", s.anomalyCount ? "var(--risk-mid)" : "var(--risk-low)")}
      ${kpiCard("采购健康度", s.health, "综合评分", s.health >= 70 ? "var(--risk-low)" : "var(--risk-mid)")}
    </div>
    <div id="health-gauge" class="card mt-4" style="height:220px"></div>`;

  const chart = echarts.init(document.getElementById("health-gauge"), "dark");
  chart.setOption({
    backgroundColor: "transparent",
    series: [{
      type: "gauge", min: 0, max: 100,
      progress: { show: true, width: 14 },
      axisLine: { lineStyle: { width: 14, color: [[0.5, "#ef4444"], [0.7, "#f59e0b"], [1, "#22c55e"]] } },
      pointer: { width: 5 },
      detail: { formatter: "{value} 分", color: "#e8edf7", fontSize: 22 },
      data: [{ value: s.health, name: "采购健康度" }],
      title: { color: "#9aa7c0" }
    }]
  });
}
```

- [ ] **Step 2: 目视验证**

刷新 `http://localhost:8000/`，切换三条产品线。
Expected: 四张 KPI 卡数字随产品线变化；连接器/PCB 显示超支与异常，电缆显示成本可控；健康仪表盘指针对应分值

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard.js
git commit -m "feat: implement executive dashboard with KPIs and health gauge"
```

---

## Task 9: 对比分析组件 comparison.js

**Files:**
- Modify: `src/components/comparison.js`

- [ ] **Step 1: 实现 renderComparison（横向+纵向 ECharts + 一句结论）**

```js
import { signedPct } from "../lib/format.js";
import { pctChange } from "../lib/stats.js";

// 生成一句结论：采购价 vs 同行
function verdict(ctx, rec) {
  const peer = ctx.market.peerAvgPrice[ctx.productLine] || [];
  const peerLast = peer.at(-1);
  const price = rec.unitPrice.at(-1);
  if (peerLast == null) return "暂无同行对标数据。";
  const dev = (price - peerLast) / peerLast;
  return dev > 0
    ? `当前采购价高于行业均价 ${signedPct(dev)}，议价存在改善空间。`
    : `采购成本控制优于行业 ${signedPct(-dev)}，表现良好。`;
}

export function renderComparison(el, ctx) {
  const rec = ctx.procurement.records.find((r) => r.productLine === ctx.productLine);
  const periods = ctx.market.periods;
  const product = ctx.products.find((p) => p.id === ctx.productLine);
  const matId = product.materials[0].id;
  const matSeries = ctx.market.materials[matId];
  const peerSeries = ctx.market.peerAvgPrice[ctx.productLine] || [];

  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">② 对比分析（横向 · 纵向）</h2>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="card p-4">
        <div class="text-sm mb-2">横向：采购价 vs ${product.materials[0].name} vs 同行</div>
        <div id="chart-h" style="height:280px"></div>
        <p class="text-sm mt-2" style="color:var(--accent-glow)">${verdict(ctx, rec)}</p>
      </div>
      <div class="card p-4">
        <div class="text-sm mb-2">纵向：${rec.sku} 历史价格/数量/频次</div>
        <div id="chart-v" style="height:280px"></div>
        <p class="text-sm mt-2" style="color:var(--accent-glow)">单价环比 ${signedPct(pctChange(rec.unitPrice.at(-1), rec.unitPrice.at(-2)))}，采购频次稳定。</p>
      </div>
    </div>`;

  const base = { backgroundColor: "transparent", textStyle: { color: "#9aa7c0" }, legend: { textStyle: { color: "#9aa7c0" } }, grid: { left: 40, right: 20, top: 30, bottom: 30 } };

  echarts.init(document.getElementById("chart-h"), "dark").setOption({
    ...base, tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: periods },
    yAxis: { type: "value", scale: true },
    series: [
      { name: "采购价(指数)", type: "line", smooth: true, data: normalize(rec.unitPrice), color: "#3b82f6" },
      { name: product.materials[0].name, type: "line", smooth: true, data: normalize(matSeries), color: "#f59e0b" },
      { name: "同行均价(指数)", type: "line", smooth: true, data: normalize(peerSeries), color: "#22c55e" }
    ]
  });

  echarts.init(document.getElementById("chart-v"), "dark").setOption({
    ...base, tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: periods },
    yAxis: [{ type: "value", scale: true }, { type: "value", scale: true }],
    series: [
      { name: "单价", type: "line", smooth: true, data: rec.unitPrice, color: "#3b82f6" },
      { name: "数量", type: "bar", yAxisIndex: 1, data: rec.qty, color: "#243049" }
    ]
  });
}

// 指数化到首期=100，便于不同量纲同图对比
function normalize(arr) {
  if (!arr || !arr.length) return [];
  const base = arr[0];
  return arr.map((v) => Number(((v / base) * 100).toFixed(1)));
}
```

- [ ] **Step 2: 目视验证**

刷新页面，切换产品线。
Expected: 左图三条曲线同图（采购价/材料/同行，指数化），下方一句结论随偏离方向变化；右图价格折线 + 数量柱

- [ ] **Step 3: Commit**

```bash
git add src/components/comparison.js
git commit -m "feat: implement horizontal/vertical comparison charts with verdicts"
```

---

## Task 10: 风险预警中心组件 alerts.js

**Files:**
- Modify: `src/components/alerts.js`

- [ ] **Step 1: 实现 renderAlerts（LLM 解读卡）**

```js
import { signedPct, pct } from "../lib/format.js";

const RISK_META = {
  high: { color: "var(--risk-high)", dot: "🔴", label: "高风险" },
  mid: { color: "var(--risk-mid)", dot: "🟡", label: "中风险" },
  low: { color: "var(--risk-low)", dot: "🟢", label: "低风险" }
};

function card(anomaly, llm) {
  const c = llm.getAnomalyCard(anomaly);
  const meta = RISK_META[c.riskLevel] || RISK_META.mid;
  const m = anomaly.metrics;
  return `<div class="card p-5" style="border-left:4px solid ${meta.color}">
    <div class="flex items-center justify-between mb-2">
      <span class="font-semibold">${meta.dot} ${c.title}</span>
      <span class="text-xs px-2 py-1 rounded" style="background:${meta.color}22;color:${meta.color}">${meta.label}</span>
    </div>
    <div class="text-xs mb-2" style="color:var(--text-1)">
      单价环比 ${signedPct(m.pricePct)} · 材料 ${signedPct(m.materialPct)} · 同行偏离 ${signedPct(m.peerDev)} · 集中度 ${pct(m.concentration)}
    </div>
    <p class="text-sm mb-1"><b>结论：</b>${c.conclusion}</p>
    <p class="text-sm mb-1" style="color:var(--text-1)"><b>归因：</b>${c.attribution}</p>
    <p class="text-sm mb-1"><b>建议：</b>${c.suggestions.map((s) => `<span class="inline-block mr-2">· ${s}</span>`).join("")}</p>
    <p class="text-xs mt-2" style="color:var(--accent-glow)">提醒对象：${c.notify.join(" / ")}</p>
  </div>`;
}

export function renderAlerts(el, ctx) {
  const items = ctx.anomalies;
  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">③ 风险预警中心</h2>
    ${items.length === 0
      ? `<div class="card p-5" style="color:var(--risk-low)">🟢 当前产品线无异常，采购健康。</div>`
      : `<div class="grid md:grid-cols-2 gap-4">${items.map((a) => card(a, ctx.llm)).join("")}</div>`}`;
}
```

- [ ] **Step 2: 目视验证**

切到连接器/PCB。
Expected: 连接器出现 🔴 高风险背离卡（结论/归因/建议/提醒对象齐全），PCB 出现 🟡 集中度卡；电缆显示绿色无异常

- [ ] **Step 3: Commit**

```bash
git add src/components/alerts.js
git commit -m "feat: implement risk alert center with LLM interpretation cards"
```

---

## Task 11: 一键智能洞察组件 insights.js

**Files:**
- Modify: `src/components/insights.js`

- [ ] **Step 1: 实现 renderInsights（预设问题按钮 + 3 条行动建议）**

```js
const PRESETS = [
  { id: "biggestRisk", q: "本季度采购最大风险是什么？" },
  { id: "costPressure", q: "哪条产品线成本压力最大？" },
  { id: "savingOpp", q: "有哪些降本机会？" }
];

export function renderInsights(el, ctx) {
  const actions = ctx.llm.getExecActions();
  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">④ 一键智能洞察</h2>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="card p-5">
        <div class="text-sm mb-3" style="color:var(--text-1)">点击问题，获取战略洞察：</div>
        <div id="preset-btns" class="flex flex-wrap gap-2 mb-4"></div>
        <div id="preset-answer" class="text-sm p-4 rounded" style="background:var(--bg-2);min-height:80px;color:var(--text-0)">
          请选择一个问题…
        </div>
      </div>
      <div class="card p-5">
        <div class="text-sm mb-3" style="color:var(--accent-glow)">📋 给管理层的 3 条行动建议</div>
        <ol class="space-y-3">
          ${actions.map((a, i) => `<li class="flex gap-3 text-sm">
            <span class="big-num" style="color:var(--accent-glow)">${i + 1}</span>
            <span>${a}</span></li>`).join("")}
        </ol>
      </div>
    </div>`;

  const btnWrap = document.getElementById("preset-btns");
  const answer = document.getElementById("preset-answer");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.textContent = p.q;
    b.className = "px-3 py-2 rounded-lg text-xs";
    b.style.cssText = "background:var(--bg-2);color:var(--text-0);border:1px solid var(--line)";
    b.onclick = () => { answer.textContent = ctx.llm.getPresetAnswer(p.id); };
    btnWrap.appendChild(b);
  }
}
```

- [ ] **Step 2: 目视验证**

Expected: 左侧三个问题按钮，点击后下方显示对应预生成洞察；右侧显示编号 1/2/3 的行动建议

- [ ] **Step 3: Commit**

```bash
git add src/components/insights.js
git commit -m "feat: implement smart insights with preset Q&A and exec actions"
```

---

## Task 12: 报告产物 report.js + report-template.html

**Files:**
- Create: `report-template.html`
- Modify: `src/components/report.js`
- Modify: `index.html`（加一个"导出报告"按钮）
- Modify: `src/app.js`（绑定导出）

- [ ] **Step 1: 创建 report-template.html（独立可转发报告骨架）**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>采购经营分析报告</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; max-width: 880px; margin: 40px auto; color: #1a2238; }
    h1 { color: #1e3a8a; } h2 { border-left: 4px solid #3b82f6; padding-left: 10px; }
    .risk-high { color: #dc2626; } .risk-mid { color: #d97706; }
    .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 10px 0; }
    ol li { margin: 8px 0; }
  </style>
</head>
<body>
  <h1>采购经营分析报告</h1>
  <p id="meta"></p>
  <div id="report-body"></div>
</body>
</html>
```

- [ ] **Step 2: 实现 src/components/report.js（用当前数据拼报告 HTML 并触发下载）**

```js
import { wan, signedPct } from "../lib/format.js";

function buildBody(ctx) {
  const cards = ctx.allAnomalies.map((a) => {
    const c = ctx.llm.getAnomalyCard(a);
    const cls = c.riskLevel === "high" ? "risk-high" : "risk-mid";
    return `<div class="card"><b class="${cls}">${c.title}</b>
      <p>结论：${c.conclusion}</p><p>建议：${c.suggestions.join("；")}</p>
      <p>提醒：${c.notify.join(" / ")}</p></div>`;
  }).join("");
  const actions = ctx.llm.getExecActions().map((a) => `<li>${a}</li>`).join("");
  return `<h2>一、风险预警汇总（${ctx.allAnomalies.length} 项）</h2>${cards}
    <h2>二、给管理层的行动建议</h2><ol>${actions}</ol>`;
}

export async function exportReport(ctx) {
  const tpl = await (await fetch("report-template.html")).text();
  const meta = `生成时间：${new Date().toLocaleString("zh-CN")} · 数据口径：横向公开行情 + 纵向拟真`;
  const html = tpl
    .replace('<p id="meta"></p>', `<p id="meta">${meta}</p>`)
    .replace('<div id="report-body"></div>', `<div id="report-body">${buildBody(ctx)}</div>`);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "采购经营分析报告.html";
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: 在 index.html 顶栏加导出按钮**

把 `<div id="product-switch" class="flex gap-2"></div>` 替换为：

```html
<div class="flex items-center gap-3">
  <div id="product-switch" class="flex gap-2"></div>
  <button id="export-btn" class="px-4 py-2 rounded-lg text-sm" style="background:var(--accent);color:#fff">导出报告</button>
</div>
```

- [ ] **Step 4: 在 app.js 绑定导出（用全量异常）**

在 `src/app.js` 顶部加导入：

```js
import { exportReport } from "./components/report.js";
```

在 `renderAll()` 函数体末尾追加：

```js
  document.getElementById("export-btn").onclick = () => exportReport({
    allAnomalies: state.anomalies, llm: state.llm
  });
```

- [ ] **Step 5: 目视验证**

点"导出报告"。
Expected: 浏览器下载 `采购经营分析报告.html`，打开后含全部异常卡 + 3 条行动建议，样式干净可转发

- [ ] **Step 6: Commit**

```bash
git add report-template.html src/components/report.js index.html src/app.js
git commit -m "feat: add one-click procurement report export"
```

---

## Task 13: 视觉打磨与最终验收

**Files:**
- Modify: 视需要微调 `src/styles/theme.css`、各组件
- Create: `README.md`

- [ ] **Step 1: 创建 README.md（运行说明）**

```markdown
# 采购智能哨兵 ProcureSentinel

管理层采购决策驾驶舱 Demo（Stage1）。纯前端，无后端。

## 运行
需用本地服务器打开（fetch 加载 JSON）：
\`\`\`bash
python -m http.server 8000
# 访问 http://localhost:8000/
\`\`\`

## 测试
\`\`\`bash
npm test
\`\`\`

## 数据口径
横向=公开行情快照，纵向=拟真合成。接入 ERP 即实时运行。
```

- [ ] **Step 2: 按验收清单逐项目视核对**

逐条确认（对应 spec §12）：
- [ ] 三条产品线可切换，每条都有横向+纵向对比图
- [ ] 驾驶舱有"降本/超支金额"大数字与健康仪表盘
- [ ] 风险预警中心 ≥3 张 LLM 解读卡，含高风险案例
- [ ] 一键智能洞察可用（预设问题 + 3 条行动建议）
- [ ] 可一键导出报告 HTML
- [ ] 深色大屏视觉，无模板廉价感
- [ ] 全程离线（关闭网络后除 CDN 字体/库外功能正常）

- [ ] **Step 3: 跑全量测试确保未回归**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
git add README.md src/styles/theme.css src/components/
git commit -m "polish: visual refinements, README and acceptance pass"
```

---

## 自查记录（spec 覆盖核对）

- spec §3 三产品线 → Task 4/7（切换）✅
- spec §5 ① 驾驶舱（含降本金额、仪表盘）→ Task 8 ✅
- spec §5 ② 对比分析（横纵+一句结论）→ Task 9 ✅
- spec §5 ③ 风险预警（LLM 卡+集中度）→ Task 5/10 ✅
- spec §5 ④ 智能洞察（预设问答+3 建议）→ Task 11 ✅
- spec §5 产物 报告 → Task 12 ✅
- spec §6 数据模型 → Task 4 ✅
- spec §7 规则引擎 → Task 5 ✅
- spec §8 LLM I/O → Task 4(insights)/6(client)/10/11 ✅
- spec §9 深色大屏视觉 → Task 1/13 ✅
- spec §11 离线零翻车（预生成解读）→ Task 6/13 ✅
- spec §12 验收 → Task 13 ✅
- spec §14 接口契约/可插拔数据层 → Task 6b（dataProvider，签名对齐 §14.2~14.7）+ Task 7（app.js 经 provider 取数）✅
```
