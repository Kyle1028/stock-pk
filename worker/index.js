// 即時股價中繼：網頁（GitHub Pages）不能直接呼叫證交所 mis 即時報價（沒有 CORS），
// 由這支 Cloudflare Worker 代為查詢並加上 CORS。用法：GET /?codes=2362,2353,6488
// 回傳 { "2362": { p: 現價, y: 昨收, t: "HH:MM:SS", live: 是否有成交價 }, ... }
const ALLOW = ['https://kyle1028.github.io', 'http://localhost:8123', 'http://localhost:8080'];
const MAX = 120;

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ALLOW.includes(origin) ? origin : ALLOW[0], 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (origin && !ALLOW.includes(origin)) return new Response('forbidden', { status: 403 });

    const codes = [...new Set((new URL(req.url).searchParams.get('codes') || '').split(',').map(s => s.trim()).filter(c => /^\d{4}$/.test(c)))].slice(0, MAX);
    if (!codes.length) return Response.json({}, { headers: cors });

    // 不知道上市或上櫃，兩邊都查；查不到的會被略過
    const ex = codes.flatMap(c => [`tse_${c}.tw`, `otc_${c}.tw`]).join('|');
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex}&json=1&delay=0`;
    let j;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://mis.twse.com.tw/stock/index.jsp' }, cf: { cacheTtl: 5, cacheEverything: true } });
      j = await r.json();
    } catch (e) { return Response.json({ error: 'upstream' }, { status: 502, headers: cors }); }

    const num = s => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
    const out = {};
    for (const m of j.msgArray || []) {
      const y = num(m.y); if (y == null) continue;
      let p = num(m.z), live = p != null;
      if (p == null) { const a = num((m.a || '').split('_')[0]), b = num((m.b || '').split('_')[0]); p = a != null && b != null ? (a + b) / 2 : (b ?? a ?? y); }  // 尚無成交：用最佳買賣價中間值，再不行用昨收
      out[m.c] = { p, y, t: m.t || '', live };
    }
    return Response.json(out, { headers: { ...cors, 'Cache-Control': 'no-store' } });
  },
};
