# 采购智能哨兵 ProcureSentinel

管理层采购决策驾驶舱。**规则引擎算数 + Dify 大模型解读**：自动识别采购异常，给出诊断、经营洞察与议价漏洞线索。纯前端展示，AI 结果预生成为 `data/insights.json`，✨ 角标标注 AI 增持部分。

> 在线 Demo：https://mingchengdeng32-wq.github.io/procure-sentinel/

## 架构

- **规则引擎（`src/lib/ruleEngine.js`）算数**：从行情/采购数据检测异常（环比异动 / 成本背离 / 同行偏离 / 供应商集中度），算好所有指标与风险等级。**AI 不重算、不编造数字。**
- **Dify 三个工作流只解读**：
  | App | 作用 | 落点字段 |
  |-----|------|---------|
  | App1 采购诊断 | 每条异常的结论/归因/对策/提醒/置信度 | `anomalyCards` |
  | App2 经营洞察 | 全盘预设问答 + 管理层行动建议 | `presetAnswers` / `execActions` |
  | App3 关联分析 | 报价-成本关联与议价漏洞线索 | `correlation` |
- **`scripts/dify-generate.mjs`** 逐个调用三个 App（带有效性守卫 + 失败回退，任一失败不影响其余），组装进 `data/insights.json`——前端唯一消费契约（定义见 `docs/dify/contracts.schema.json`）。
- 前端零后端，读 `data/*.json` 渲染。

## 运行（纯展示，无需 Dify）

仓库已带预生成的 `data/insights.json`，**clone 即可看完整效果**。

**必须用本地服务器**（切勿双击 `index.html`，`file://` 下浏览器拦截 JSON 加载会白屏）：
```bash
python -m http.server 8000
# 访问 http://localhost:8000/
```

## 测试
```bash
npm test   # node --test：统计 / 规则引擎 / 报价模型单测
```

## 重新生成 AI 洞察（需自托管 Dify，可选）

1. 复制 `.env.example` 为 `.env`，填入 `DIFY_BASE_URL` 与三个 App 的 API Key（`.env` 已 gitignore，绝不提交）。
2. 运行：
```bash
node --env-file=.env scripts/dify-generate.mjs   # 需 Node 20+
```
   逐 App 调用 → 守卫校验 → 失败回退现有，产出新的 `data/insights.json`。
   > 各 App 接口契约与集成细节见 `docs/dify/app{1,2,3}-integration-guide.md` 与总体规格 `docs/dify/dify-integration-spec.md`。

## 实时行情
`node scripts/fetch-market.mjs` 抓沪铜/沪铝（新浪期货）写 `data/live-market.json`；GitHub Actions（`.github/workflows/daily-fetch.yml`）每日自动跑并提交，Pages 自动刷新。CCL/PCB/成交价为示例数据（角标标注），真实成交价待 ccgp/Dify 接入。

## 部署
GitHub Pages 直接服务仓库根目录，push 后自动重建。

## 数据口径
横向=公开行情快照，纵向=拟真合成。接入 ERP 即实时运行。
