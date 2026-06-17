import { test } from "node:test";
import assert from "node:assert/strict";
import { wan, pct, signedPct } from "../src/lib/format.js";

test("wan 把元转成万元字符串", () => {
  assert.equal(wan(1280000), "128.0 万");
  assert.equal(wan(-560000), "-56.0 万");
});

test("pct 保留 1 位百分比", () => {
  assert.equal(pct(0.1234), "12.3%");
});

test("signedPct 带正负号", () => {
  assert.equal(signedPct(0.14), "+14.0%");
  assert.equal(signedPct(-0.1), "-10.0%");
});
