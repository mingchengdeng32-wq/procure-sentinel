// 按天抓材料行情。真实源：新浪财经期货（无鉴权，需 Referer）。
// 失败时回落 seeded，并在输出标 real:false，绝不冒充真抓。
import { writeFileSync } from "node:fs";

const SOURCES = [
  { id: "copper", name: "沪铜", code: "nf_CU0", seeded: 70000 },
  { id: "aluminum", name: "沪铝", code: "nf_AL0", seeded: 20000 }
];

// 新浪期货串字段：0=名称,1=非价格常量(150000),2=开盘,3=最高,4=最低,
// 5=结算/收盘,6=买价,7=卖价,8=最新价,…
// 优先取 8(最新价)，回落 5(收盘)/2(开盘)；这三者均为真实价格字段，
// 刻意不取 index=1（那是个 150000 的非价格常量，会污染结果）。
function parsePrice(text) {
  const m = text.match(/="([^"]+)"/);
  if (!m) return null;
  const raw = m[1].split(",");
  for (const idx of [8, 5, 2]) {
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
