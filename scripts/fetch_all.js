// 抓取上市櫃月營收（近 12 個月）與綜合損益表（近 13 季），輸出 data/snapshot.json
// 來源：證交所 / 櫃買中心 OpenAPI（公司清單與最新期別）、公開資訊觀測站（歷史彙總表）
const fs = require('fs'), path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = path.join(__dirname, '..', 'data', 'snapshot.json');

async function getText(url, opts = {}, enc = 'utf-8') {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, ...(opts.headers || {}) }, method: opts.method || 'GET', body: opts.body, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return new TextDecoder(enc).decode(Buffer.from(await r.arrayBuffer()));
    } catch (e) { console.error('retry', url, e.message); await sleep(3000 * (t + 1)); }
  }
  throw new Error('failed: ' + url);
}
const strip = s => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => { s = strip(s).replace(/,/g, ''); if (s === '' || s === '-' || s === '--') return null; const v = Number(s); return Number.isFinite(v) ? v : null; };
const tables = html => [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map(m =>
  [...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(r => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => c[1])));

(async () => {
  // 1. 公司清單與最新期別
  const revL = JSON.parse(await getText('https://openapi.twse.com.tw/v1/opendata/t187ap05_L'));
  const revO = JSON.parse(await getText('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O'));
  const finL = JSON.parse(await getText('https://openapi.twse.com.tw/v1/opendata/t187ap06_L_ci'));
  const stocks = {};
  for (const [list, mk] of [[revL, '上市'], [revO, '上櫃']]) for (const r of list) {
    const c = r['公司代號']; if (!/^\d{4}$/.test(c)) continue;
    stocks[c] = { n: r['公司名稱'], m: mk, i: r['產業別'], rev: Array(12).fill(null), ly: Array(12).fill(null), q: Array(13).fill(null) };
  }
  // 若快照已存在且期別未前進，仍重抓一次（資料可能補登）
  const latest = revL[0]['資料年月'];
  let y = +latest.slice(0, 3), m = +latest.slice(3);
  const months = []; for (let k = 0; k < 12; k++) { months.unshift([y, m]); m--; if (m === 0) { m = 12; y--; } }
  const monthLabels = months.map(([y, m]) => `${y}/${String(m).padStart(2, '0')}`);

  // 2. 月營收
  for (let idx = 0; idx < months.length; idx++) {
    const [yy, mm] = months[idx];
    for (const mk of ['sii', 'otc']) {
      const html = await getText(`https://mopsov.twse.com.tw/nas/t21/${mk}/t21sc03_${yy}_${mm}_0.html`, {}, 'big5');
      let n = 0;
      for (const tb of tables(html)) for (const row of tb) {
        if (row.length < 5) continue;
        const code = strip(row[0]); if (!/^\d{4}$/.test(code)) continue;
        const s = stocks[code]; if (!s) continue;
        s.rev[idx] = num(row[2]); s.ly[idx] = num(row[4]); n++;
      }
      console.log('month', yy, mm, mk, n);
      await sleep(800);
    }
  }

  // 3. 綜合損益表（累計）
  let qy = +finL[0]['年度'], qs = +finL[0]['季別'];
  const quarters = []; for (let k = 0; k < 13; k++) { quarters.unshift([qy, qs]); qs--; if (qs === 0) { qs = 4; qy--; } }
  const quarterLabels = quarters.map(([y, s]) => `${y}Q${s}`);
  const want = { rev: ['營業收入'], gp: ['營業毛利（毛損）淨額', '營業毛利（毛損）'], op: ['營業利益（損失）'], nonop: ['營業外收入及支出'], ni: ['本期淨利（淨損）', '本期稅後淨利（淨損）'], nip: ['淨利（損）歸屬於母公司業主', '淨利（淨損）歸屬於母公司業主'], eps: ['基本每股盈餘（元）'] };
  for (let idx = 0; idx < quarters.length; idx++) {
    const [yy, ss] = quarters[idx];
    for (const mk of ['sii', 'otc']) {
      const html = await getText('https://mopsov.twse.com.tw/mops/web/ajax_t163sb04', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `encodeURIComponent=1&step=1&firstin=1&off=1&isQuery=Y&TYPEK=${mk}&year=${yy}&season=0${ss}` });
      let n = 0;
      for (const tb of tables(html)) {
        const hdr = tb.find(r => r.some(c => strip(c) === '公司名稱')); if (!hdr) continue;
        const names = hdr.map(strip);
        const col = {}; for (const k in want) col[k] = want[k].map(w => names.indexOf(w)).find(i => i >= 0);
        for (const row of tb) {
          if (row.length !== names.length) continue;
          const code = strip(row[0]); if (!/^\d{4}$/.test(code)) continue;
          const s = stocks[code]; if (!s) continue;
          const g = k => (col[k] === undefined ? null : num(row[col[k]]));
          s.q[idx] = [g('rev'), g('gp'), g('op'), g('nonop'), g('ni'), g('nip'), g('eps')]; n++;
        }
      }
      console.log('quarter', yy, ss, mk, n);
      await sleep(800);
    }
  }

  // 4. 基本檢查後寫檔（抓到的家數太少就視為失敗，不覆蓋舊檔）
  const got = Object.values(stocks).filter(s => s.rev[11] != null).length;
  if (got < 1500) throw new Error('too few companies with latest revenue: ' + got);
  fs.writeFileSync(out, JSON.stringify({ asof: { month: monthLabels[11], quarter: quarterLabels[12], fetched: new Date().toISOString().slice(0, 10) }, months: monthLabels, quarters: quarterLabels, stocks }));
  console.log('wrote', out, fs.statSync(out).size, 'companies', Object.keys(stocks).length);
})().catch(e => { console.error(e); process.exit(1); });
