# 個股財務PK

上市櫃個股依產業篩選，比較月營收月增率、年增率與季報毛利率、營益率、淨利率、EPS，並可查看單檔 12 個月營收明細與近八季 EPS。

- 網頁：`index.html`（純靜態，讀取 `data/snapshot.json`）
- 資料：`scripts/fetch_all.js` 從證交所、櫃買中心 OpenAPI 與公開資訊觀測站抓取，由 GitHub Actions 每天台灣時間 09:30 自動執行並提交
- 手動更新：到 Actions 頁面執行「更新財務資料」

資料為各公司自行申報之公開資訊，僅供參考。
