// 按天抓材料行情。真实源：新浪财经期货（无鉴权，需 Referer）。
// 失败时回落 seeded，并在输出标 real:false，绝不冒充真抓。
import { writeFileSync } from "node:fs";

const SOURCES = [
  { id: "copper", name: "沪铜", code: "nf_CU0", seeded: 70000 },
  { id: "aluminum", name: "沪铝", code: "nf_AL0", seeded: 20000 }
];

// 从新浪返回文本中提取昨结算价（index=1）或开盘价（index=2）
// 新浪期货串格式：name,昨结算,开盘,最高,最低,最新,…
// 取 index=2（开盘价）作为当日行情基准价；若为 0 则取 index=1（昨结算）
function parsePrice(text) {
  const m = text.match(/="([^"]+)"/);
  if (!m) return null;
  const raw = m[1].split(",");
  // index 1=昨结算, 2=开盘, 5=最新成交价
  for (const idx of [5, 2, 1]) {
    const n = Number(raw[idx]);
    if (Number.isFinite(n) && n > 1000) return n;
  }
  return null;
}

async function fetchOne(src) {
  try {
    const res = await fetch(`https://hq.sinajs.cn/list=${src.code}`, {
      headers: { Referer: "https://finance.sina.com.cn" }
    });
    const text = await res.text();
    const price = parsePrice(text);
    if (price) return { id: src.id, name: src.name, price, real: true };
  } catch (e) {
    console.error(`抓取 ${src.name} 失败:`, e.message);
  }
  return { id: src.id, name: src.name, price: src.seeded, real: false };
}

const sources = await Promise.all(SOURCES.map(fetchOne));
const out = { updatedAt: new Date().toISOString().slice(0, 10), sources };
writeFileSync("data/live-market.json", JSON.stringify(out, null, 2) + "\n");
console.log("live-market.json 已更新:", JSON.stringify(out));
