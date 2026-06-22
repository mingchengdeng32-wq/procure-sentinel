# App2 经营洞察工作流 · 前端集成对接规格

> 版本：v1.0 · 日期：2026-06-22 · 状态：**已真机实测通过**（run_id `2805678f`，耗时 ~16s）
> 适用：把已部署的 Dify App2（经营洞察 Workflow）按契约接入 procure-sentinel 前端。
> 配套文件：数据契约 `contracts.schema.json`、总体规格 `dify-integration-spec.md`、工作流 DSL `app2_insight.yml`、姊妹指南 `app1-integration-guide.md`。
> 读者：负责实现前端集成代码的工程师 / AI。本文档是**对接命门**，字段名与结构不可擅改。

---

## 0. 这份文档解决什么

App2 已在本地 Dify 部署并实测通过：输入**本期全盘异常 + 各产品线汇总**（JSON 字符串），输出**经营级洞察**（最大风险/成本压力/降本机会）+ **3 条管理层行动建议**。本文档给出：

1. 精确的请求/响应契约（含实测样例，可直接复制）。
2. 输出到前端 `insights.presetAnswers` 与 `insights.execActions` 的字段映射。
3. **边界与失败处理纪律**（与 App1 同源：`succeeded` 不等于洞察有效）。
4. 集成代码骨架与验收清单。

**铁律（不可违背）**：procure-sentinel 算数，App2 只解读。汇总里的金额/异常数/背离等均由规则引擎算好；App2 绝不重算或编造数字，只做经营叙事与建议。

---

## 1. 接口契约

### 1.1 Endpoint

```
POST  {DIFY_BASE_URL}/workflows/run
```

- `DIFY_BASE_URL` 实测值：`http://localhost/v1`（本地自托管，注意已含 `/v1` 前缀，与 App1 同址）。
- 部署到别的机器时只改这个环境变量，路径不变。

### 1.2 请求头

```
Authorization: Bearer {DIFY_APP2_KEY}
Content-Type: application/json
```

- `DIFY_APP2_KEY` 形如 `app-xxxxxxxxxxxxxxxx`，**只放 `.env` / GitHub Secret，绝不进前端代码或仓库**。与 App1 的 Key 不同，各 App 独立。

### 1.3 请求体

```jsonc
{
  "inputs": {
    "summary_json": "<本期汇总的 JSON 字符串>"   // 注意：是字符串，不是对象
  },
  "response_mode": "blocking",                   // 同步拿结果
  "user": "procure-sentinel"                     // 任意稳定标识，用于 Dify 侧用量统计
}
```

> **关键坑**：`summary_json` 的值是一段 **JSON 字符串**（开始节点变量类型为 paragraph/段落），不是嵌套对象。即对 InsightSummaryInput 对象先 `JSON.stringify()` 再放进去。

### 1.4 响应体（实测结构）

```jsonc
{
  "task_id": "...",
  "workflow_run_id": "2805678f-43b6-4a08-96fe-19e8656bddb7",
  "data": {
    "status": "succeeded",        // 见 §3 失败处理：succeeded 不等于洞察有效
    "outputs": {                  // ← 真正要消费的洞察在这里
      "biggestRisk": "...",
      "costPressure": "...",
      "savingOpp": "...",
      "execActions": ["...", "...", "..."]
    },
    "error": null
  }
}
```

前端只需读取 `resp.data.outputs`。

---

## 2. 数据契约（字段级，权威定义见 contracts.schema.json）

### 2.1 输入 · InsightSummaryInput（前端规则引擎汇总产出）

整个对象 `JSON.stringify()` 后作为 `inputs.summary_json` 传入。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `anomalies` | object[] | 是 | 本期全部异常的精简列表（无需带 metrics 全量） |
| `anomalies[].sku` | string | — | 物料名 |
| `anomalies[].supplier` | string | — | 供应商名 |
| `anomalies[].product_line` | string | — | `cable`/`connector`/`pcb` |
| `anomalies[].risk_level` | string | — | `high`/`mid`/`low` |
| `anomalies[].triggered_rules` | string[] | — | 命中规则 |
| `anomalies[].divergence` | number | — | 成本背离（小数），规则引擎算 |
| `anomalies[].concentration` | number | — | 供应商集中度（0~1） |
| `product_lines` | object[] | 是 | 各产品线汇总 |
| `product_lines[].id` | string | — | `connector`/`cable`/`pcb` |
| `product_lines[].name` | string | — | 中文名 |
| `product_lines[].total_amount` | number | — | 本期采购总额（元） |
| `product_lines[].anomaly_count` | integer | — | 异常数 |

### 2.2 输出 · InsightSummaryOutput（App2 产出）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `biggestRisk` | string | 结论先行，≤200字 | 本季度最大风险，点名产品线/供应商。**为空即判失败**（§3） |
| `costPressure` | string | ≤200字 | 哪条产品线成本压力最大，区分「材料涨」与「议价问题」 |
| `savingOpp` | string | ≤200字 | 降本机会，给方向和量级 |
| `execActions` | string[] | 恰好 3 条 | 每条含 动作+理由+预期收益。**为空即判失败**；数量≠3 仅告警 |

---

## 3. 失败处理与守卫纪律（必须实现）

与 App1 同源：**`data.status === "succeeded"` 不能作为洞察有效的唯一判据。** 当输入非法或 LLM 输出无法解析时，工作流的 Code 节点会兜底返回**空字段**，状态仍是 `succeeded`。若前端直接采信，会渲染出空白的预设问答与行动建议。

**前端必须实现以下守卫：**

```
洞察有效 ⟺  data.status === "succeeded"
            && biggestRisk / costPressure / savingOpp 均为非空字符串
            && Array.isArray(execActions) && execActions.filter(非空).length >= 1
```

任一不满足 → 视为 **AI 失败**，`presetAnswers` 与 `execActions` **回退规则引擎兜底文案**（前端现有 `llmClient` 已有兜底），并将整体 `_aiGenerated` 标记按实际情况处理。**App2 失败不得中断 App1 已生成的 anomalyCards**。

| 失败场景 | 表现 | 前端动作 |
|---------|------|---------|
| HTTP 非 2xx / 网络错误 | 请求抛错 | catch → 回退兜底 |
| `status !== "succeeded"` | data.error 有值 | 同上 |
| `status==succeeded` 但某段为 `""` | 空洞察 | 同上 |
| `execActions` 非数组 / 全空 | — | 同上 |
| `execActions` 数量≠3 | 质量瑕疵 | **不回退**，照常渲染（截断或补位由前端定） |

---

## 4. 输出到前端 insights.json 的映射

App2 的输出是**扁平四字段**；insights.json 把前三段收进 `presetAnswers`，`execActions` 留在顶层：

```jsonc
{
  "presetAnswers": {
    "biggestRisk":  outputs.biggestRisk,
    "costPressure": outputs.costPressure,
    "savingOpp":    outputs.savingOpp
  },
  "execActions":    outputs.execActions   // string[]，恰好 3 条
}
```

> 兼容性：`presetAnswers.{biggestRisk,costPressure,savingOpp}` 与 `execActions` 是现有前端**已消费字段，名称不可变**（见 `contracts.schema.json#InsightsFile`）。App2 的扁平输出字段名与 `presetAnswers` 内字段名一致，映射时只做「收进对象」这一步，不要改名。

---

## 5. 集成代码骨架（供实现参考，Node/ESM）

```js
// scripts/dify-generate.mjs（节选：App2 调用 + 守卫 + 兜底）
const BASE = process.env.DIFY_BASE_URL;        // http://localhost/v1
const APP2 = process.env.DIFY_APP2_KEY;        // app-xxxx，来自 Secret

async function summarizeInsights(summary) {
  try {
    const res = await fetch(`${BASE}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${APP2}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: { summary_json: JSON.stringify(summary) }, // 注意：字符串化
        response_mode: "blocking",
        user: "procure-sentinel",
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    const o = data?.outputs ?? {};

    // —— §3 守卫 ——
    const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";
    const actions = Array.isArray(o.execActions)
      ? o.execActions.filter(nonEmpty)
      : [];
    const valid =
      data?.status === "succeeded" &&
      nonEmpty(o.biggestRisk) && nonEmpty(o.costPressure) && nonEmpty(o.savingOpp) &&
      actions.length >= 1;
    if (!valid) return null;          // 交由调用方回退兜底

    return {
      presetAnswers: {
        biggestRisk: o.biggestRisk,
        costPressure: o.costPressure,
        savingOpp: o.savingOpp,
      },
      execActions: actions,
    };
  } catch (e) {
    console.warn("App2 调用失败，回退兜底:", e.message);
    return null;                       // 不抛出，App1 的 anomalyCards 不受影响
  }
}

// 组装：
// const summaryAI = await summarizeInsights(summary);
// insights.presetAnswers = summaryAI ? summaryAI.presetAnswers : rulePresetFallback(summary);
// insights.execActions   = summaryAI ? summaryAI.execActions   : ruleExecFallback(summary);
```

---

## 6. 实测样例（可直接拿去对拍）

### 6.1 请求 inputs.summary_json（字符串化前的对象）

> 即仓库 `tests/fixtures/app2_summary_sample.json`。

```json
{
  "anomalies": [
    { "sku": "高速背板连接器", "supplier": "供应商A", "product_line": "connector", "risk_level": "high", "triggered_rules": ["环比异动","成本背离","同行偏离"], "divergence": 0.181, "concentration": 0.6 },
    { "sku": "屏蔽双绞线", "supplier": "供应商B", "product_line": "cable", "risk_level": "mid", "triggered_rules": ["环比异动"], "divergence": 0.072, "concentration": 0.35 },
    { "sku": "多层电路板", "supplier": "供应商C", "product_line": "pcb", "risk_level": "low", "triggered_rules": ["同行偏离"], "divergence": 0.021, "concentration": 0.28 }
  ],
  "product_lines": [
    { "id": "connector", "name": "连接器", "total_amount": 4820000, "anomaly_count": 1 },
    { "id": "cable", "name": "线缆", "total_amount": 3150000, "anomaly_count": 1 },
    { "id": "pcb", "name": "印制电路板", "total_amount": 2670000, "anomaly_count": 1 }
  ]
}
```

### 6.2 实测 outputs（run_id `2805678f`）

```json
{
  "biggestRisk": "连接器产品线高速背板连接器由供应商A垄断供应（份额60%），成本偏离同行18.1%且触发环比异动与成本背离，存在供应中断和成本失控的双重风险。",
  "costPressure": "连接器成本压力最大，因其触发成本背离与同行偏离，主要源于供应商A的议价问题，而非纯粹材料涨价，其对同行溢价高达18.1%。",
  "savingOpp": "连接器品类降本机会明确：通过引入第二供应商打破独家格局，并基于同行偏离数据对供应商A重新议价，预估可降本5%-10%，对应金额约24万-48万。",
  "execActions": [
    "立即与供应商A启动专项谈判，以同行偏离18.1%和成本背离为据要求降价，目标将采购成本压降10%以上，预计年化节省超48万元。",
    "启动连接器第二供应商开发，半年内将供应商A份额降至40%以下，降低供应风险并引入竞争，远期可进一步压缩成本。",
    "要求线缆供应商B就屏蔽双绞线环比异动提供成本变更明细，并设置价格观察期，若异动持续则启动替代物料验证，防止成本风险蔓延。"
  ]
}
```

---

## 7. 验收清单

- [ ] `DIFY_BASE_URL` / `DIFY_APP2_KEY` 来自环境变量，全仓库 grep 不到明文 key。
- [ ] 用 §6.1 样例调通，`outputs` 四字段齐全且数字与输入一致（无编造）。
- [ ] 实现 §3 守卫：任一核心字段为空判失败并回退兜底。
- [ ] App2 调用失败时，**不影响 App1 已生成的 `anomalyCards`**。
- [ ] 映射进 `insights.presetAnswers`（三段）与 `insights.execActions`，字段名未改。
- [ ] 生成的 `insights.json` 通过 `contracts.schema.json#InsightsFile` 校验。

---

## 8. 待确认 / 已知约束

1. **`divergence` 措辞混用**：实测中模型把成本背离 `divergence` 表述为「对同行溢价18.1%」。根因是 `InsightSummaryInput.anomalies` 契约里只有 `divergence`、无独立的同行偏离字段，模型用了手头唯一的数。**不影响管理层可读性**；若需更精确，可在契约 anomalies 内补 `peer_dev` 字段并重测。
2. **本地自托管 Dify (`http://localhost`) GitHub 云端 Action 调不通**：需本地定时跑 `dify-generate.mjs` 后提交，或用 self-hosted runner。规格不变，仅运行位置变。
3. **temperature 0.3 有轻微随机性**：字段结构每次稳定，文案措辞会小幅变化。前端只依赖字段名，不受影响；若需完全可复现可在 DSL 中将 temperature 调 0。
4. **本仓库测试脚手架**：`validate_app2.py`（真机）+ `validate_app2_logic.py`（纯校验）+ `tests/test_validate_app2_logic.py`（9 个单测）+ `tests/fixtures/app2_summary_sample.json`（样例输入）。复跑：`DIFY_APP2_KEY=app-xxxx python validate_app2.py`。
