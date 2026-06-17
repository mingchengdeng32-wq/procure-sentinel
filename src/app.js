import { detectAnomalies, DEFAULT_CONFIG } from "./lib/ruleEngine.js";
import { createLlmClient } from "./lib/llmClient.js";
import { JsonDataProvider } from "./lib/dataProvider.js";
import { renderDashboard } from "./components/dashboard.js";
import { renderComparison } from "./components/comparison.js";
import { renderAlerts } from "./components/alerts.js";
import { renderInsights } from "./components/insights.js";
import { exportReport } from "./components/report.js";
import { renderRadar } from "./components/radar.js";

// 切换真实接口时，仅改这一行为 new ApiDataProvider(baseUrl)
const provider = new JsonDataProvider();

const state = { products: null, market: null, procurement: null, insights: null, current: "cable", anomalies: [], llm: null, liveMarket: null, benchmark: null };

function renderSwitch() {
  const el = document.getElementById("product-switch");
  el.innerHTML = "";
  for (const p of state.products.productLines) {
    const btn = document.createElement("button");
    btn.textContent = p.name;
    btn.className = "px-4 py-2 rounded-lg text-sm transition";
    btn.style.cssText = p.id === state.current
      ? "background:var(--accent);color:#fff"
      : "background:var(--bg-2);color:var(--text-1)";
    btn.onclick = () => { state.current = p.id; renderAll(); };
    el.appendChild(btn);
  }
}

function renderAll() {
  renderSwitch();
  const ctx = {
    productLine: state.current,
    products: state.products.productLines,
    market: state.market,
    procurement: state.procurement,
    anomalies: state.anomalies.filter((a) => a.productLine === state.current),
    allAnomalies: state.anomalies,
    llm: state.llm,
    liveMarket: state.liveMarket,
    benchmark: state.benchmark
  };
  renderDashboard(document.getElementById("dashboard"), ctx);
  renderRadar(document.getElementById("radar"), ctx);
  renderComparison(document.getElementById("comparison"), ctx);
  renderAlerts(document.getElementById("alerts"), ctx);
  renderInsights(document.getElementById("insights"), ctx);
  document.getElementById("export-btn").onclick = () => exportReport({
    allAnomalies: state.anomalies, llm: state.llm
  });
}

async function main() {
  const [productLines, market, procurement, insights] = await Promise.all([
    provider.getProductLines(),
    provider.getMarket(),
    provider.getProcurement(),
    provider.getInsights()
  ]);
  state.products = { productLines };
  state.market = market;
  state.procurement = procurement;
  state.insights = insights;
  state.anomalies = detectAnomalies(procurement.records, market, productLines, DEFAULT_CONFIG);
  state.llm = createLlmClient(insights);

  const [liveMarket, benchmark] = await Promise.all([
    fetch("data/live-market.json").then((r) => r.ok ? r.json() : null).catch(() => null),
    fetch("data/benchmark.json").then((r) => r.ok ? r.json() : null).catch(() => null)
  ]);
  state.liveMarket = liveMarket;
  state.benchmark = benchmark;

  renderAll();
}

main().catch((e) => {
  document.getElementById("dashboard").innerHTML = `<p style="color:var(--risk-high)">${e.message}（请用本地服务器打开，见 README）</p>`;
});
