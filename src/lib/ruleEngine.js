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
