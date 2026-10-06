// 抓取近 N 個交易日的全市場成交股數，算出每檔「日均成交量（張）」
// 來源：證交所 MI_INDEX（每日收盤行情）、櫃買中心 daily_close_quotes（休市日回傳空資料，自動略過）
// 可單獨執行（更新 data/snapshot.json 的 v 欄位），也被 fetch_all.js 呼叫。
const fs = require('fs'), path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAYS = 20;          // 取最近 20 個交易日（約一個月）

async function getJson(url) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) { console.error('retry', url, e.message); await sleep(2000 * (t + 1)); }
  }
  return null;
}
const toNum = s => { const v = Number(String(s).replace(/,/g, '')); return Number.isFinite(v) ? v : null; };

// 回傳 { code: 成交股數 }；休市日回傳 null
async function twseDay(d) {
  const j = await getJson(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${d}&type=ALLBUT0999&response=json`);
  if (!j || j.stat !== 'OK') return null;
  const t = (j.tables || []).find(x => x.fields && x.fields[0] === '證券代號' && x.fields.includes('成交股數'));
  if (!t || !t.data.length) return null;
  const i = t.fields.indexOf('成交股數'), out = {};
  for (const r of t.data) if (/^\d{4}$/.test(r[0])) out[r[0]] = toNum(r[i]);
  return out;
}
async function tpexDay(d) {
  const j = await getJson(`https://www.tpex.org.tw/www/zh-tw/afterTrading/otc?date=${d.slice(0, 4)}/${d.slice(4, 6)}/${d.slice(6)}&type=EW&response=json`);
  const t = j && (j.tables || [])[0];
  if (!t || !t.data || !t.data.length || j.date !== d) return null;   // 休市日資料為空
  const i = t.fields.findIndex(f => f.trim() === '成交股數'), out = {};
  for (const r of t.data) if (/^\d{4}$/.test(r[0])) out[r[0]] = toNum(r[i]);
  return out;
}

// 就地寫入 snapshot.stocks[code].v（日均成交量，張）與 snapshot.asof.vol
async function addVolume(snap) {
  const sum = {}, cnt = {};
  const days = [];
  const d = new Date(Date.now() + 8 * 3600e3);          // 台灣日期
  for (let back = 0; days.length < DAYS && back < 45; back++, d.setUTCDate(d.getUTCDate() - 1)) {
    const wd = d.getUTCDay(); if (wd === 0 || wd === 6) continue;
    const ds = d.toISOString().slice(0, 10).replace(/-/g, '');
    const tw = await twseDay(ds); await sleep(600);
    const ot = await tpexDay(ds); await sleep(600);
    if (!tw && !ot) { console.log('volume', ds, '休市'); continue; }
    for (const m of [tw, ot]) if (m) for (const c in m) if (m[c] != null) { sum[c] = (sum[c] || 0) + m[c]; cnt[c] = (cnt[c] || 0) + 1; }
    days.push(ds); console.log('volume', ds, Object.keys(tw || {}).length, Object.keys(ot || {}).length);
  }
  if (days.length < 5) throw new Error('too few trading days for volume: ' + days.length);
  let n = 0;
  for (const [code, s] of Object.entries(snap.stocks)) {
    // 以實際有成交紀錄的天數平均；停牌日不計，缺資料者為 null
    s.v = cnt[code] ? Math.round(sum[code] / cnt[code] / 1000) : null; if (s.v != null) n++;
  }
  snap.asof.vol = { days: days.length, from: days[days.length - 1], to: days[0] };
  console.log('volume done', snap.asof.vol, 'stocks', n);
}
module.exports = { addVolume };

if (require.main === module) {
  const file = path.join(__dirname, '..', 'data', 'snapshot.json');
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  addVolume(snap).then(() => { fs.writeFileSync(file, JSON.stringify(snap)); console.log('wrote', file); })
    .catch(e => { console.error(e); process.exit(1); });
}
