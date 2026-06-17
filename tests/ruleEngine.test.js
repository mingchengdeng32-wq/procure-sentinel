import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies, DEFAULT_CONFIG } from "../src/lib/ruleEngine.js";

const market = {
  periods: ["P1", "P2", "P3", "P4"],
  materials: { copper: [100, 101, 102, 103], gold: [100, 100, 100, 100] },
  peerAvgPrice: { connector: [11.0, 11.2, 11.4, 11.5] }
};

const records = [
  {
    productLine: "connector", sku: "高速背板连接器", supplier: "供应商A",
    unitPrice: [11.0, 11.2, 11.2, 12.8], qty: [10000, 10200, 9800, 10000],
    freq: [4, 4, 4, 4], supplierShare: [0.5, 0.5, 0.5, 0.6], amount: 12800000
  }
];

test("检出成本背离异常并给出高风险", () => {
  const products = [{ id: "connector", name: "连接器", materials: [{ id: "copper" }] }];
  const out = detectAnomalies(records, market, products, DEFAULT_CONFIG);
  assert.equal(out.length, 1);
  const a = out[0];
  assert.equal(a.key, "connector::高速背板连接器::供应商A");
  assert.ok(a.triggeredRules.includes("成本背离"));
  assert.ok(a.triggeredRules.includes("环比异动"));
  assert.equal(a.riskLevel, "high");
  assert.ok(Math.abs(a.metrics.pricePct - 0.142857) < 1e-4);
});

test("供应商集中度超阈值触发规则", () => {
  const recs = [{
    productLine: "pcb", sku: "板", supplier: "供应商B",
    unitPrice: [100, 101, 102, 103], qty: [1, 1, 1, 1],
    freq: [3, 3, 3, 3], supplierShare: [0.7, 0.75, 0.8, 0.82], amount: 1
  }];
  const products = [{ id: "pcb", name: "PCB", materials: [{ id: "ccl" }] }];
  const mkt = { ...market, materials: { ...market.materials, ccl: [100, 101, 102, 103] }, peerAvgPrice: { pcb: [100, 101, 102, 103] } };
  const out = detectAnomalies(recs, mkt, products, DEFAULT_CONFIG);
  assert.ok(out[0].triggeredRules.includes("供应商集中度"));
});
