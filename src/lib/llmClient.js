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
        notify: ["采购部负责人"],
        aiGenerated: false
      };
    },
    getPresetAnswer(id) {
      return insights.presetAnswers?.[id] ?? "暂无该问题的预生成洞察。";
    },
    getExecActions() {
      return insights.execActions ?? [];
    },
    // App3 关联分析结果（无则 null）
    getCorrelation() {
      return insights.correlation ?? null;
    },
    // 整体是否由真 AI 生成，用于顶栏「AI 增持」标识
    isAiGenerated() {
      return insights._aiGenerated === true;
    },
    // App2 经营洞察是否由真 AI 生成，用于 ④ 区域 ✨ 标识（回退兜底时为 false）
    insightsAiGenerated() {
      return insights._app2Generated === true;
    },
    aiModel() {
      return insights._model ?? "";
    }
  };
}
