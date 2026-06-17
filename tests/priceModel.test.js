import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonablePrice, assessQuote, DEFAULT_MODEL } from "../src/lib/priceModel.js";

test("reasonablePrice 按成本传导推算合理价", () => {
  // base 100, 材料涨10%, passThrough 0.6 => 100*(1+0.06)=106
  assert.ok(Math.abs(reasonablePrice(100, 0.10) - 106) < 1e-9);
});

test("assessQuote 实际远高于区间 => 偏高", () => {
  const r = assessQuote(100, 0.10, 120, DEFAULT_MODEL); // 合理106, 上界106*1.08=114.48
  assert.equal(r.verdict, "偏高");
  assert.ok(r.deviation > 0.1);
});

test("assessQuote 区间内 => 合理", () => {
  const r = assessQuote(100, 0.10, 107);
  assert.equal(r.verdict, "合理");
});

test("assessQuote 低于下界 => 偏低", () => {
  const r = assessQuote(100, 0.10, 90); // 下界106*0.92=97.52
  assert.equal(r.verdict, "偏低");
});
