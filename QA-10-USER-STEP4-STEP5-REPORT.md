# V3.3.101 — Step 4 / Step 5 QA 回歸報告

## 本次需求
1. 第 4 步改為真正可單選的 AI Provider。
2. 單選 AI 後立即顯示 API Key + Model ID 輸入區，不再「點了沒反應」。
3. 儲存後以 sessionStorage 啟用該 Provider。
4. 第 5 步維持「一鍵產生履歷分析（媒合／健診／模擬面試）」。
5. 第 4、5 步使用完全一致的淡紫底色。
6. Footer Email Gmail 主旨改為：`職透-建議與需求`。

## 已完成的驗證
- 所有專案 JavaScript 通過 `node --check`。
- HTML 結構檢查：13 個 `<style>` 開閉數量一致、19 個 `<script>` 開閉數量一致。
- Duplicate ID：0。
- Step 4 Provider：8 個，Claude / Gemini / OpenAI / Agnes / NVIDIA NIM / GroqCloud / OpenRouter / Mistral AI。
- Step 4 badge：4。
- Step 5 badge：5。
- Step 4 inline config 預設隱藏，選擇 Provider 後由 `selectInlineProvider()` 展開。
- Mock DOM interaction test：選 Gemini 後，設定區顯示、標題正確、radio active 狀態正確；填入測試 API Key + Model ID 後，Provider / Key / Model 正確寫入 sessionStorage，狀態變成「✓ API Key 已設定並啟用」。
- Email subject：已確認 URL 使用 `職透-建議與需求` 的 UTF-8 percent encoding。
- Step 4 / Step 5 CSS 使用相同 `linear-gradient(100deg,#eee7ff,#fff 56%,#f6f1ff)` 底色。

## 10 viewport 回歸策略
本版本沿用上一輪 10 尺寸 QA 範圍：1920 / 1440 / 1280 / 1024 / 820 / 768 / 430 / 390 / 360 / 320 px。
本次新增的 CSS 在 <=900px、<=560px、<=340px 都有明確 breakpoint；Provider grid 在窄螢幕會由 4 欄降為 2 欄，再降為 1 欄，API Key / Model 欄位也會由三欄降為單欄。

## 外部服務限制
本次不以真實 AI API Key 呼叫作為 UI 修復的必要條件；真實 API 呼叫仍需使用者自己的有效 Key、額度與原廠服務。瀏覽器 E2E 執行環境若阻擋本機 Chromium 導航，則不把該環境限制偽裝成「真實瀏覽器 E2E 通過」。
