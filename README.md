## V3.3.100 UI 修正
- 修正頂部 Header 導覽文字重疊。
- 五步驟只保留一條連線，停用舊版 pseudo-element 連線。
- 一鍵產生執行中改為高辨識度按鈕＋狀態列，逐階段顯示目前進度。
- 保留履歷詳細內容浮動視窗。

# 職透 JobSight｜V3.3.99 A 典藏澄思｜測試模式

## 本版重點
- 首頁改為「Hero + 兩欄工作區」，不再使用三欄輸入配置。
- STEP 1「上傳履歷」獨立左欄；STEP 2「輸入職務類型」與 STEP 3「職缺說明」合併在右欄同一卡片，改為上下排列，降低橫向浪費。
- STEP 2／STEP 3 之間加入清楚分隔線與間距，避免內容過度貼近。
- AI 智能分析區與輸入區、五步驟導覽之間加入明確留白。
- 五步驟 01～05 固定單排等距排列；連線只通過數字圓點中心高度，並用白底節點／文字隔離，避免線與文字重疊。
- 五個步驟資料頁增加左右安全邊界，避免內容貼近畫面邊緣。
- 履歷擷取文字維持「預覽＋查看詳細內容」模式，長文字預設收合，點擊後才展開。
- 「選擇 AI 模型 ›」直接開啟既有 API / AI 模型設定視窗並捲動到設定區。
- Google / Netlify Identity 登入維持測試模式隱藏；登入程式保留，未刪除正式登入能力。
- 保留原有功能 ID、JavaScript 事件與 API Provider 設定。

## 版面確認
本版先產生固定 1600×1100 的靜態渲染截圖進行版面確認，再打包提供測試：
- `V3.3.99-LAYOUT-CONFIRMED-PAGE1.png`：首頁 Hero、兩欄輸入區、STEP 2＋3 合併、AI 模型區。
- `V3.3.99-LAYOUT-CONFIRMED-PAGE2.png`：五步驟導覽、資料頁安全邊界、頁尾。

> 注意：執行環境的 Chromium headless 無法完成啟動，因此上述截圖是使用 HTML/CSS 靜態渲染引擎產生的版面確認圖，不宣稱為 Chrome 實機截圖。

## 測試結果
- 所有 `js/*.js` 通過 `node --check`。
- HTML ID 掃描：140 個 ID、0 個重複。
- 關鍵功能 ID 均存在：`dropzone`、`fileInput`、`jobType`、`sharedJobDesc`、`runAllBtn`、`mainTabs`、`api-modal`。
- STEP 2／STEP 3 已在同一張 `.v398-job-card` 內。
- 五步驟為同一 `#mainTabs` 水平 flex 容器，桌面版禁止換行。

## 部署
- 靜態網站，無需 Build Command。
- Publish directory：`.`
- Functions directory：`netlify/functions`
- 建議 GitHub repository 根目錄直接放 `index.html`、`netlify.toml`、`package.json`、`js/`、`assets/`、`netlify/`。

## 版本
V3.3.99


## V3.3.101 QA HARDENED
- Step 4 AI provider cards are real single-select controls.
- Selecting a provider immediately reveals inline API Key + Model ID fields.
- Step 5 keeps the same lavender background treatment and remains the execution action.
- Footer Gmail subject is `職透-建議與需求`.
