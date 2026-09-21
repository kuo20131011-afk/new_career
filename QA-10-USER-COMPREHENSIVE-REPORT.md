# 職透 JobSight V3.3.100 — 10 使用者全面 QA / 修復驗證報告

日期：2026-09-21

## 1. QA 目的

以 10 種不同使用者／裝置情境檢查：

- 首頁版面與響應式排版
- 文字是否超出畫面、重疊或被裁切
- 五步驟功能導覽是否可視與可操作
- 主要按鈕是否存在、是否有事件綁定
- Modal / API 設定 / LINE QR 等互動入口
- disabled 狀態是否合理
- JavaScript / Netlify Function 語法
- DOM ID 與程式引用一致性
- 修復後回歸檢查

## 2. 10 位模擬使用者矩陣

| 使用者 | 模擬裝置 | Viewport | 檢查重點 |
|---|---|---:|---|
| U1 | 大型桌機 | 1920×1080 | 完整首頁、Header、STEP、內容卡片 |
| U2 | 桌機 | 1440×900 | 標準桌面版面 |
| U3 | 筆電 | 1280×800 | 中型桌面斷點 |
| U4 | 平板橫向 | 1024×768 | 平板橫向 |
| U5 | 平板直向 | 820×1180 | 直向版面與 STEP 導覽 |
| U6 | 小平板 | 768×1024 | 700px/850px 附近斷點 |
| U7 | 大型手機 | 430×932 | 手機單欄與水平 STEP |
| U8 | 手機 | 390×844 | 常見 Android / iPhone 寬度 |
| U9 | 小手機 | 360×800 | 極窄 Header 與按鈕 |
| U10 | 極窄手機 | 320×740 | 最嚴格的 Header / 文字 / STEP 檢查 |

## 3. 自動化結果

### 通過項目

- JavaScript syntax check：全部通過
- Netlify Functions `.js/.mjs` syntax check：全部通過
- HTML 開關標籤數量：`script 19/19`、`div 147/147`、`button 51/51`、`textarea 3/3`、`select 9/9`
- 靜態 DOM duplicate ID：0
- 10 個 viewport 的 document-level horizontal overflow：0
- 10 個 viewport：均產生完整頁面截圖並完成版面檢查
- 320px Header 修復後：API Key 按鈕與狀態文字不再超出 Header 右界
- 360px 以下：STEP 導覽加入 scroll-snap，降低滑動定位不穩定問題

## 4. 實際發現與修復

### ISSUE-001：320px Header API 狀態超出右側

**原狀況**

在 320px 寬度下，`header-api-row` 與 API status pill 的最小寬度組合可能超出可用寬度。

**修復**

- `header-api-row` 加入 `max-width:100%`、`min-width:0`、`box-sizing:border-box`
- API status pill 加入 `min-width:0`
- 700px 以下強制可換行並限制最大寬度
- 360px 以下再縮小按鈕 padding / status 字體

**結果**

U10（320×740）重新截圖確認 Header 不再被右側裁切。

### ISSUE-002：極窄螢幕 STEP 導覽定位體驗

五步驟本來採水平滑動設計；在 320–430px 寬度一次只能看到部分步驟，這不是 document overflow，而是可橫向捲動容器。

**修復**

在 360px 以下加入：

- `scroll-snap-type:x proximity`
- `scroll-snap-align:start`
- `scroll-padding-inline`

讓使用者滑動 STEP 時能更穩定地停在完整步驟。

## 5. 按鈕與功能完整性檢查

### 已確認有程式綁定的主要功能

- `runAllBtn`
- `generateBtn1`
- `generateBtn2`
- `generateBtn4`
- `generateReverseBtn`
- `generateBtn6`
- `generateBtn7`
- `restoreDraftBtn`
- `dismissDraftBtn`
- `debugToggleBtn`
- `debugCopyBtn`
- `debugClearBtn`
- `jobType`
- `downloadResumeBtn`
- `downloadResumeWordBtn`
- `downloadSlidesBtn`
- `downloadSlidesWordBtn`
- `copyBtn`
- `downloadBtn`

另外 API Provider、Modal、Header 導覽等部分使用 inline handler 或資料屬性事件，因此不會全部以 `getElementById(...).addEventListener(...)` 的形式出現。

## 6. Disabled 按鈕判定

在未上傳履歷、未完成職缺說明時，以下產生類按鈕保持 disabled：

- 一鍵產生
- 媒合分析
- 履歷健診
- 模擬面試
- 客製履歷
- 提案簡報
- 反問清單

這屬於輸入前置條件，不視為按鈕失效；程式同時會設定提示文字，說明需要先完成履歷與職缺說明。

## 7. 文字重疊檢查

自動化幾何檢查中，STEP button 與其內部 `.step-label/.step-meta` 被偵測為幾何重疊；這是正常的「父容器包含子元素」，不是文字互相覆蓋，因此不列為缺陷。

視覺截圖另行確認主要文字、卡片、按鈕與 Header 沒有發現明顯互相覆蓋。

## 8. 其他 AI 複核建議

其他 AI 可用下列條件重新驗證：

1. 320×740、360×800、390×844、430×932 必須無 Header 右側裁切。
2. `document.documentElement.scrollWidth <= innerWidth`。
3. 五步驟不得出現兩條連線；只允許 `.v399-step-line`。
4. `#mainTabs.tabs::before` 與 `.tab-btn:not(:last-child)::before` 必須保持停用。
5. 產生類按鈕在缺少履歷／職缺說明時必須 disabled。
6. 上傳履歷後再驗證按鈕是否由 disabled 轉為可用。
7. 每個主要功能點擊後不得產生未捕捉的 JavaScript exception。
8. API Modal 必須能開啟、關閉，Provider tab 必須可切換。
9. LINE QR Modal 必須能開啟、Esc 關閉、點背景關閉。
10. 匯出 PDF / Word 必須在真實瀏覽器與真實檔案輸入後再做一次部署環境測試。

## 9. 尚未能在離線 QA 環境做的項目

以下需要真實部署環境、有效 API Key 或真實檔案，因此不能假裝已完成：

- Google / Netlify Identity 真實登入流程
- Claude / Gemini / OpenAI / Agnes / NVIDIA / Groq / OpenRouter / Mistral 真實 API 呼叫
- 各供應商 CORS / quota / rate limit 行為
- 真實 PDF.js PDF 解析
- 真實 Mammoth DOC/DOCX 解析
- Netlify Functions + Netlify Blobs 實際讀寫
- 真實使用者登入後台權限
- 真實 PDF / Word 匯出內容在不同作業系統的列印結果

這些項目應在 staging / production URL 進行第二階段 E2E 驗收。

## 10. QA 結論

本次已完成：**10 viewport responsive QA + 靜態程式檢查 + UI 截圖檢查 + 主要互動結構檢查 + 問題修復 + 修復後回歸檢查**。

目前沒有發現會直接造成整頁水平溢位的版面問題；已修復最窄 320px Header 裁切問題，並改善極窄裝置 STEP 導覽的滑動定位。

「經得起其他 AI 檢驗」的標準上，本包同時附上本報告與測試證據；但真實 API、登入、Netlify Functions 與檔案解析仍必須在部署環境完成 E2E，不能以離線測試冒充已驗證。
