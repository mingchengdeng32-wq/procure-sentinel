import { test } from "node:test";
import assert from "node:assert/strict";
import { pctChange, mean, std, zScore, divergence, peerDeviation, concentration, correlation } from "../src/lib/stats.js";

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

test("correlation 完全正相关为 1", () => {
  assert.ok(Math.abs(correlation([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
});

test("correlation 完全负相关为 -1", () => {
  assert.ok(Math.abs(correlation([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-9);
});

test("correlation 方差为 0 或长度不足返回 0", () => {
  assert.equal(correlation([5, 5, 5], [1, 2, 3]), 0);
  assert.equal(correlation([1], [1]), 0);
});
