function buildBody(ctx) {
  const cards = ctx.allAnomalies.map((a) => {
    const c = ctx.llm.getAnomalyCard(a);
    const cls = c.riskLevel === "high" ? "risk-high" : "risk-mid";
    return `<div class="card"><b class="${cls}">${c.title}</b>
      <p>结论：${c.conclusion}</p><p>建议：${c.suggestions.join("；")}</p>
      <p>提醒：${c.notify.join(" / ")}</p></div>`;
  }).join("");
  const actions = ctx.llm.getExecActions().map((a) => `<li>${a}</li>`).join("");
  return `<h2>一、风险预警汇总（${ctx.allAnomalies.length} 项）</h2>${cards}
    <h2>二、给管理层的行动建议</h2><ol>${actions}</ol>`;
}

export async function exportReport(ctx) {
  const tpl = await (await fetch("report-template.html")).text();
  const meta = `生成时间：${new Date().toLocaleString("zh-CN")} · 数据口径：横向公开行情 + 纵向拟真`;
  const html = tpl
    .replace('<p id="meta"></p>', `<p id="meta">${meta}</p>`)
    .replace('<div id="report-body"></div>', `<div id="report-body">${buildBody(ctx)}</div>`);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "采购经营分析报告.html";
  a.click();
  URL.revokeObjectURL(url);
}
