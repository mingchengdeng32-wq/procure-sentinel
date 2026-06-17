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
