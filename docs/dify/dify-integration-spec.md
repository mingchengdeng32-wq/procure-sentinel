# ProcureSentinel × Dify 集成搭建规格书

> 日期：2026-06-17 · 适用：本地自托管 Dify
> 目标：让另一个 agent 照此**在 Dify 里建好 App + 把真 AI 接进采购智能体前端**，零改动对接现有 `data/insights.json` 契约。
> 配套：数据契约 `contracts.schema.json`；**App1 已真机部署实测**，其权威对接细节见 `app1-integration-guide.md`、工作流导出见 `app1_diagnosis.yml`。
>
> **进度**：✅ App1 采购诊断（已部署实测） · ⬜ App2 经营洞察（待建） · ⬜ App3 关联分析（待建） · ⬜ App4 对话（选做）。

---

## 0. 前置约定（务必先读）

- **铁律：procure-sentinel 算数，Dify 只解读。** 规则引擎已算好异常和所有指标（环比/背离/同行偏离/集中度）和风险等级；**Dify 的 LLM 节点不得重算或编造数字**，只做诊断/建议/关联叙事。
- **数值数据走 API inputs 变量传 JSON 字符串，不进知识库。** 知识库只放非结构化参考（采购制度、供应商档案、历史案例）。
- **所有 LLM 节点必须输出严格 JSON**（无 markdown 围栏、无多余文字），由 Code 节点 `JSON.parse` 后经 End 节点输出。
- **key 安全**：每个 App 的 API Key 放调用方的环境变量/GitHub Secret，**绝不进前端代码**。
- 单位：金额=元；比例=小数（0.143 表示 +14.3%）；风险等级=`high|mid|low`。

---

## 1. 总体架构

```
procure-sentinel（前端/脚本）                Dify（本地自托管）
─────────────────────────                 ──────────────────────
规则引擎 detectAnomalies()  ──异常+指标JSON──►  App1 采购诊断(Workflow)  ──► 诊断/建议/置信度
经营汇总(总额/异常数)        ──汇总JSON──────►  App2 经营洞察(Workflow)  ──► 预设答+3条行动建议
多维特征(相关系数/溢价等)    ──特征JSON──────►  App3 关联分析(Workflow)  ──► 关联发现/议价漏洞线索
当期上下文 + 用户提问        ──query────────►  App4 对话诊断(Chatflow)  ──► 实时多轮对话(选做)
        │                                              │
        └──── dify-generate.mjs 组装 ──► data/insights.json ──► 前端渲染(打 ✨AI 角标)
```

- **App1/2/3 = Workflow 应用**（结构化批处理，预生成 insights.json）。
- **App4 = Chatflow 应用**（实时对话，选做，需轻量代理转发）。
- 知识库（Datasets）：`采购管理制度`、`供应商档案`、`历史诊断案例`，供 App1/App4 检索。

---

## 2. 数据契约（与前端的对接命门）

完整字段见 `contracts.schema.json`。这里给关键示例。**前端 `data/insights.json` 是最终消费目标，结构必须严丝合缝。**

### 2.1 前端最终消费的 insights.json（dify-generate.mjs 组装目标）
```jsonc
{
  "_aiGenerated": true,
  "_generatedAt": "2026-06-17T01:00:00Z",
  "_model": "dify:采购诊断工作流",
  "anomalyCards": {
    "connector::高速背板连接器::供应商A": {
      "riskLevel": "high",            // ← procure-sentinel 规则引擎填，AI 不改
      "title": "高速背板连接器 · 供应商A", // ← procure-sentinel 填
      "conclusion": "…",              // ← App1 填
      "attribution": "…",             // ← App1 填
      "suggestions": ["…","…"],       // ← App1 填
      "notify": ["采购部负责人","分管副总"], // ← App1 填
      "confidence": 0.86,             // ← App1 填（新增字段）
      "aiGenerated": true             // ← 组装时打标，前端据此显示 ✨
    }
  },
  "presetAnswers": { "biggestRisk":"…","costPressure":"…","savingOpp":"…" }, // ← App2
  "execActions": ["…","…","…"],       // ← App2
  "correlation": {                    // ← App3（新增区块）
    "findings": [{ "title":"…","detail":"…","severity":"high","lead":"…" }],
    "summary": "…"
  }
}
```

> 兼容性：`anomalyCards[key]` 的 `riskLevel/title/conclusion/attribution/suggestions/notify` 是**现有前端已消费字段，名称不可变**；`confidence/aiGenerated/correlation` 为新增可选字段，老前端忽略也不报错。

---

## 3. App1 · 采购诊断工作流（Workflow） ✅ 已部署实测

**应用类型**：工作流（Workflow）
**用途**：输入一条异常，输出诊断+建议+置信度。
**状态**：已在本地 Dify 部署、真机实测通过；工作流导出见 `app1_diagnosis.yml`，可直接导入复现。对接细节以 `app1-integration-guide.md` 为权威，本节为总体说明。

### 3.1 节点编排
```
[开始] → [知识检索] → [LLM 诊断] → [代码 解析JSON] → [结束]
```

### 3.2 开始节点 · 输入变量
| 变量名 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `anomaly_json` | 段落(paragraph) | 是 | 一条异常的 JSON 字符串，结构见 `contracts.schema.json#AnomalyInput` |

### 3.3 知识检索节点
- 关联知识库：`采购管理制度`、`供应商档案`、`历史诊断案例`
- 查询变量：`{{#start.anomaly_json#}}`（用异常内容做检索）
- Top K：3；得分阈值：0.5；输出变量：`kb_context`

### 3.4 LLM 诊断节点
- 模型：你本地接入的大模型（如 Qwen/DeepSeek 等），**temperature 0.2~0.3**（求稳）
- 上下文：引用 `{{#知识检索.result#}}`
- **System Prompt**（完整，照填）：
```
你是资深采购成本与供应链风控顾问，服务于一家线缆/连接器/PCB 制造企业的管理层。

你会收到一条已由规则引擎判定完成的采购异常，格式为 JSON，包含各项已算好的指标、命中的规则和已定的风险等级。

铁律：
1. 绝不重新计算或编造输入里没有的数字；只能引用输入中已有的数值。
2. 风险等级 risk_level 已由规则引擎判定，你不得修改，只能围绕它做诊断。
3. 语气是经营顾问，简洁、直给、面向不懂技术的管理层。
4. 必须严格输出 JSON，不要任何 markdown 围栏、不要任何解释性前后缀。

输出 JSON 结构（严格遵守字段名）：
{
  "conclusion": "结论先行的一句话，引用关键数字（如环比+14%、材料-4%、背离18点）",
  "attribution": "根因分析：为什么会异常，指向供应商行为/市场/内部",
  "suggestions": ["2到4条具体可执行的对策"],
  "notify": ["从 采购部负责人/分管副总/供应链风控/财务 中选出该提醒谁"],
  "confidence": 0.0到1.0之间的数字（命中规则越多、背离越大，confidence 越高）
}

可参考的公司制度/历史案例（如有）：
{{#知识检索.result#}}
```
- **User Prompt**：
```
待诊断的采购异常：
{{#start.anomaly_json#}}
```

### 3.5 代码节点 · 解析 JSON（Python）
```python
import json
def main(llm_text: str) -> dict:
    t = llm_text.strip()
    if t.startswith("```"):
        t = t.strip("`")
        t = t[t.find("{"):t.rfind("}")+1]
    data = json.loads(t)
    return {
        "conclusion": data.get("conclusion", ""),
        "attribution": data.get("attribution", ""),
        "suggestions": data.get("suggestions", []),
        "notify": data.get("notify", []),
        "confidence": float(data.get("confidence", 0.7)),
    }
```
- 输入：`llm_text = {{#LLM诊断.text#}}`

### 3.6 结束节点 · 输出变量
`conclusion`、`attribution`、`suggestions`、`notify`、`confidence`（均引用代码节点输出）。

---

## 4. App2 · 经营洞察工作流（Workflow）

**用途**：输入全盘异常+产品线汇总，输出 3 个预设问答 + 3 条管理层行动建议。

### 4.1 节点编排
```
[开始] → [LLM 洞察] → [代码 解析JSON] → [结束]
```

### 4.2 开始节点 · 输入变量
| 变量名 | 类型 | 说明 |
|---|---|---|
| `summary_json` | 段落 | 全盘异常+产品线汇总 JSON，见 `contracts.schema.json#InsightSummaryInput` |

### 4.3 LLM 洞察节点（temperature 0.3）
- **System Prompt**：
```
你是采购经营分析顾问，面向不懂技术的公司管理层。

你会收到本期全部采购异常和各产品线汇总（已由规则引擎算好）。基于这些事实，输出经营级洞察与行动建议。

铁律：
1. 不重算、不编造输入外的数字。
2. 结论先行，每段不超过200字，面向决策。
3. 严格输出 JSON，无 markdown 围栏，无多余文字。

输出 JSON 结构：
{
  "biggestRisk": "本季度最大风险（结论先行，点名产品线/供应商）",
  "costPressure": "哪条产品线成本压力最大，区分'材料涨'与'议价问题'",
  "savingOpp": "有哪些降本机会，给方向和量级",
  "execActions": ["恰好3条给管理层的行动建议，每条含 动作+理由+预期收益"]
}
```
- **User Prompt**：
```
本期采购汇总：
{{#start.summary_json#}}
```

### 4.4 代码节点（同 3.5 模式，解析 biggestRisk/costPressure/savingOpp/execActions）
### 4.5 结束节点：输出上述 4 字段。

---

## 5. App3 · 关联分析工作流（Workflow）

**用途**：输入多维特征（procure-sentinel 已算好的相关系数/溢价/集中度趋势等），AI 叙述关联发现与议价漏洞线索。**这是"AI 增持"最亮的能力。**

### 5.1 节点编排
```
[开始] → [LLM 关联] → [代码 解析JSON] → [结束]
```

### 5.2 开始节点 · 输入变量
| 变量名 | 类型 | 说明 |
|---|---|---|
| `features_json` | 段落 | 多维特征 JSON，见 `contracts.schema.json#CorrelationInput` |

### 5.3 LLM 关联节点（temperature 0.3）
- **System Prompt**：
```
你是采购数据关联分析专家。你会收到一组已计算好的特征（如各供应商报价与原材料价的相关系数、相对同行溢价、集中度趋势、价格趋势，可能含经手采购员）。

你的任务：把这些特征反映出的"关联与异常模式"讲成管理层能懂的发现。重点关注议价漏洞线索，例如：报价与材料价相关性断裂（材料降报价不降）、某供应商系统性溢价、集中度与溢价同步走高等。

铁律：
1. 只基于输入特征叙述，不计算、不编造数据。
2. 对外措辞走"帮采购议价/优化"，而非"查采购"，降低组织敏感度。
3. 严格输出 JSON，无 markdown 围栏。

输出 JSON 结构：
{
  "findings": [
    { "title": "发现标题", "detail": "具体说明，引用特征值", "severity": "high|mid|low", "lead": "可处置的议价线索" }
  ],
  "summary": "一句话总览"
}
```
- **User Prompt**：
```
多维特征：
{{#start.features_json#}}
```

### 5.4 代码节点解析 `findings`/`summary`；结束节点输出。

---

## 6. App4 · 采购对话诊断（Chatflow，选做）

**用途**：管理层现场追问，多轮对话。需轻量代理转发（key 不进浏览器）。

- 应用类型：对话流（Chatflow）
- 会话变量：`context_json`（当期异常上下文，首轮由调用方传入 inputs）
- 知识检索节点：同 App1 三个知识库
- LLM 节点 System Prompt：
```
你是「采购智能哨兵」助手，基于提供的当期异常上下文回答管理层提问。
不重算数字，只解读已有数据。语气是经营顾问，简洁。
当问题超出上下文时，明确说明需要哪些数据才能回答。
当期上下文：{{#conversation.context_json#}}
参考制度/案例：{{#知识检索.result#}}
```

---

## 7. API 调用规格（本地自托管 Dify）

每个 App 在 Dify 后台「访问 API」处获取独立 API Key（形如 `app-xxxxxxxx`）。

### 7.1 Workflow 应用（App1/2/3）

> ⚠️ **实测修正（来自 App1 真机部署）**：`DIFY_BASE_URL` 已**包含 `/v1` 前缀**，实测值 `http://localhost/v1`。因此 endpoint 是 `{DIFY_BASE_URL}/workflows/run`，**不要再拼 `/v1`**（否则变成双 `/v1` 404）。
> `inputs` 的值是 **JSON 字符串**（开始节点变量为 paragraph/段落型）——传之前对对象 `JSON.stringify()`。

```
POST  {DIFY_BASE_URL}/workflows/run      # DIFY_BASE_URL 例：http://localhost/v1
Headers:
  Authorization: Bearer {APP_API_KEY}
  Content-Type: application/json
Body:
  {
    "inputs": { "anomaly_json": "{...JSON字符串(stringify后)...}" },
    "response_mode": "blocking",
    "user": "procure-sentinel"
  }
返回:
  { "data": { "status": "succeeded",
              "outputs": { "conclusion": "...", "attribution": "...",
                           "suggestions": [...], "notify": [...], "confidence": 0.86 } } }
```
> `inputs` 的键名 = 各 App「开始」节点定义的变量名（App1=`anomaly_json`，App2=`summary_json`，App3=`features_json`）。
> 单次耗时实测 5~9s；如需提速对多条异常做有限并发（并发度 ≤ 3，避免本地 LLM 过载）。

### 7.2 Chatflow 应用（App4）
```
POST  {DIFY_BASE_URL}/v1/chat-messages
Body: { "inputs": { "context_json": "{...}" }, "query": "为什么连接器涨这么多",
        "response_mode": "blocking", "user": "...", "conversation_id": "" }
返回: { "answer": "...", "conversation_id": "..." }
```

---

## 8. procure-sentinel 端对接改造（前端/脚本）

### 8.1 新增 `scripts/dify-generate.mjs`（预生成 insights.json）
职责：跑规则引擎 → 逐异常调 App1 → 调 App2(汇总) → 调 App3(特征) → 组装成 §2.1 的 insights.json → 写入 `data/insights.json`。

环境变量（放 `.env` / GitHub Secret，绝不硬编码）：
```
DIFY_BASE_URL=http://你的本地dify
DIFY_APP1_KEY=app-...   # 采购诊断
DIFY_APP2_KEY=app-...   # 经营洞察
DIFY_APP3_KEY=app-...   # 关联分析
```
骨架：
```js
import { readFileSync, writeFileSync } from "node:fs";
import { detectAnomalies, DEFAULT_CONFIG } from "../src/lib/ruleEngine.js";

const BASE = process.env.DIFY_BASE_URL;     // 已含 /v1，例 http://localhost/v1
async function runWorkflow(key, inputs) {
  const res = await fetch(`${BASE}/workflows/run`, {   // 注意：BASE 已含 /v1，不再拼
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs, response_mode: "blocking", user: "procure-sentinel" })
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return j?.data ?? {};   // 返回整个 data，由调用方按各 App 的“有效性守卫”判定
}
// 1) 异常 → App1（inputs:{anomaly_json: JSON.stringify(anomaly)}）；2) 汇总 → App2；3) 特征 → App3
// 4) 组装 insights.json（riskLevel/title 由本地填，AI 字段来自 outputs，并打 aiGenerated 标）
```

> **⚠️ 实测铁律：`data.status==="succeeded"` 不等于诊断有效。** 输入非法或 LLM 输出无法解析时，Code 节点会兜底返回**空字段 + `confidence:0.7`**，状态仍是 succeeded。直接采信会渲染“空诊断卡 + 70%置信度”的误导结果。
>
> **有效性守卫（每条 App1 结果必须过）：**
> ```
> 有效 ⟺ data.status==="succeeded"
>        && typeof outputs.conclusion==="string" && outputs.conclusion.trim()!==""
>        && Array.isArray(outputs.suggestions) && outputs.suggestions.length>=1
> ```
> 任一不满足 → 视为 AI 失败，**该卡回退规则引擎兜底文案并标 `aiGenerated:false`**，且**忽略那个 0.7 的 confidence**。单条失败**绝不中断整批**。兜底沿用 `llmClient` 现有规则兜底逻辑，保证 `insights.json` 始终可用、demo 不崩。
>
> 📌 App1 的字段级契约、实测样例、守卫细节以 **`app1-integration-guide.md`（已真机实测）为权威**，本节与其保持一致。

### 8.2 挂进 GitHub Action（扩展现有 `.github/workflows/daily-fetch.yml`）
在抓行情之后加一步（仅当配置了 Secrets 时运行）：
```yaml
      - name: AI 诊断生成 insights
        if: ${{ secrets.DIFY_BASE_URL != '' }}
        env:
          DIFY_BASE_URL: ${{ secrets.DIFY_BASE_URL }}
          DIFY_APP1_KEY: ${{ secrets.DIFY_APP1_KEY }}
          DIFY_APP2_KEY: ${{ secrets.DIFY_APP2_KEY }}
          DIFY_APP3_KEY: ${{ secrets.DIFY_APP3_KEY }}
        run: node scripts/dify-generate.mjs
```
> 注意：本地自托管 Dify 若不公网可达，GitHub 云端 Action 调不通——届时改为**本地定时跑** `node scripts/dify-generate.mjs` 后提交，或把 Action 换成 self-hosted runner。规格不变，仅运行位置变。

### 8.3 `src/lib/llmClient.js` 微调
- `getAnomalyCard` 透传新字段 `confidence`、`aiGenerated`（无则不显示）。
- 新增 `getCorrelation()` 返回 `insights.correlation`（无则返回 null）。
- 新增 `isAiGenerated()` 返回 `insights._aiGenerated`。

### 8.4 前端展示「AI 增持」可见化
- `alerts.js`：卡片标题旁，当 `card.aiGenerated` 为真时显示 `✨AI诊断` 角标 + `置信度 {confidence}`。
- `radar.js` 的 ⑨ 关联占位卡：当 `getCorrelation()` 有值时，渲染真实 `findings`（标题/detail/severity 色条/lead），并打 `✨AI关联` 角标；无值时保持占位文案。
- 顶栏：当 `isAiGenerated()` 为真时显示 `✨ AI 增持已启用 · 模型 {_model}`，让领导一眼看出增强部分。

---

## 9. 落地顺序（给搭建 agent）

1. ✅ **App1 诊断工作流已建成实测**（§3，`app1_diagnosis.yml`/`app1-integration-guide.md`）。
2. ⬜ 建 **App2**（§4）、**App3**（§5），用 `contracts.schema.json` 的样例测通；endpoint 同 App1：`{DIFY_BASE_URL}/workflows/run`（BASE 已含 /v1）。
3. ⬜ procure-sentinel 侧加 `scripts/dify-generate.mjs`（§8.1，**含 App1 有效性守卫**）+ 改 `llmClient`（§8.3）+ 前端角标（§8.4）。
4. ⬜ 配 Secrets/`.env`，跑一次 `node scripts/dify-generate.mjs`，确认生成的 `data/insights.json` 符合 §2.1 且前端正常渲染。
5. ⬜（选做）建 **App4 对话** + 轻量代理。

## 10. 验收清单
- [ ] App1/2/3 各用样例输入调通，输出严格匹配 `contracts.schema.json` 对应 Output。
- [ ] `dify-generate.mjs` 生成的 `insights.json` 通过 schema 校验（`InsightsFile`）。
- [ ] 任一 Dify 调用失败时，整体不崩，失败卡回退规则兜底文案。
- [ ] 前端：异常卡显示 `✨AI诊断`+置信度；⑨ 显示真实关联发现；顶栏显示「AI 增持已启用」。
- [ ] key 仅存在于 `.env`/Secret，全仓库 grep 不到明文 key。
- [ ] 现有 12+4 单测仍全绿（priceModel/ruleEngine 等不受影响）。

## 11. 样例数据（搭建时直接拿去测 App1）
`anomaly_json`（连接器高风险）：
```json
{"key":"connector::高速背板连接器::供应商A","sku":"高速背板连接器","supplier":"供应商A","product_line":"connector","risk_level":"high","material_name":"铜","triggered_rules":["环比异动","成本背离","同行偏离"],"metrics":{"price":12.8,"price_pct":0.143,"material_pct":-0.038,"divergence":0.181,"peer_dev":0.113,"concentration":0.6}}
```
期望输出（形如）：
```json
{"conclusion":"高速背板连接器采购价逆势涨14.3%，铜价反跌3.8%，背离18个百分点。","attribution":"涨价无法由材料解释，疑似供应商单方提价或议价权流失。","suggestions":["复盘供应商A近3期报价","启动二供询比价","要求成本拆解"],"notify":["采购部负责人","分管副总"],"confidence":0.88}
```
