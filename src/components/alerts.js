import { signedPct, pct } from "../lib/format.js";

const RISK_META = {
  high: { color: "var(--risk-high)", dot: "🔴", label: "高风险" },
  mid: { color: "var(--risk-mid)", dot: "🟡", label: "中风险" },
  low: { color: "var(--risk-low)", dot: "🟢", label: "低风险" }
};

function card(anomaly, llm) {
  const c = llm.getAnomalyCard(anomaly);
  const meta = RISK_META[c.riskLevel] || RISK_META.mid;
  const m = anomaly.metrics;
  return `<div class="card p-5" style="border-left:4px solid ${meta.color}">
    <div class="flex items-center justify-between mb-2">
      <span class="font-semibold">${meta.dot} ${c.title}</span>
      <span class="text-xs px-2 py-1 rounded" style="background:${meta.color}22;color:${meta.color}">${meta.label}</span>
    </div>
    <div class="text-xs mb-2" style="color:var(--text-1)">
      单价环比 ${signedPct(m.pricePct)} · 材料 ${signedPct(m.materialPct)} · 同行偏离 ${signedPct(m.peerDev)} · 集中度 ${pct(m.concentration)}
    </div>
    <p class="text-sm mb-1"><b>结论：</b>${c.conclusion}</p>
    <p class="text-sm mb-1" style="color:var(--text-1)"><b>归因：</b>${c.attribution}</p>
    <p class="text-sm mb-1"><b>建议：</b>${c.suggestions.map((s) => `<span class="inline-block mr-2">· ${s}</span>`).join("")}</p>
    <p class="text-xs mt-2" style="color:var(--accent-glow)">提醒对象：${c.notify.join(" / ")}</p>
  </div>`;
}

export function renderAlerts(el, ctx) {
  const items = ctx.anomalies;
  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">③ 风险预警中心</h2>
    ${items.length === 0
      ? `<div class="card p-5" style="color:var(--risk-low)">🟢 当前产品线无异常，采购健康。</div>`
      : `<div class="grid md:grid-cols-2 gap-4">${items.map((a) => card(a, ctx.llm)).join("")}</div>`}`;
}
