JobSight v3.3.81 本機使用方式

1. 解壓縮整個 ZIP，不要只開啟 index.html。
2. Windows 直接雙擊 start-local.bat。
3. 程式會自動開啟：http://127.0.0.1:8787/
4. 在「API Key 設定」輸入自己的 Agnes API Key。
5. Agnes 請使用：
   Base URL: https://apihub.agnes-ai.com/v1
   Model: agnes-2.5-flash
6. 之後 match / healthcheck / interviewSetup 都會透過本機 Proxy 呼叫 Agnes，避免瀏覽器 CORS 問題。

安全性：API Key 只在本機瀏覽器與本機 Proxy 間傳送，再由 Proxy 以 Bearer Token 呼叫 Agnes；程式不會把 Key 寫入檔案。

注意：此模式需要 Windows PowerShell（Windows 10/11 一般內建）。若 8787 埠被占用，請關閉占用程式後再啟動。

Netlify 仍可照原方式使用；正式網站會自動使用 /.netlify/functions/agnes-chat。


v3.3.81 修正：本機 API Key 設定模組加入供應商格式檢查、立即測試、模型同步；Agnes 本機 Proxy 支援自訂 Base URL、TLS 1.2 與國際備援路由。
