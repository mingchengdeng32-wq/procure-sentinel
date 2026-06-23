# App3 关联分析工作流 · 前端集成对接规格

> 版本：v1.0 · 日期：2026-06-22 · 状态：**已真机实测通过**（run_id `dd5f4ab9`，耗时 ~24s）
> 适用：把已部署的 Dify App3（关联分析 Workflow）按契约接入 procure-sentinel 前端的 ⑨ 关联分析区。
> 配套文件：数据契约 `contracts.schema.json`、总体规格 `dify-integration-spec.md`、工作流 DSL `app3_correlation.yml`、姊妹指南 `app1-integration-guide.md` / `app2-integration-guide.md`。
> 读者：负责实现前端集成代码的工程师 / AI。本文档是**对接命门**，字段名与结构不可擅改。

---

## 0. 这份文档解决什么

App3 已在 Dify 部署并实测通过：输入**procure-sentinel 已算好的多维特征**（报价与材料相关系数、相对同行溢价、集中度趋势等），输出**关联发现 + 议价漏洞线索**。本文档给出：

1. 精确的请求/响应契约（含实测样例，可直接复制）。
2. 输出到前端 `insights.correlation` 的字段映射。
3. **边界与失败处理纪律**（与 App1/App2 同源：`succeeded` 不等于结果有效）。
4. 集成代码骨架与验收清单。

**铁律（不可违背）**：procure-sentinel 算数，App3 只叙述。相关系数/溢价/集中度趋势等特征全部由规则引擎先算好；App3 **绝不计算或编造数据**，只把特征讲成管理层能懂的发现。对外措辞走「帮采购议价/优化」，而非「查采购」，降低组织敏感度。

---

## 1. 接口契约

### 1.1 Endpoint

```
POST  {DIFY_BASE_URL}/workflows/run
```

- `DIFY_BASE_URL` 实测值：`http://your-dify-host/v1`（自托管 Dify 在服务器 your-dify-host，注意已含 `/v1` 前缀）。
- **不要用 `http://localhost`**：localhost 仅在临时端口转发时可达，会断；真机地址是 `your-dify-host`。
- 部署到别的机器时只改这个环境变量，路径不变。

### 1.2 请求头

```
Authorization: Bearer {DIFY_APP3_KEY}
Content-Type: application/json
```

- `DIFY_APP3_KEY` 形如 `app-xxxxxxxxxxxxxxxx`，**只放 `.env` / GitHub Secret，绝不进前端代码或仓库**。与 App1/App2 的 Key 不同，各 App 独立。

### 1.3 请求体

```jsonc
{
  "inputs": {
    "features_json": "<多维特征的 JSON 字符串>"   // 注意：是字符串，不是对象
  },
  "response_mode": "blocking",                    // 同步拿结果
  "user": "procure-sentinel"                      // 任意稳定标识，用于 Dify 侧用量统计
}
```

> **关键坑**：`features_json` 的值是一段 **JSON 字符串**（开始节点变量类型为 paragraph/段落），不是嵌套对象。即对 CorrelationInput 对象先 `JSON.stringify()` 再放进去。

### 1.4 响应体（实测结构）

```jsonc
{
  "task_id": "...",
  "workflow_run_id": "dd5f4ab9-25e0-4c93-8bbf-6421ff60275a",
  "data": {
    "status": "succeeded",        // 见 §3 失败处理：succeeded 不等于结果有效
    "outputs": {                  // ← 真正要消费的关联发现在这里
      "findings": [
        { "title": "...", "detail": "...", "severity": "high", "lead": "..." }
      ],
      "summary": "..."
    },
    "error": null
  }
}
```

前端只需读取 `resp.data.outputs`。

---

## 2. 数据契约（字段级，权威定义见 contracts.schema.json）

### 2.1 输入 · CorrelationInput（前端规则引擎产出，AI 不计算）

整个对象 `JSON.stringify()` 后作为 `inputs.features_json` 传入。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `by_supplier` | object[] | 是 | 按供应商的多维特征列表 |
| `by_supplier[].supplier` | string | — | 供应商名 |
| `by_supplier[].product_line` | string | — | `cable`/`connector`/`pcb` |
| `by_supplier[].price_material_corr` | number | — | 报价与原材料价相关系数（-1~1），**我方算** |
| `by_supplier[].concentration_trend` | string | — | 集中度趋势，枚举 `上升`/`持平`/`下降` |
| `by_supplier[].premium_vs_peer` | number | — | 相对同行溢价（小数，0.113=+11.3%） |
| `by_supplier[].price_trend` | string | — | 价格趋势叙述，如 `逆势上涨`/`随行就市` |
| `by_supplier[].buyer` | string \| null | — | 经手采购员，待真实数据，可为 null |
| `notes` | string | 否 | 补充说明（如本期材料价走势），帮助 AI 叙述 |

### 2.2 输出 · CorrelationOutput（App3 产出）

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `findings` | object[] | 至少 1 条有效 | 关联发现列表。**全空即判失败**（§3） |
| `findings[].title` | string | 非空 | 发现标题 |
| `findings[].detail` | string | 非空，引用特征值 | 具体说明 |
| `findings[].severity` | string | `high`/`mid`/`low` | 严重度；越界仅告警 |
| `findings[].lead` | string | 可空 | 可处置的议价/优化线索 |
| `summary` | string | 非空 | 一句话总览。**为空即判失败** |

---

## 3. 失败处理与守卫纪律（必须实现）

与 App1/App2 同源：**`data.status === "succeeded"` 不能作为结果有效的唯一判据。** 当输入非法或 LLM 输出无法解析时，工作流的 Code 节点会兜底返回**空 findings**，状态仍是 `succeeded`。

**前端必须实现以下守卫：**

```
关联有效 ⟺  data.status === "succeeded"
            && Array.isArray(findings)
            && findings.filter(有效).length >= 1     // 有效 = title 与 detail 均非空
            && summary 为非空字符串
```

任一不满足 → 视为 **AI 失败**，⑨ 关联分析区**保持原占位文案**，不渲染空白发现。**App3 失败不得中断 App1/App2 已生成的内容**。

| 失败场景 | 表现 | 前端动作 |
|---------|------|---------|
| HTTP 非 2xx / 网络错误 | 请求抛错 | catch → 保持占位 |
| `status !== "succeeded"` | data.error 有值 | 同上 |
| `findings` 全空 / summary 空 | 兜底空结果 | 同上 |
| 单条 finding 缺 title/detail | — | 跳过该条，其余照常渲染 |
| `severity` 越界 | 质量瑕疵 | 色条降级处理，照常渲染 |

---

## 4. 输出到前端 insights.json 的映射

App3 输出直接落进 `insights.correlation`（可选区块，老前端忽略不报错）：

```jsonc
{
  "correlation": {
    "findings": outputs.findings,   // [{ title, detail, severity, lead }]
    "summary":  outputs.summary
  }
}
```

> 兼容性：`correlation` 是 `contracts.schema.json#InsightsFile` 里的**新增可选区块**。前端 ⑨ 关联分析区：有值时渲染真实 `findings`（标题 / detail / severity 色条 / lead）并打 `✨AI关联` 角标；无值或守卫失败时保持占位文案。

---

## 5. 集成代码骨架（供实现参考，Node/ESM）

```js
// scripts/dify-generate.mjs（节选：App3 调用 + 守卫 + 兜底）
const BASE = process.env.DIFY_BASE_URL;        // http://your-dify-host/v1
const APP3 = process.env.DIFY_APP3_KEY;        // app-xxxx，来自 Secret

async function correlate(features) {
  try {
    const res = await fetch(`${BASE}/workflows/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${APP3}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: { features_json: JSON.stringify(features) }, // 注意：字符串化
        response_mode: "blocking",
        user: "procure-sentinel",
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { data } = await res.json();
    const o = data?.outputs ?? {};

    // —— §3 守卫 ——
    const nonEmpty = (s) => typeof s === "string" && s.trim() !== "";
    const findings = Array.isArray(o.findings)
      ? o.findings.filter((f) => f && nonEmpty(f.title) && nonEmpty(f.detail))
      : [];
    const valid =
      data?.status === "succeeded" && findings.length >= 1 && nonEmpty(o.summary);
    if (!valid) return null;          // 交由调用方保持占位

    return { findings, summary: o.summary };
  } catch (e) {
    console.warn("App3 调用失败，关联区保持占位:", e.message);
    return null;                       // 不抛出，App1/App2 内容不受影响
  }
}

// 组装：
// const corr = await correlate(features);
// if (corr) insights.correlation = corr;   // 无值则不写该区块，前端保持占位
```

---

## 6. 实测样例（可直接拿去对拍）

### 6.1 请求 inputs.features_json（字符串化前的对象）

> 即仓库 `tests/fixtures/app3_features_sample.json`。

```json
{
  "by_supplier": [
    { "supplier": "供应商A", "product_line": "connector", "price_material_corr": 0.08, "concentration_trend": "上升", "premium_vs_peer": 0.113, "price_trend": "逆势上涨", "buyer": null },
    { "supplier": "供应商B", "product_line": "cable", "price_material_corr": 0.82, "concentration_trend": "持平", "premium_vs_peer": 0.015, "price_trend": "随行就市", "buyer": null },
    { "supplier": "供应商C", "product_line": "pcb", "price_material_corr": 0.41, "concentration_trend": "下降", "premium_vs_peer": 0.064, "price_trend": "随行就市", "buyer": null }
  ],
  "notes": "本期铜价下行约4%，覆铜板CCL小幅上涨；相关系数基于近6期报价与材料价计算。"
}
```

### 6.2 实测 outputs（run_id `dd5f4ab9`）

```json
{
  "findings": [
    {
      "title": "供应商A报价与成本严重脱钩，溢价与集中度双高，构成显著议价漏洞",
      "detail": "供应商A的报价与原材料价格相关系数仅0.08，表明近6期报价几乎未跟随材料成本变化；在铜价下行约4%的背景下，其价格逆势上涨，溢价较同行高出11.3%。同时，采购集中度呈上升趋势，进一步削弱议价筹码。",
      "severity": "high",
      "lead": "建议复盘供应商A的报价调整逻辑，结合铜价下行窗口启动价格重谈，并评估引入替代供应商、分散采购集中度的可行性。"
    },
    {
      "title": "供应商C报价与材料价关联度偏弱，存在温和溢价",
      "detail": "供应商C的报价与原材料价格相关系数为0.41，溢价较同行高6.4%。尽管价格趋势随行就市，但成本传导效率仍有提升空间，集中度下降趋势为比价议价创造了条件。",
      "severity": "low",
      "lead": "可建立更透明的价格联动机制，定期对标材料价变动，推动供应商C缩小溢价空间。"
    }
  ],
  "summary": "供应商A出现报价与材料价脱钩、逆势上涨、高溢价和集中度上升的四重风险信号，需优先开展议价攻坚；供应商B表现正常，供应商C存在轻度优化空间。"
}
```

> 注意：实测中 App3 正确**忽略了供应商B**（corr=0.82、溢价1.5%、随行就市，属正常），未硬造发现——说明它在真读特征而非套模板。

---

## 7. 验收清单

- [ ] `DIFY_BASE_URL`（=`http://your-dify-host/v1`）/ `DIFY_APP3_KEY` 来自环境变量，全仓库 grep 不到明文 key。
- [ ] 用 §6.1 样例调通，`findings` 引用的特征值与输入一致（无编造）。
- [ ] 实现 §3 守卫：findings 全空 / summary 空判失败，⑨ 关联区保持占位。
- [ ] App3 调用失败时，**不影响 App1/App2 已生成的内容**。
- [ ] 映射进 `insights.correlation`，字段名（findings/title/detail/severity/lead/summary）未改。
- [ ] 生成的 `insights.json` 通过 `contracts.schema.json#InsightsFile` 校验。

---

## 8. 待确认 / 已知约束

1. **buyer 字段待真实数据**：当前样例 `buyer: null`。接入真实采购员数据后，App3 可在 lead 中点名经手人——但需评估组织敏感度，建议先内部灰度。
2. **本地自托管 Dify GitHub 云端 Action 调不通**：需本地定时跑 `dify-generate.mjs` 后提交，或用 self-hosted runner。规格不变，仅运行位置变。
3. **temperature 0.3 有轻微随机性**：字段结构每次稳定，发现条数与文案措辞会小幅变化。前端只依赖字段名，不受影响；若需完全可复现可在 DSL 中将 temperature 调 0。
4. **本仓库测试脚手架**：`validate_app3.py`（真机）+ `validate_app3_logic.py`（纯校验）+ `tests/test_validate_app3_logic.py`（9 个单测）+ `tests/fixtures/app3_features_sample.json`（样例输入）。复跑：`DIFY_BASE_URL=http://your-dify-host/v1 DIFY_APP3_KEY=app-xxxx python validate_app3.py`。
