import { test } from "node:test";
import assert from "node:assert/strict";
import { pctChange, mean, std, zScore, divergence, peerDeviation, concentration } from "../src/lib/stats.js";

test("pctChange 计算环比涨跌幅", () => {
  assert.equal(pctChange(112, 100), 0.12);
  assert.equal(pctChange(90, 100), -0.1);
});

test("mean 与 std", () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.ok(Math.abs(std([2, 4, 6]) - 1.632993) < 1e-5);
});

test("zScore 偏离度", () => {
  assert.equal(zScore(4, [2, 4, 6]), 0);
  assert.ok(zScore(8, [2, 4, 6]) > 2);
});

test("divergence 价格涨幅减原材料涨幅", () => {
  assert.ok(Math.abs(divergence(0.14, 0.03) - 0.11) < 1e-9);
});

test("peerDeviation 相对同行均价偏离", () => {
  assert.ok(Math.abs(peerDeviation(12.8, 11.5) - 0.113043) < 1e-5);
});

test("concentration 返回最大供应商占比", () => {
  assert.equal(concentration([0.82, 0.1, 0.08]), 0.82);
});
