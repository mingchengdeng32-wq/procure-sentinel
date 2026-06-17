const PRESETS = [
  { id: "biggestRisk", q: "本季度采购最大风险是什么？" },
  { id: "costPressure", q: "哪条产品线成本压力最大？" },
  { id: "savingOpp", q: "有哪些降本机会？" }
];

export function renderInsights(el, ctx) {
  const actions = ctx.llm.getExecActions();
  el.innerHTML = `
    <h2 class="big-num text-lg mb-4" style="color:var(--text-1)">④ 一键智能洞察</h2>
    <div class="grid md:grid-cols-2 gap-4">
      <div class="card p-5">
        <div class="text-sm mb-3" style="color:var(--text-1)">点击问题，获取战略洞察：</div>
        <div id="preset-btns" class="flex flex-wrap gap-2 mb-4"></div>
        <div id="preset-answer" class="text-sm p-4 rounded" style="background:var(--bg-2);min-height:80px;color:var(--text-0)">
          请选择一个问题…
        </div>
      </div>
      <div class="card p-5">
        <div class="text-sm mb-3" style="color:var(--accent-glow)">📋 给管理层的 3 条行动建议</div>
        <ol class="space-y-3">
          ${actions.map((a, i) => `<li class="flex gap-3 text-sm">
            <span class="big-num" style="color:var(--accent-glow)">${i + 1}</span>
            <span>${a}</span></li>`).join("")}
        </ol>
      </div>
    </div>`;

  const btnWrap = document.getElementById("preset-btns");
  const answer = document.getElementById("preset-answer");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.textContent = p.q;
    b.className = "px-3 py-2 rounded-lg text-xs";
    b.style.cssText = "background:var(--bg-2);color:var(--text-0);border:1px solid var(--line)";
    b.onclick = () => { answer.textContent = ctx.llm.getPresetAnswer(p.id); };
    btnWrap.appendChild(b);
  }
}
