# 個股財務PK

上市櫃個股依產業篩選，比較月營收月增率、年增率、近 20 日日均成交量（張）與季報毛利率、營益率、淨利率、業外收支/營收、EPS，可用日均量、毛利率、營益率等條件篩選，並可查看單檔 12 個月營收明細與近八季 EPS。

- 網頁：`index.html`（純靜態，讀取 `data/snapshot.json`）
- 資料：`scripts/fetch_all.js` 從證交所、櫃買中心 OpenAPI 與公開資訊觀測站抓取，由 GitHub Actions 每天台灣時間 09:30 自動執行並提交
- 即時股價：`worker/`（Cloudflare Worker，代為查詢證交所即時報價，部署：在 worker 資料夾執行 `npx wrangler deploy`），網址填在 index.html 的 PRICE_API
- 手動更新：到 Actions 頁面執行「更新財務資料」

資料為各公司自行申報之公開資訊，僅供參考。
