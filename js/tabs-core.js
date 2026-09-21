/* =======================================================================
   js/tabs-core.js — 頁籤切換與「一鍵產生全部分析」總控
   
   v3.3.46：這份程式碼原本和其他 12 個檔案一起擠在 index.html 唯一一個 <script>
   標籤裡。拆成獨立檔案是為了：其一，同一份程式互相牽連太深，過去曾發生過「某一小段
   出錯，導致後面所有按鈕都沒反應」的重大臭蟲；拆開之後，若某一個檔案在載入當下
   丟出例外，只會影響那個檔案剩下的部分，不會連帶讓在它之後載入的其他檔案也失效。
   其二，之後要修改或除錯某個功能時，可以直接找到對應檔案，不用在三千多行的大檔案
   裡面搜尋。
   
   這裡的程式碼內容跟原本 index.html 裡的對應段落逐字相同（純粹搬移、沒有改寫任何
   邏輯），並且刻意維持跟原本一致的「多個 <script> 依序載入、共用同一個全域作用域」
   寫法（沒有改成 ES module），所有函式與變數的呼叫方式完全不變，行為上與拆分前
   100% 相同。載入順序很重要，請維持 index.html 裡目前的 <script src> 排列順序。
========================================================================= */
/* ---------- tabs ---------- */
/* v3.3.60 新增：每個頁籤（01~05）自己產生完成後，在頁籤下方顯示這一次花了多少秒、
   用了多少 tokens，失敗則顯示 ✗。取代原本擠在「一鍵產生」按鈕下方、把三個頁籤結果
   混在同一行難以拆解的長文字說明。tabNum 對應的是 data-tab 的數字（1/2/4/6/7，
   跟既有的 tab-dot id 用同一套編號，不是畫面上 01~05 的顯示順序）。 */
function updateStepMeta(tabNum, meta){
  const el = document.getElementById('stepMeta' + tabNum);
  if (!el) return;
  if (!meta){ el.textContent = ''; el.classList.remove('err'); return; }
  if (meta.failed){ el.textContent = '✗ 失敗'; el.classList.add('err'); return; }
  el.classList.remove('err');
  const sec = Math.max(0, Math.round((meta.durationMs || 0) / 1000));
  const tokens = meta.tokensUsed || 0;
  const tokensDisplay = tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'k' : String(tokens);
  el.textContent = (meta.tokensExact === false ? '約' : '') + sec + 's · ' + tokensDisplay + ' tokens';
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', (event) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    refreshStaleIndicators();

    /* V4.01：五大功能各自獨立產生。只有點擊卡片上的「立即生成」
       才會真正呼叫 AI；點擊卡片其他區域只負責切換頁籤，不會誤觸發生成。 */
    const action = event.target.closest('.v401-step-action');
    const generateId = btn.dataset.generateId;
    if (action && generateId){
      const generateBtn = document.getElementById(generateId);
      if (generateBtn && !generateBtn.disabled){
        generateBtn.click();
      }
    }
  });
});

function syncIndependentStepActions(){
  document.querySelectorAll('.tab-btn[data-generate-id]').forEach(tab => {
    const action = tab.querySelector('.v401-step-action');
    const generateBtn = document.getElementById(tab.dataset.generateId);
    if (!action || !generateBtn) return;
    const disabled = !!generateBtn.disabled || activeRunCount > 0;
    action.classList.toggle('is-disabled', disabled);
    action.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    action.title = disabled
      ? (generateBtn.title || '請先完成上方履歷與職缺資料')
      : '點擊立即生成此功能';
  });
}


/* v3.3.47：「產生」類按鈕在履歷或職缺說明還沒填完整前會是 disabled 狀態，但原本完全
   沒有任何提示告訴使用者「為什麼按不下去、要先做什麼」——對使用者來說，按鈕看起來
   就像壞掉、沒反應。這裡統一補上 title 提示（滑鼠移上去或觸控長按都看得到），並且把
   6 個按鈕的重複判斷邏輯合併成一次迴圈，方便之後如果條件要調整，只要改一個地方。 */
function updateAllButtonStates(){
  const ready = resumeText.trim().length > 10 && sharedJobDesc.value.trim().length > 10;
  const hint = ready ? '' : '請先在上方上傳履歷（PDF／Word）並貼上至少 10 個字的職缺說明';
  ['generateBtn1', 'generateBtn2', 'generateBtn4', 'generateBtn6', 'generateBtn7'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !ready;
    btn.title = hint;
  });
  updateReverseButtonState();
  if (typeof syncIndependentStepActions === 'function') syncIndependentStepActions();
}


/* =========================================================
   v3.0.99：「一鍵產生全部分析」改為依序（而非同時）執行三項分析，
   避免三個高 token 上限的請求同時發送，瞬間衝過供應商的流量／額度限制
   （TPM/RPM）而被擋下。改成依序執行後，同一時間只有 1 個請求在跑，
   完全不會有「同時疊加」的尖峰負載問題；代價是總等待時間變長（大約
   是三項時間加總，而不是取三項中最長的那項），因此加入即時進度顯示：
   目前跑到第幾項、預計還要多久（依過去執行的歷史平均時間估算，沒有
   歷史紀錄時用保守預設值，並以「約」標示，避免誤導）、目前為止已用
   多少 tokens（優先採用 API 實際回傳的用量，若供應商沒提供則以概算
   標示「約」）。
   v3.3.49 修復：整段流程包上 beginRun()／endRun()，讓「一鍵產生全部
   分析」執行期間，客製履歷／提案簡報／反問面試官等其他按鈕也會確實
   被鎖住，不會出現使用者在跑到一半時跑去別的頁籤又觸發一次呼叫、
   重複燒 AI 額度的情況（beginRun／endRun 用計數器設計，runMatch 等
   個別函式內部也各自呼叫這對函式，因此巢狀呼叫時只有最外層的 runAll
   結束才會真正解鎖，中間三個階段銜接時不會有短暫解鎖的空檔）。
========================================================= */
/* V4.01：舊版「一鍵產生全部分析」已移除；五項功能改為各自獨立執行。 */

/* v3.0.99：供「一鍵產生全部分析」讀取每一階段實際用量／耗時的暫存區。
   由 runMatch／runHealthCheck／runInterviewSetup 各自寫入，runAll 依序
   執行時在每個階段完成後讀取，藉此即時顯示「已用 tokens」。 */
const rmStageStats = { match: null, healthcheck: null, interviewSetup: null };

