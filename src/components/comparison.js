import { signedPct } from "../lib/format.js";
import { pctChange } from "../lib/stats.js";
import { initChart } from "../lib/chart.js";

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

  initChart(document.getElementById("chart-h"), {
    ...base, tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: periods },
    yAxis: { type: "value", scale: true },
    series: [
      { name: "采购价(指数)", type: "line", smooth: true, data: normalize(rec.unitPrice), color: "#3b82f6" },
      { name: product.materials[0].name, type: "line", smooth: true, data: normalize(matSeries), color: "#f59e0b" },
      { name: "同行均价(指数)", type: "line", smooth: true, data: normalize(peerSeries), color: "#22c55e" }
    ]
  });

  initChart(document.getElementById("chart-v"), {
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
