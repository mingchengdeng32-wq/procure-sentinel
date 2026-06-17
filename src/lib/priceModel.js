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
