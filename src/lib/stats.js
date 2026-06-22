// 纯统计工具，无副作用，浏览器与 node 通用 ESM。

export function pctChange(curr, prev) {
  if (prev === 0) return 0;
  return (curr - prev) / prev;
}

export function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function std(arr) {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = mean(arr.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

export function zScore(value, arr) {
  const s = std(arr);
  if (s === 0) return 0;
  return (value - mean(arr)) / s;
}

// 价格涨幅 - 原材料涨幅；正值越大=成本背离越明显
export function divergence(pricePct, materialPct) {
  return pricePct - materialPct;
}

// 相对同行均价的偏离比例
export function peerDeviation(price, peerAvg) {
  if (peerAvg === 0) return 0;
  return (price - peerAvg) / peerAvg;
}

// 供应商占比数组中的最大值
export function concentration(shares) {
  return Math.max(...shares);
}

// 皮尔逊相关系数（-1~1）；两序列按尾部对齐，长度<2 或任一方差为 0 返回 0
export function correlation(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const x = xs.slice(-n);
  const y = ys.slice(-n);
  const mx = mean(x);
  const my = mean(y);
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (vx === 0 || vy === 0) return 0;
  return cov / Math.sqrt(vx * vy);
}
