// 数据可插拔层（仓储模式）。demo: JsonDataProvider；未来: ApiDataProvider。
// 两者实现同一接口，规则引擎与 UI 不感知数据来自 JSON 还是真实 API。

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`加载失败：${path}`);
  return res.json();
}

// Demo 实现：读本地 data/*.json
export class JsonDataProvider {
  constructor(base = "data") { this.base = base; }
  async getProductLines() { return (await loadJson(`${this.base}/products.json`)).productLines; }
  async getProcurement() { return (await loadJson(`${this.base}/procurement.json`)); }
  async getMarket() { return (await loadJson(`${this.base}/market.json`)); }
  async getInsights() { return (await loadJson(`${this.base}/insights.json`)); }
  // demo 仅本地反馈；未来 ApiDataProvider 改为 POST /api/v1/alerts
  async pushAlert(card) { console.info("[demo] 预警推送：", card.title); return { delivered: true }; }
}

// 未来真实接口实现骨架（先留位，不在 demo 启用）。
export class ApiDataProvider {
  constructor(baseUrl) { this.baseUrl = baseUrl; }
  async getProductLines() { return (await (await fetch(`${this.baseUrl}/api/v1/product-lines`)).json()).data; }
  async getProcurement(productLine, from, to) {
    const q = new URLSearchParams({ productLine: productLine ?? "", from: from ?? "", to: to ?? "" });
    return (await (await fetch(`${this.baseUrl}/api/v1/procurement?${q}`)).json()).data;
  }
  async getMarket() { throw new Error("ApiDataProvider 待系统对接后实现"); }
  async getInsights() { throw new Error("接入实时 LLM 后实现"); }
  async pushAlert(card) {
    const res = await fetch(`${this.baseUrl}/api/v1/alerts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(card)
    });
    return (await res.json()).data;
  }
}
