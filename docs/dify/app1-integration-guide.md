# App1 采购诊断工作流 · 前端集成对接规格

> 版本：v1.0 · 日期：2026-06-18 · 状态：**已真机实测通过**
> 适用：把已部署的 Dify App1（采购诊断 Workflow）按契约接入 procure-sentinel 前端。
> 配套文件：数据契约 `contracts.schema.json`、总体规格 `dify-integration-spec.md`、工作流 DSL `app1_diagnosis.yml`。
> 读者：负责实现前端集成代码的工程师 / AI。本文档是**对接命门**，字段名与结构不可擅改。

---

## 0. 这份文档解决什么

App1 已在本地 Dify 部署并实测通过：输入**一条**规则引擎判定好的采购异常（JSON 字符串），输出**结构化诊断**（结论/根因/对策/提醒对象/置信度）。本文档给出：

1. 精确的请求/响应契约（含实测样例，可直接复制）。
2. 输出到前端 `insights.anomalyCards[key]` 的字段映射。
3. **边界与失败处理纪律**（实测发现的坑，必须实现，否则 demo 会显示空诊断）。
4. 集成代码骨架与验收清单。

**铁律（不可违背）**：procure-sentinel 算数，App1 只解读。`riskLevel/title` 由前端规则引擎填，AI 产出的字段绝不覆盖它们；AI 也绝不重算或编造数字。

---

## 1. 接口契约

### 1.1 Endpoint

```
POST  {DIFY_BASE_URL}/workflows/run
```

- `DIFY_BASE_URL` 实测值：`http://localhost/v1`（本地自托管，注意已含 `/v1` 前缀）。
- 部署到别的机器时只改这个环境变量，路径不变。

### 1.2 请求头

```
Authorization: Bearer {DIFY_APP1_KEY}
Content-Type: application/json
```

- `DIFY_APP1_KEY` 形如 `app-xxxxxxxxxxxxxxxx`，**只放 `.env` / GitHub Secret，绝不进前端代码或仓库**。

### 1.3 请求体

```jsonc
{
  "inputs": {
    "anomaly_json": "<一条异常的 JSON 字符串>"   // 注意：是字符串，不是对象
  },
  "response_mode": "blocking",                  // 同步拿结果，最简单
  "user": "procure-sentinel"                    // 任意稳定标识，用于 Dify 侧用量统计
}
```

> **关键坑**：`anomaly_json` 的值是一段 **JSON 字符串**（开始节点变量类型为 paragraph/段落），不是嵌套对象。即对 AnomalyInput 对象先 `JSON.stringify()` 再放进去。

### 1.4 响应体（实测结构）

```jsonc
{
  "task_id": "e5a52bbf-...",
  "workflow_run_id": "420c52af-...",
  "data": {
    "id": "420c52af-...",
    "workflow_id": "13fce0bc-...",
    "status": "succeeded",        // 见 §3 失败处理：succeeded 不等于诊断有效
    "outputs": {                  // ← 真正要消费的诊断结果在这里
      "conclusion": "...",
      "attribution": "...",
      "suggestions": ["...", "..."],
      "notify": ["采购部负责人", "分管副总"],
      "confidence": 0.92
    },
    "error": null,
    "elapsed_time": 6.17,         // 秒，实测单次 5~9s
    "total_tokens": 683,
    "total_steps": 4
  }
}
```

前端只需读取 `resp.data.outputs`。

---

## 2. 数据契约（字段级，权威定义见 contracts.schema.json）

### 2.1 输入 · AnomalyInput（前端规则引擎产出）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `key` | string | 是 | 唯一键 `productLine::sku::supplier`，如 `connector::高速背板连接器::供应商A` |
| `sku` | string | 是 | 物料名 |
| `supplier` | string | 是 | 供应商名 |
| `product_line` | string | 是 | 枚举 `cable` / `connector` / `pcb` |
| `risk_level` | string | 是 | 枚举 `high` / `mid` / `low`，规则引擎判定，**AI 不改** |
| `material_name` | string | 是 | 主材料名，如 `铜` / `覆铜板CCL` / `金` |
| `triggered_rules` | string[] | 是 | 命中规则，取值 `环比异动` / `成本背离` / `同行偏离` / `供应商集中度` |
| `metrics` | object | 是 | 已算好的指标，见下 |
| `metrics.price` | number | 是 | 本期单价（元） |
| `metrics.price_pct` | number | 是 | 单价环比，小数（0.143 = +14.3%） |
| `metrics.material_pct` | number | 是 | 原材料环比，小数 |
| `metrics.divergence` | number | 是 | `price_pct - material_pct` |
| `metrics.peer_dev` | number | 是 | 相对同行均价偏离，小数 |
| `metrics.concentration` | number | 是 | 供应商集中度，0~1 |

> 实测：即使 `metrics` 字段不全或缺 `material_name`，App1 也不会崩，会基于现有字段诊断且不编造缺失数字（见用例 C）。但生产环境应按上表传全，保证诊断质量。

### 2.2 输出 · DiagnosisOutput（App1 产出）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `conclusion` | string | 结论先行，引用输入里的关键数字 | 见 §3：**为空即判失败** |
| `attribution` | string | — | 根因分析 |
| `suggestions` | string[] | 2~4 条 | 可执行对策 |
| `notify` | string[] | 枚举内 | 取值 `采购部负责人` / `分管副总` / `供应链风控` / `财务` |
| `confidence` | number | 0~1 | AI 确信度；**解析失败兜底为 0.7，不可单独采信，见 §3** |

---

## 3. 失败处理与守卫纪律（必须实现）

实测发现：**`data.status === "succeeded"` 不能作为诊断有效的唯一判据。** 当输入非法或 LLM 输出无法解析时，工作流的 Code 节点会兜底返回**空字段 + `confidence: 0.7`**（见边界用例 D），状态仍是 `succeeded`。若前端直接采信，会渲染出"空诊断卡 + 置信度 70%"的误导结果。

**前端必须实现以下守卫（按顺序判定）：**

```
诊断有效 ⟺  data.status === "succeeded"
            && outputs.conclusion 是非空字符串
            && Array.isArray(outputs.suggestions) && outputs.suggestions.length >= 1
```

任一不满足 → 视为 **AI 失败**，该异常卡**回退规则引擎兜底文案**，并标 `aiGenerated: false`。**单条失败绝不中断整批**——继续处理下一条异常。

| 失败场景 | 表现 | 前端动作 |
|---------|------|---------|
| HTTP 非 2xx / 网络错误 | 请求抛错 | catch → 该卡回退兜底，`aiGenerated:false` |
| `status !== "succeeded"` | data.error 有值 | 同上 |
| `status==succeeded` 但 `conclusion===""` | 空诊断（用例 D） | 同上，**忽略那个 0.7 的 confidence** |
| 字段类型异常（suggestions 非数组等） | — | 同上 |

> 兜底文案沿用前端现有 `llmClient` 的规则兜底逻辑，保证任何情况下 `insights.json` 都可用、demo 不崩。

---

## 4. 输出到前端 insights.json 的映射

诊断结果合并进 `insights.anomalyCards[key]`，key 用 AnomalyInput 的 `key`：

```jsonc
"anomalyCards": {
  "connector::高速背板连接器::供应商A": {
    // —— 以下两项由前端规则引擎填，AI 不碰 ——
    "riskLevel": "high",
    "title": "高速背板连接器 · 供应商A",
    // —— 以下来自 App1 outputs ——
    "conclusion":  outputs.conclusion,
    "attribution": outputs.attribution,
    "suggestions": outputs.suggestions,
    "notify":      outputs.notify,
    "confidence":  outputs.confidence,   // 新增字段，老前端忽略不报错
    // —— 组装时打标 ——
    "aiGenerated": true                  // 成功为 true；回退兜底时为 false
  }
}
```

> 兼容性：`riskLevel/title/conclusion/attribution/suggestions/notify` 是现有前端**已消费字段，名称不可变**；`confidence/aiGenerated` 为新增可选字段。

---

## 5. 集成代码骨架（供实现参考，Node/ESM）

```js
// scripts/dify-generate.mjs（节选：App1 调用 + 守卫 + 兜底）
const BASE = process.env.DIFY_BASE_URL;        // http://localhost/v1
const APP1 = process.env.DIFY_APP1_KEY;        // app-xxxx，来自 Secret

async function diagnoseAnomaly(anomaly) {
  try {
    const res = await fetch(`${BASE}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${APP1}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: { anomaly_json: JSON.stringify(anomaly) }, // 注意：字符串化
        response_mode: "blocking",
        user: "procure-sentinel",
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    const o = data?.outputs ?? {};

    // —— §3 守卫 ——
    const valid =
      data?.status === "succeeded" &&
      typeof o.conclusion === "string" && o.conclusion.trim() !== "" &&
      Array.isArray(o.suggestions) && o.suggestions.length >= 1;
    if (!valid) return null;          // 交由调用方回退兜底

    return {
      conclusion: o.conclusion,
      attribution: o.attribution ?? "",
      suggestions: o.suggestions,
      notify: Array.isArray(o.notify) ? o.notify : [],
      confidence: typeof o.confidence === "number" ? o.confidence : null,
    };
  } catch (e) {
    console.warn("App1 调用失败，回退兜底:", e.message);
    return null;                       // 不抛出，保证整批不中断
  }
}

// 组装：
// for (const anomaly of anomalies) {
//   const ai = await diagnoseAnomaly(anomaly);
//   cards[anomaly.key] = ai
//     ? { riskLevel: anomaly.risk_level, title: makeTitle(anomaly), ...ai, aiGenerated: true }
//     : { riskLevel: anomaly.risk_level, title: makeTitle(anomaly), ...ruleFallback(anomaly), aiGenerated: false };
// }
```

> 顺序处理即可（单次 5~9s）；如需提速可对多条异常做有限并发（建议并发度 ≤ 3，避免本地 LLM 过载）。

---

## 6. 实测样例（可直接拿去对拍）

### 6.1 高风险（命中 3 规则）

**请求 inputs.anomaly_json**（字符串化前的对象）：
```json
{"key":"connector::高速背板连接器::供应商A","sku":"高速背板连接器","supplier":"供应商A","product_line":"connector","risk_level":"high","material_name":"铜","triggered_rules":["环比异动","成本背离","同行偏离"],"metrics":{"price":12.8,"price_pct":0.143,"material_pct":-0.038,"divergence":0.181,"peer_dev":0.113,"concentration":0.6}}
```

**实测 outputs**：
```json
{
  "conclusion": "高速背板连接器采购单价环比上涨14.3%，但同期主要材料铜的成本反而下降3.8%，成本与价格背离高达18.1个百分点，且该供应商同业对比价格偏高11.3%，存在明显不合理涨价。",
  "attribution": "供应商A利用其在高速背板连接器领域的集中供应地位（集中度60%）进行机会性涨价，或内部报价基准未随原材料成本同步调整。",
  "suggestions": ["立即启动与供应商A的价格重谈，要求以当前铜价成本为基础重新核定报价，并将铜价联动条款写入合同。", "协同技术部门评估替代方案或引入第二供应商，降低对供应商A的过度依赖。", "暂停新订单审批，直至价格回归合理区间，并开展横向成本对标审计。"],
  "notify": ["采购部负责人", "分管副总", "供应链风控"],
  "confidence": 0.92
}
```

### 6.2 低风险

输入 `risk_level:"low"`、`price_pct:0.01`、`peer_dev:0.02` → 实测 `confidence: 0.3`，`notify: ["采购部负责人"]`，文案保守。

### 6.3 非法输入（守卫触发点）

输入 `anomaly_json: "这不是JSON"` → `status:"succeeded"` 但 `conclusion:""`、`suggestions:[]`、`confidence:0.7`。**前端按 §3 守卫判失败、回退兜底。**

---

## 7. 验收清单

- [ ] `DIFY_BASE_URL` / `DIFY_APP1_KEY` 来自环境变量，全仓库 grep 不到明文 key。
- [ ] 用 §6.1 样例调通，`outputs` 五字段齐全且数字与输入一致（无编造）。
- [ ] 实现 §3 守卫：空 `conclusion` 判失败并回退兜底，不采信兜底的 0.7 confidence。
- [ ] 任一异常调用失败（网络/状态/空诊断）时整批不中断，失败卡 `aiGenerated:false`。
- [ ] 映射进 `insights.anomalyCards[key]`，`riskLevel/title` 用本地值未被 AI 覆盖。
- [ ] `confidence/aiGenerated` 为新增可选字段，老前端忽略不报错。
- [ ] 生成的 `insights.json` 通过 `contracts.schema.json#InsightsFile` 校验。

---

## 8. 待确认 / 已知约束

1. **本地自托管 Dify (`http://localhost`) GitHub 云端 Action 调不通**：需本地定时跑 `dify-generate.mjs` 后提交，或用 self-hosted runner。规格不变，仅运行位置变。
2. **temperature 0.2 有轻微随机性**：字段结构每次稳定，文案措辞会小幅变化、confidence 可能 ±0.1 浮动。前端只依赖字段名，不受影响；若需完全可复现可在 DSL 中将 temperature 调 0。
3. **App2（经营洞察）/ App3（关联分析）尚未部署**：本文档只覆盖 App1。`insights.presetAnswers / execActions / correlation` 的对接待 App2/App3 就绪后另出规格（契约已在 `contracts.schema.json` 预定义）。
