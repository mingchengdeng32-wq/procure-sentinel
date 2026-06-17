import { assessQuote, DEFAULT_MODEL } from "../lib/priceModel.js";
import { pctChange } from "../lib/stats.js";
import { signedPct } from "../lib/format.js";

// 用材料环比 + 基准价评估当前产品线报价是否偏高
function assessCurrent(ctx) {
  const rec = ctx.procurement.records.find((r) => r.productLine === ctx.productLine);
  if (!rec) return null;
  const product = ctx.products.find((p) => p.id === ctx.productLine);
  const matSeries = ctx.market.materials[product.materials[0].id] || [];
  const matDelta = matSeries.length >= 2 ? pctChange(matSeries.at(-1), matSeries.at(-2)) : 0;
  const basePrice = rec.unitPrice.at(-2);
  const actual = rec.unitPrice.at(-1);
  return { rec, ...assessQuote(basePrice, matDelta, actual, DEFAULT_MODEL) };
}

const VERDICT_META = {
  偏高: { color: "var(--risk-high)", tip: "建议谈判压价" },
  偏低: { color: "var(--risk-low)", tip: "采购表现优于合理区间" },
  合理: { color: "var(--text-1)", tip: "处于合理区间内" }
};

export function renderRadar(el, ctx) {
  const live = ctx.liveMarket;
  const a = assessCurrent(ctx);
  const updated = live?.updatedAt ?? "—";
  const ticker = (live?.sources ?? []).map((s) => {
    const tag = s.real
      ? `<span style="color:var(--risk-low);font-size:10px">●实时</span>`
      : `<span style="color:var(--risk-mid);font-size:10px">●示例</span>`;
    return `<span class="mr-5">${s.name} <b class="big-num">${s.price}</b> ${tag}</span>`;
  }).join("");

  const meta = a ? VERDICT_META[a.verdict] : null;
  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">市场报价雷达 · AI 报价合理性</h2>
    <div class="card p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
      <div>${ticker || '<span style="color:var(--text-1)">行情数据加载中…</span>'}</div>
      <div class="text-xs" style="color:var(--text-1)">更新于 ${updated}</div>
    </div>
    ${a ? `
    <div class="grid md:grid-cols-2 gap-4">
      <div class="card p-4">
        <div class="text-sm mb-2">${a.rec.sku}：实际报价 vs AI 合理区间</div>
        <div id="radar-band" style="height:240px"></div>
      </div>
      <div class="card p-5 flex flex-col justify-center">
        <div class="text-xs" style="color:var(--text-1)">AI 报价合理性判定</div>
        <div class="big-num text-4xl my-2" style="color:${meta.color}">${a.verdict} ${signedPct(a.deviation)}</div>
        <div class="text-sm" style="color:var(--text-1)">合理区间 ${a.low.toFixed(1)} ~ ${a.high.toFixed(1)}，实际 ${a.actual.toFixed(1)}</div>
        <div class="text-sm mt-2" style="color:${meta.color}">${meta.tip}</div>
      </div>
    </div>
    <div class="card p-4 mt-4" style="border:1px dashed var(--line)">
      <div class="text-sm" style="color:var(--text-1)">🔗 采购关系 × 行为 × 报价 关联分析</div>
      <div class="text-xs mt-1" style="color:var(--text-1)">接入真实采购/供应商/采购员数据后启用，可识别"系统性偏高报价"等议价漏洞线索。</div>
    </div>` : ""}`;

  if (a) {
    const chart = echarts.init(document.getElementById("radar-band"), "dark");
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      grid: { left: 40, right: 20, top: 20, bottom: 30 },
      xAxis: { type: "category", data: ["合理下界", "合理价", "合理上界", "实际报价"], axisLabel: { color: "#9aa7c0" } },
      yAxis: { type: "value", scale: true, axisLabel: { color: "#9aa7c0" } },
      series: [{
        type: "bar",
        data: [
          { value: Number(a.low.toFixed(1)), itemStyle: { color: "#22c55e" } },
          { value: Number(a.reasonable.toFixed(1)), itemStyle: { color: "#3b82f6" } },
          { value: Number(a.high.toFixed(1)), itemStyle: { color: "#f59e0b" } },
          { value: Number(a.actual.toFixed(1)), itemStyle: { color: a.verdict === "偏高" ? "#ef4444" : "#9aa7c0" } }
        ]
      }]
    });
  }
}
