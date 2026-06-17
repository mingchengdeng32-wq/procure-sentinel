// 展示层格式化工具。

export function wan(yuan) {
  return (yuan / 10000).toFixed(1) + " 万";
}

export function pct(ratio) {
  return (ratio * 100).toFixed(1) + "%";
}

export function signedPct(ratio) {
  const sign = ratio >= 0 ? "+" : "";
  return sign + (ratio * 100).toFixed(1) + "%";
}
