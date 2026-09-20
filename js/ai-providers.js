/* =======================================================================
   js/ai-providers.js — AI 呼叫層（各供應商 fetch 函式、重試機制、JSON 解析修復、統一入口 callClaude）
   
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
/* ---------------- 通用重試包裝器：處理 429/502/503/504 等暫時性錯誤 ---------------- */
/* v3.3.65 修復：429（額度／頻率已達上限）原本跟 502/503/504（伺服器暫時性錯誤）
   用同一套「短延遲、連續重試」邏輯，被一視同仁塞進 RM_RETRYABLE_STATUSES。
   問題是：502/503 這類錯誤本來就適合「等一下下、馬上再試一次」，通常真的是暫時
   的；但 429 代表「已經在限流視窗裡超過額度」，用 1.2 秒／2.4 秒／4.8 秒這種短
   延遲連續重試 3 次，等於在同一個限流視窗裡硬塞更多請求進去，不但不會讓限流恢復，
   反而會把使用者原本沒超過的 RPM（每分鐘請求數）額度也一起燒光——這正是使用者
   回報「Agnes AI 額度明明沒滿卻一直顯示已達上限」的根本原因：不是額度真的用完，
   是「一鍵產生」三個階段只要有一個先撞到 429，程式自己在幾秒內對同一個限流窗口
   補打了 3 次重試，等於幫使用者把 RPM 燒到真的超過。
   改成 429 單獨處理，不再跟 502/503/504 共用同一套重試邏輯：只認伺服器回應的
   Retry-After 標頭，有給就照著等一次（最多等 30 秒，避免畫面卡太久），沒有給
   就直接回報失敗、不再盲目重試——寧可讓使用者自己按一次重試，也不要在使用者
   不知情的狀況下，一次呼叫就偷偷幫他多打好幾發請求去撞同一道限流牆。 */
const RM_SERVER_ERROR_STATUSES = [502, 503, 504];

/* v3.3.76：集中式 AI Request Governor
   目的不是繞過供應商限制，而是在瀏覽器端主動排隊、預留與計算請求額度，
   讓單一瀏覽器／多分頁盡量維持在使用者設定的安全線以下。
   安全線採「小於」：RPM 14、RPD 49、TPM 19,000。
   注意：瀏覽器無法對多台裝置／多個瀏覽器的同一 API 專案做全域硬保證；若要硬保證，
   必須把 API 呼叫移到有集中狀態的 server-side proxy。這裡不做 key rotation 或其他規避限流。
*/
const RM_GOVERNOR = {
  rpm: 14, rpd: 49, tpm: 19000,
  storageKey: 'jobsight_ai_governor_v376',
  channel: null,
  state(){
    try { return JSON.parse(localStorage.getItem(this.storageKey) || '{"requests":[],"tokens":[]}'); }
    catch(e){ return {requests:[],tokens:[]}; }
  },
  save(st){ try { localStorage.setItem(this.storageKey, JSON.stringify(st)); } catch(e){} try{ this.channel?.postMessage({type:'sync'}); }catch(e){} },
  prune(st, now){
    st.requests=(st.requests||[]).filter(t=>now-t<86400000);
    st.tokens=(st.tokens||[]).filter(x=>now-x.t<60000);
    return st;
  },
  init(){ try{ this.channel=new BroadcastChannel('jobsight_ai_governor'); }catch(e){} },
  estimate(text){ return Math.max(1, Math.ceil(String(text||'').length/2)); },
  async waitForBudget(tokenReservation){
    const need=Math.max(1,Math.ceil(tokenReservation||1));
    if(need>=this.tpm) throw new Error('rate_limit:本次 AI 輸入內容本身已接近或超過 19,000 TPM 安全線，為避免撞到供應商限制，請縮短履歷／職缺文字後再試。');
    for(;;){
      const now=Date.now(); let st=this.prune(this.state(),now);
      const req60=st.requests.filter(t=>now-t<60000).length;
      const reqDay=st.requests.length;
      const tok60=st.tokens.reduce((sum,x)=>sum+x.n,0);
      let wait=0;
      if(req60>=this.rpm) wait=Math.max(wait,60000-(now-Math.min(...st.requests.filter(t=>now-t<60000))));
      if(reqDay>=this.rpd){ const first=st.requests[0]; wait=Math.max(wait,86400000-(now-first)); }
      if(tok60+need>this.tpm){
        const sorted=st.tokens.filter(x=>now-x.t<60000).sort((a,b)=>a.t-b.t);
        let running=tok60;
        for(const x of sorted){ running-=x.n; if(running+need<=this.tpm){ wait=Math.max(wait,60000-(now-x.t)); break; } }
        if(running+need>this.tpm && sorted.length) wait=Math.max(wait,60000-(now-sorted[sorted.length-1].t));
      }
      if(wait<=0){
        st.requests.push(now); st.tokens.push({t:now,n:need}); this.save(st);
        return;
      }
      const seconds=Math.ceil(wait/1000);
      throw Object.assign(new Error('rate_queue:AI 請求已排隊，為避免超過安全額度，請約 '+seconds+' 秒後再試。'),{code:'RATE_QUEUE',waitMs:wait});
    }
  },
  chargeActual(extraTokens){
    const n=Math.max(0,Math.ceil(Number(extraTokens)||0)); if(!n) return;
    const now=Date.now(); const st=this.prune(this.state(),now); st.tokens.push({t:now,n}); this.save(st);
  }
};
RM_GOVERNOR.init();


async function fetchWithRetry(fetchFn, maxRetries, governorMeta){
  let lastResp = null;
  let rateLimitRetried = false;
  for (let attempt = 0; attempt <= maxRetries; attempt++){
    let resp;
    try {
      if (governorMeta && governorMeta.reserve) await RM_GOVERNOR.waitForBudget(governorMeta.tokens);
      resp = await fetchFn();
    }
    catch (err){
      if (attempt < maxRetries){ await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1200)); continue; }
      throw err;
    }
    if (resp.ok) return resp;

    if (resp.status === 429){
      if (!rateLimitRetried){
        const retryAfterHeader = resp.headers && resp.headers.get ? resp.headers.get('retry-after') : null;
        const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : NaN;
        if (!isNaN(retryAfterSec) && retryAfterSec > 0){
          rateLimitRetried = true;
          await new Promise(r => setTimeout(r, retryAfterSec * 1000));
          continue;
        }
      }
      return resp;
    }

    if (RM_SERVER_ERROR_STATUSES.includes(resp.status) && attempt < maxRetries){
      lastResp = resp;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1200));
      continue;
    }
    return resp;
  }
  return lastResp;
}

/* =========================================================
   v2.9.199 修正：各家供應商的 max_tokens／maxOutputTokens 參數都有
   API 本身的硬性上限（例如 OpenAI 相容端點常見上限落在 16000 左右，
   部分模型甚至更低），若直接把使用者要求的數字（可能高達 45000）原封
   不動送出去，API 極可能直接回傳 400 錯誤（invalid_request_error：
   max_tokens 超過該模型上限），而不是我們原本想解決的「輸出被截
   斷」。因此在真正送出前，統一夾住（clamp）在各供應商已知安全上限
   之內，同時仍盡量給到最大可用值，兩者兼顧。
========================================================= */
const RM_MAX_TOKENS_CAP = { claude: 16000, gemini: 16000, chatgpt: 16000, agnes: 16000, builtin: 8000 };
function clampMaxTokens(provider, requested){
  const cap = RM_MAX_TOKENS_CAP[provider] || 8000;
  const value = requested || 1200;
  return Math.min(value, cap);
}

/* v3.0.99：部分供應商（尤其是舊版/相容端點）不一定會在回應中附上正確的
   usage／用量資訊，這裡提供一個粗略的備援估算（依中英文混合文字概算，
   非精確計算），只在 API 沒有回傳實際用量時才使用，並在畫面上以「約」
   標示，避免誤導使用者以為是精確數字。*/
function estimateTokensFallback(promptText, responseText){
  const totalChars = String(promptText || '').length + String(responseText || '').length;
  return Math.max(1, Math.ceil(totalChars / 2));
}

/* ---------------- 系統內建連線（未設定金鑰時的預設行為，維持原本相容性） ---------------- */
async function fetchClaudeBuiltInText(systemPrompt, userContent, maxTokens){
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: clampMaxTokens('builtin', maxTokens),
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    })
  });
  if (!response.ok){
    let bodyText = '';
    try { bodyText = await response.text(); } catch (e){}
    throw new Error('API 回應失敗 (' + response.status + ')' + (bodyText ? '：' + bodyText.slice(0, 200) : ''));
  }
  const data = await response.json();
  const textBlock = (data.content || []).find(b => b.type === 'text');
  if (!textBlock) throw new Error('沒有收到回應內容，原始回應：' + JSON.stringify(data).slice(0, 300));
  const usage = data.usage;
  const tokensUsed = usage ? (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0)) : estimateTokensFallback(systemPrompt + userContent, textBlock.text);
  return { text: textBlock.text, truncated: data.stop_reason === 'max_tokens', tokensUsed, tokensExact: !!usage };
}

/* ---------------- Claude (Anthropic) —— 使用者自行貼上的 API Key ---------------- */
async function fetchClaudeText(systemPrompt, userContent, maxTokens, key){
  const doFetch = () => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: getModelFor('claude'),
      max_tokens: clampMaxTokens('claude', maxTokens),
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  });
  const resp = await fetchWithRetry(doFetch, 2, { reserve:true, tokens: (window.__RM_CURRENT_RESERVATION_TOKENS || 1) });
  if (!resp.ok){
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error('auth_error:Claude API Key 無效或已過期，請重新確認金鑰');
    if (resp.status === 429) throw new Error('rate_limit:Claude API 額度或頻率已達上限，請稍待片刻再試（短時間內連續重試可能會讓限制更難恢復）');
    if (resp.status === 503) throw new Error('overloaded:Claude 伺服器目前負載過高（503），已自動重試但仍無法回應，請稍後再試');
    throw new Error('api_error:' + resp.status + '：' + errText.slice(0, 200));
  }
  const data = await resp.json();
  const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
  if (!textBlocks.length) throw new Error('empty_response:Claude 回應中沒有文字內容');
  const text = textBlocks.join('');
  const usage = data.usage;
  const tokensUsed = usage ? (Number(usage.input_tokens || 0) + Number(usage.output_tokens || 0)) : estimateTokensFallback(systemPrompt + userContent, text);
  return { text, truncated: data.stop_reason === 'max_tokens', tokensUsed, tokensExact: !!usage };
}

/* ---------------- Gemini (Google AI Studio) ---------------- */
async function fetchGeminiText(systemPrompt, userContent, maxTokens, key){
  const doFetch = () => fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(getModelFor('gemini')) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { maxOutputTokens: clampMaxTokens('gemini', maxTokens) }
    })
  });
  let resp;
  try { resp = await fetchWithRetry(doFetch, 2, { reserve:true, tokens: (window.__RM_CURRENT_RESERVATION_TOKENS || 1) }); }
  catch (networkErr){ throw new Error('cors_or_network:Gemini API 連線失敗，最常見原因是瀏覽器跨來源請求（CORS）被阻擋，建議改用其他供應商。'); }
  if (!resp.ok){
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) throw new Error('auth_error:Gemini API Key 無效、未啟用或權限不足，請至 aistudio.google.com/apikey 確認');
    if (resp.status === 429) throw new Error('rate_limit:Gemini API 額度或頻率已達上限，請稍待片刻再試（短時間內連續重試可能會讓限制更難恢復）');
    if (resp.status === 503) throw new Error('overloaded:Gemini 模型目前負載過高（503），已自動重試但仍無法回應，請稍後再試或改用其他供應商');
    throw new Error('api_error:' + resp.status + '：' + errText.slice(0, 200));
  }
  const data = await resp.json();
  const candidate = data.candidates && data.candidates[0];
  const parts = (candidate && candidate.content && candidate.content.parts) || [];
  const text = parts.filter(p => p.text).map(p => p.text).join('');
  const finishReason = candidate && candidate.finishReason;
  if (!text){
    if (finishReason && finishReason !== 'STOP') throw new Error('empty_response:Gemini 回應被中斷（finishReason: ' + finishReason + '），可能是輸出超過長度限制，請稍後再試');
    throw new Error('empty_response:Gemini 回應中沒有文字內容');
  }
  const usageMeta = data.usageMetadata;
  const tokensUsed = usageMeta ? Number(usageMeta.totalTokenCount || 0) : estimateTokensFallback(systemPrompt + userContent, text);
  return { text, truncated: finishReason === 'MAX_TOKENS', tokensUsed, tokensExact: !!usageMeta };
}

/* ---------------- ChatGPT (OpenAI) ---------------- */
async function fetchChatGPTText(systemPrompt, userContent, maxTokens, key){
  const doFetch = () => fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    },
    body: JSON.stringify({
      model: getModelFor('chatgpt'),
      max_tokens: clampMaxTokens('chatgpt', maxTokens),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    })
  });
  let resp;
  try { resp = await fetchWithRetry(doFetch, 2, { reserve:true, tokens: (window.__RM_CURRENT_RESERVATION_TOKENS || 1) }); }
  catch (networkErr){ throw new Error('cors_or_network:ChatGPT (OpenAI) API 連線失敗，可能是瀏覽器跨來源請求（CORS）被阻擋，建議改用其他供應商。'); }
  if (!resp.ok){
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401) throw new Error('auth_error:OpenAI API Key 無效或已過期，請重新確認金鑰');
    if (resp.status === 429) throw new Error('rate_limit:OpenAI API 額度或頻率已達上限，請稍待片刻再試（短時間內連續重試可能會讓限制更難恢復）');
    if (resp.status === 503) throw new Error('overloaded:OpenAI 伺服器目前負載過高（503），已自動重試但仍無法回應，請稍後再試');
    throw new Error('api_error:' + resp.status + '：' + errText.slice(0, 200));
  }
  const data = await resp.json();
  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text){
    if (choice && choice.finish_reason === 'length') throw new Error('empty_response:ChatGPT 回應被截斷（finish_reason: length，輸出超過長度限制），請稍後再試或增加長度上限');
    throw new Error('empty_response:ChatGPT 回應中沒有文字內容');
  }
  const usage = data.usage;
  const tokensUsed = usage ? Number(usage.total_tokens || 0) : estimateTokensFallback(systemPrompt + userContent, text);
  return { text, truncated: choice && choice.finish_reason === 'length', tokensUsed, tokensExact: !!usage };
}

/* ---------------- Agnes AI（OpenAI 相容端點） ---------------- */
async function fetchAgnesText(systemPrompt, userContent, maxTokens, key){
  // v3.3.79：不要讓瀏覽器直接跨來源呼叫 Agnes。
  // 直接 fetch https://apihub.agnes-ai.com 在一般瀏覽器會受 CORS／DNS／網路環境影響，
  // 即使 API Key 正確也可能在真正送出 HTTP 請求前就失敗。
  // Netlify 部署後改走同源 Function，由 server-side 代理轉發至 Agnes。
  // v3.3.80：同時支援 Netlify 與 Windows 本機使用。
  // 本機透過 start-local.bat 啟動的 localhost proxy，避免 file:// 瀏覽器直接跨來源呼叫 Agnes。
  const isLocalHost = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname || '');
  const isFileMode = window.location.protocol === 'file:';
  const proxyUrl = isFileMode
    ? 'http://127.0.0.1:8787/api/agnes'
    : (isLocalHost ? '/api/agnes' : '/.netlify/functions/agnes-chat');
  const directBaseUrl = (getBaseUrlFor('agnes') || 'https://apihub.agnes-ai.com/v1').replace(/\/+$/, '');
  const payload = {
    model: getModelFor('agnes'),
    max_tokens: clampMaxTokens('agnes', maxTokens),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ]
  };
  const doFetch = () => fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Agnes-Api-Key': key,
      'X-Agnes-Base-Url': directBaseUrl
    },
    body: JSON.stringify(payload)
  });
  let resp;
  // Agnes AI 實測連線穩定度略低於 Claude／Gemini／OpenAI，重試次數加到 3 次（共 4 次嘗試）。
  try { resp = await fetchWithRetry(doFetch, 3, { reserve:true, tokens: (window.__RM_CURRENT_RESERVATION_TOKENS || 1) }); }
  catch (networkErr){ throw new Error('cors_or_network:Agnes AI 本機/代理連線失敗（已自動重試 3 次）。請確認 start-local.bat 已啟動；若主線路 DNS/TLS 無法連線，API 設定可改用 https://apihub.agnes-ai.cn/v1。當前 Base URL：' + directBaseUrl); }
  if (!resp.ok){
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) throw new Error('auth_error:Agnes AI API Key 無效或權限不足，請確認金鑰是否正確');
    if (resp.status === 429) throw new Error('rate_limit:Agnes AI API 額度或頻率已達上限，請稍待片刻再試（短時間內連續重試可能會讓限制更難恢復）');
    if (resp.status === 503) throw new Error('overloaded:Agnes AI 伺服器目前負載過高（503），已自動重試但仍無法回應，請稍後再試');
    throw new Error('api_error:' + resp.status + '：' + errText.slice(0, 200));
  }
  const data = await resp.json();
  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text){
    // 實測 Agnes AI 在輸出被截斷（超過 max_tokens）時，有時會回傳完全空白的
    // content，而不是回傳「寫到一半」的內容，因此這裡明確區分「被截斷」與
    // 「單純沒有內容」兩種情況，方便判斷是否該提高 maxTokens。
    if (choice && choice.finish_reason === 'length') throw new Error('empty_response:Agnes AI 回應被截斷（finish_reason: length，輸出超過長度限制），請稍後再試或增加長度上限');
    throw new Error('empty_response:Agnes AI 回應中沒有文字內容');
  }
  const usage = data.usage;
  const tokensUsed = usage ? Number(usage.total_tokens || 0) : estimateTokensFallback(systemPrompt + userContent, text);
  return { text, truncated: choice && choice.finish_reason === 'length', tokensUsed, tokensExact: !!usage };
}

/* ---------------- 新增 OpenAI 相容供應商：NVIDIA NIM / GroqCloud / OpenRouter / Mistral ----------------
   這四家均採 OpenAI-compatible Chat Completions；模型與 Base URL 從 API Key 設定頁
   讀取，不把免費模型名稱寫死。OpenRouter 可使用 openrouter/free，讓原廠自動選擇
   當下可用的免費模型。 */
async function fetchOpenAICompatibleProviderText(provider, systemPrompt, userContent, maxTokens, key){
  const baseUrl = getBaseUrlFor(provider).replace(/\/+$/, '');
  const model = getModelFor(provider);
  if (!baseUrl || !model) throw new Error('config_error:' + (PROVIDER_LABEL[provider] || provider) + ' 缺少 Base URL 或模型 ID');
  const doFetch = () => fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model,
      max_tokens: clampMaxTokens(provider, maxTokens),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ]
    })
  });
  let resp;
  try { resp = await fetchWithRetry(doFetch, 2, { reserve:true, tokens: (window.__RM_CURRENT_RESERVATION_TOKENS || 1) }); }
  catch (networkErr){ throw new Error('cors_or_network:' + (PROVIDER_LABEL[provider] || provider) + ' API 連線失敗，請確認 Base URL、CORS 與網路連線。'); }
  if (!resp.ok){
    const errText = await resp.text().catch(() => '');
    if (resp.status === 401 || resp.status === 403) throw new Error('auth_error:' + (PROVIDER_LABEL[provider] || provider) + ' API Key 無效或權限不足');
    if (resp.status === 429) throw new Error('rate_limit:' + (PROVIDER_LABEL[provider] || provider) + ' 額度或頻率已達上限，請稍待片刻再試');
    if (resp.status === 503) throw new Error('overloaded:' + (PROVIDER_LABEL[provider] || provider) + ' 服務目前負載過高（503），已自動重試但仍無法回應');
    throw new Error('api_error:' + resp.status + '：' + errText.slice(0, 300));
  }
  const data = await resp.json();
  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text){
    if (choice && (choice.finish_reason === 'length' || choice.finish_reason === 'max_tokens'))
      throw new Error('empty_response:' + (PROVIDER_LABEL[provider] || provider) + ' 回應被截斷（輸出超過長度限制）');
    throw new Error('empty_response:' + (PROVIDER_LABEL[provider] || provider) + ' 回應中沒有文字內容');
  }
  const usage = data.usage;
  const tokensUsed = usage ? Number(usage.total_tokens || 0) : estimateTokensFallback(systemPrompt + userContent, text);
  return { text, truncated: choice.finish_reason === 'length' || choice.finish_reason === 'max_tokens', tokensUsed, tokensExact: !!usage };
}

/* =========================================================
   v3.0.99：新增「階段耗時歷史紀錄」與「用量附加資訊」，供「一鍵產生全部
   分析」在依序執行時，即時顯示目前跑到哪一項、預計還要多久、已用多少
   tokens。歷史紀錄只存在本次瀏覽器分頁（sessionStorage），跑過幾次後
   預估時間會越來越準；沒有歷史紀錄時使用保守的預設猜測值。
========================================================= */
const RM_STAGE_HISTORY_KEY = RM_KEY_PREFIX + 'stageDurationHistory';
function getStageHistory(){
  try { return JSON.parse(sessionStorage.getItem(RM_STAGE_HISTORY_KEY) || '{}'); }
  catch (e){ return {}; }
}
function recordStageDuration(label, ms){
  try {
    const hist = getStageHistory();
    if (!hist[label]) hist[label] = [];
    hist[label].push(ms);
    if (hist[label].length > 5) hist[label] = hist[label].slice(-5);
    sessionStorage.setItem(RM_STAGE_HISTORY_KEY, JSON.stringify(hist));
  } catch (e){}
}
const RM_STAGE_DEFAULT_MS = { match: 14000, healthcheck: 28000, interviewSetup: 12000 };
function estimateStageDuration(label){
  const hist = getStageHistory();
  const arr = hist[label];
  if (arr && arr.length) return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  return RM_STAGE_DEFAULT_MS[label] || 15000;
}

/* ---------------- 統一入口（依目前選擇的供應商分派） ----------------
   呼叫端的用法完全不變：callClaude(systemPrompt, userContent, maxTokens) -> 回傳解析後的 JSON 物件。
   若已設定任一供應商的 API Key，會改用該供應商的真實 API；
   若未設定任何金鑰，則沿用系統內建連線（原本的行為）。
   第 4 個參數 opts（選填）：{ label } —— 若提供 label，會把這次呼叫的
   實際耗時記錄進「階段耗時歷史」，用於之後估算「一鍵產生全部分析」還
   需要多久；同時回傳的 JSON 物件上會附加一個 __meta 欄位
   { tokensUsed, tokensExact, durationMs, provider, label }，
   供呼叫端（例如 runAll）讀取本次實際用量與耗時，不影響原本欄位。 */
async function callClaude(systemPrompt, userContent, maxTokens, opts){
  const label = opts && opts.label;
  const startedAt = Date.now();
  const requestedTokens = Math.max(256, Number(maxTokens || 1200));
  const estimatedInputTokens = RM_GOVERNOR.estimate(String(systemPrompt || '') + String(userContent || ''));
  const safeOutputTokens = Math.max(256, Math.min(requestedTokens, RM_GOVERNOR.tpm - estimatedInputTokens));
  if (safeOutputTokens < 256) throw new Error('rate_limit:本次輸入內容太長，無法在 19,000 TPM 安全線內保留最小輸出空間，請縮短履歷或職缺文字。');
  window.__RM_CURRENT_RESERVATION_TOKENS = estimatedInputTokens + safeOutputTokens;
  maxTokens = safeOutputTokens;
  /* v3.3.65 修復：原本是「先呼叫、成功後才記錄用了哪個供應商」（例如
     `result = await fetchAgnesText(...); usedProvider = 'agnes';` 兩件事寫在同一行）。
     只要 await 那段丟出例外（例如 Agnes 被限流），後面那行賦值根本沒機會執行，
     usedProvider 就會停留在一開始初始化的 'builtin'，導致除錯紀錄／錯誤訊息裡
     出現「provider:builtin」但訊息內容卻寫著「Agnes AI」這種自相矛盾的組合——
     並不是系統真的跑去呼叫內建連線，只是記錄用的變數沒有跟著更新。改成「先決定
     要呼叫誰、把 usedProvider 設好，再真的發送請求」，記錄一律準確反映實際呼叫
     的是哪一個供應商，不論成功或失敗。 */
  let result = null;
  const provider = getProvider();
  const key = provider ? getKeyFor(provider) : '';
  const usedProvider = (key && (provider === 'claude' || provider === 'gemini' || provider === 'chatgpt' || provider === 'agnes' || provider === 'nvidia' || provider === 'groq' || provider === 'openrouter' || provider === 'mistral'))
    ? provider
    : 'builtin';
  try {
    if (usedProvider === 'claude'){ result = await fetchClaudeText(systemPrompt, userContent, maxTokens, key); }
    else if (usedProvider === 'gemini'){ result = await fetchGeminiText(systemPrompt, userContent, maxTokens, key); }
    else if (usedProvider === 'chatgpt'){ result = await fetchChatGPTText(systemPrompt, userContent, maxTokens, key); }
    else if (usedProvider === 'agnes'){ result = await fetchAgnesText(systemPrompt, userContent, maxTokens, key); }
    else if (usedProvider === 'nvidia' || usedProvider === 'groq' || usedProvider === 'openrouter' || usedProvider === 'mistral'){
      result = await fetchOpenAICompatibleProviderText(usedProvider, systemPrompt, userContent, maxTokens, key);
    }
    else { result = await fetchClaudeBuiltInText(systemPrompt, userContent, maxTokens); }

    const rawText = result.text;
    window.__RM_CURRENT_RESERVATION_TOKENS = 1;
    try {
      const parsed = parseJsonLoose(rawText);
      const durationMs = Date.now() - startedAt;
      addDebugLog({ type: 'success', provider: usedProvider, label, durationMs, promptChars: (systemPrompt + userContent).length, responseChars: rawText.length, tokensUsed: result.tokensUsed, tokensExact: !!result.tokensExact });
      if (label) recordStageDuration(label, durationMs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
        parsed.__meta = { tokensUsed: result.tokensUsed || 0, tokensExact: !!result.tokensExact, durationMs, provider: usedProvider, label };
      }
      return parsed;
    } catch (parseErr){
      // 解析失敗時，若這次呼叫本來就已經被供應商標記為「輸出被截斷」，
      // 給出更明確的原因（而不是單純的「無法解析」），方便判斷是否該調高 maxTokens。
      if (result.truncated){
        const actualLimit = clampMaxTokens(usedProvider, maxTokens);
        throw new Error('truncated:AI 回應在完成前被截斷（超過本次呼叫的長度上限，約 ' + actualLimit + ' tokens' + (actualLimit < (maxTokens || 1200) ? '，已被供應商上限夾住，實際小於程式設定的 ' + (maxTokens || 1200) : '') + '），導致 JSON 不完整。建議稍後再試一次，或改用回應較精簡的供應商。');
      }
      throw parseErr;
    }
  } catch (err){
    window.__RM_CURRENT_RESERVATION_TOKENS = 1;
    addDebugLog({ type: 'error', provider: usedProvider, label, message: String(err && err.message || err), name: err && err.name, durationMs: Date.now() - startedAt });
    throw err;
  }
}

window.addEventListener('DOMContentLoaded', function(){ refreshApiUi(); });

/* =========================================================
   v2.8.99 修正：四層 JSON 解析（原本只有三層、且沒有處理「尾隨逗號」）。
   實測 Agnes AI（以及其他較平價的 OpenAI 相容供應商）常見兩種格式錯誤，
   原本的解析器完全沒有處理第①種，導致這類供應商的回應大量解析失敗：
   ① 物件或陣列結尾多一個逗號，例如 {"a":1,"b":2,} 或 ["x","y",]
      —— 這是 JSON.parse 會直接拋錯、但視覺上很容易被忽略的錯誤。
   ② 字串內容中夾帶未轉義的雙引號或裸露的換行/Tab 字元。
   兩種問題可能同時出現，因此採用「多種修復函式排列組合、依序嘗試」的
   四層策略，而不是只修一種就放棄。
========================================================= */
function stripTrailingCommas(t){
  return t.replace(/,(\s*[}\]])/g, '$1');
}

function unifiedJsonRepair(text){
  let out = '';
  let inString = false;
  let pendingInnerOpen = false;
  let i = 0;
  while (i < text.length){
    const ch = text[i];
    if (ch === '\\' && inString){
      out += ch + (text[i + 1] || '');
      i += 2;
      continue;
    }
    if (ch === '"'){
      if (!inString){
        inString = true; pendingInnerOpen = false;
        out += ch;
      } else {
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        const nextCh = text[j];
        const isStructuralEnd = (nextCh === undefined || nextCh === ',' || nextCh === '}' || nextCh === ']' || nextCh === ':');
        if (isStructuralEnd && !pendingInnerOpen){
          inString = false;
          out += ch;
        } else if (!pendingInnerOpen){
          // 字串中途出現的引號：視為使用者自己在引用文字，轉成中文引號避免破壞 JSON 結構
          pendingInnerOpen = true;
          out += '\u300C'; // 「
        } else {
          pendingInnerOpen = false;
          out += '\u300D'; // 」
        }
      }
    } else if (inString && (ch === '\n' || ch === '\r' || ch === '\t')){
      if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else out += '\\t';
    } else {
      out += ch;
    }
    i++;
  }
  return out;
}

function parseJsonLoose(text){
  const original = text;
  let t = String(text == null ? '' : text).trim();
  t = t.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 找出第一個 { 或 [ 到對應最後一個 } 或 ] 之間的內容，去除模型可能加的
  // 前後說明文字（例如「好的，以下是分析結果：...」），Agnes 這類供應商比
  // Claude 更常在 JSON 前後夾帶這類客套話。
  const firstObj = t.indexOf('{');
  const firstArr = t.indexOf('[');
  let start;
  if (firstObj === -1 && firstArr === -1) start = -1;
  else if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start >= 0){
    const isArr = t[start] === '[';
    const end = isArr ? t.lastIndexOf(']') : t.lastIndexOf('}');
    if (end > start) t = t.slice(start, end + 1);
  }

  const attempts = [
    { label: '第一層：標準解析', fn: s => s },
    { label: '第二層：移除尾隨逗號', fn: s => stripTrailingCommas(s) },
    { label: '第三層：修復未轉義引號／控制字元', fn: s => unifiedJsonRepair(s) },
    { label: '第四層：修復引號控制字元＋移除尾隨逗號', fn: s => stripTrailingCommas(unifiedJsonRepair(s)) }
  ];
  let lastErr = null;
  for (const attempt of attempts){
    try {
      const parsed = JSON.parse(attempt.fn(t));
      if (attempt.label !== '第一層：標準解析'){
        console.info('[parseJsonLoose] 已透過「' + attempt.label + '」修復成功');
      }
      return parsed;
    } catch (e){ lastErr = e; }
  }
  console.warn('[parseJsonLoose] 四層解析全部失敗，原始回應：', original);
  throw new Error('無法解析 AI 回傳的內容，請再試一次' + (lastErr ? '（' + lastErr.message + '）' : ''));
}

const HONESTY_RULE = `【誠實原則，最優先】只能依據履歷中「實際存在」的經驗、技能與成果作答。真正吻合就明確寫出來；只是部分相關或程度不足，要用保守、如實的說法呈現，不可誇大或編造成完全符合；完全找不到證據的項目不要硬寫進去。目標是讓內容經得起面試官檢驗，而不是每一項都硬湊成 100% 符合。`;

const JSON_SAFETY_RULE = `JSON 格式安全規則：字串內容中一律使用「」來標示引用文字，不可使用直式雙引號 " ；字串內容中不可包含真正的換行字元，需要換行請用 \\n 表示。這是為了確保輸出是可以被直接解析的合法 JSON。`;

/* =========================================================
   併發保護：所有會呼叫 AI 的按鈕共用同一把忙碌鎖，避免「一鍵產生
   全部」執行中又手動觸發個別分頁，造成重複呼叫、浪費 API 成本。
   v3.3.49 修復：beginRun() 原本定義好了卻沒有任何地方呼叫，等於這道
   保護完全沒有生效——現在 6 個個別產生函式（runMatch／runHealthCheck／
   runInterviewSetup／runReverseInterview／runTailoredResume／
   runProposalDeck）與 runAll() 都已經在各自開頭呼叫 beginRun()，
   跟原本就有的 endRun() 配成對。用計數器而非布林值設計，是為了支援
   runAll() 內部依序呼叫上述個別函式時的巢狀情境：只有最外層那次
   呼叫的 endRun() 讓計數器歸零，才會真正解鎖按鈕，中間三個階段
   銜接時不會出現短暫解鎖的空檔。
========================================================= */
const AI_BUTTON_IDS = ['generateBtn1', 'generateBtn2', 'generateBtn4', 'runAllBtn', 'generateReverseBtn', 'generateBtn6', 'generateBtn7'];
let activeRunCount = 0;

function beginRun(){
  activeRunCount++;
  if (activeRunCount === 1){
    AI_BUTTON_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
  }
}

function endRun(){
  activeRunCount = Math.max(0, activeRunCount - 1);
  if (activeRunCount === 0){
    updateAllButtonStates();
  }
}

