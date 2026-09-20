/* =======================================================================
   js/api-keys.js — 多供應商 API Key 管理（Claude / Gemini / ChatGPT / Agnes AI 金鑰設定視窗）
   
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
/* =========================================================
   多供應商 API Key 管理（Claude / Gemini / ChatGPT / Agnes AI）
   金鑰只暫存在本次瀏覽器分頁的 sessionStorage，不會上傳到任何伺服器。
   若使用者沒有設定任何金鑰，維持原本行為：呼叫系統內建連線
   （不帶金鑰，僅在支援此免金鑰連線的環境，例如 Claude 網頁/App 的
   Artifact 預覽環境中才會成功；在一般瀏覽器直接開啟此檔案時，
   請務必先在「AI API Key 設定」貼上你自己的金鑰）。
========================================================= */
const RM_KEY_PREFIX = 'resumeMatcher_';
function getProvider(){ try{ return sessionStorage.getItem(RM_KEY_PREFIX+'provider')||''; }catch(e){ return ''; } }
function setProvider(p){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'provider', p); }catch(e){} }
function getKeyFor(provider){ try{ return sessionStorage.getItem(RM_KEY_PREFIX+'key_'+provider)||''; }catch(e){ return ''; } }
function setKeyFor(provider,k){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'key_'+provider, k); }catch(e){} }
function getModelFor(provider){ try{ return sessionStorage.getItem(RM_KEY_PREFIX+'model_'+provider) || PROVIDER_DEFAULT_MODEL[provider] || ''; }catch(e){ return PROVIDER_DEFAULT_MODEL[provider] || ''; } }
function setModelFor(provider,v){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'model_'+provider, v); }catch(e){} }
function getBaseUrlFor(provider){ try{ return sessionStorage.getItem(RM_KEY_PREFIX+'baseurl_'+provider) || PROVIDER_DEFAULT_BASEURL[provider] || ''; }catch(e){ return PROVIDER_DEFAULT_BASEURL[provider] || ''; } }
function setBaseUrlFor(provider,v){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'baseurl_'+provider, v); }catch(e){} }

function isValidGeminiKeyFormat(v){ return /^AIza|^AQ\./.test(v); }
function validateProviderKey(p,v){
  if(!v) return '請先貼上 API Key。';
  if(p==='claude' && !v.startsWith('sk-ant-')) return 'Anthropic API Key 格式看起來不正確。';
  if(p==='gemini' && !isValidGeminiKeyFormat(v)) return 'Google AI Studio API Key 格式看起來不正確。';
  if(p==='chatgpt' && !v.startsWith('sk-')) return 'OpenAI API Key 格式看起來不正確。';
  if(p==='groq' && !v.startsWith('gsk_')) return 'GroqCloud API Key 通常以 gsk_ 開頭，請確認。';
  if(p==='openrouter' && !v.startsWith('sk-or-')) return 'OpenRouter API Key 通常以 sk-or- 開頭，請確認。';
  return '';
}
function removeKeyFor(provider){ try{ sessionStorage.removeItem(RM_KEY_PREFIX+'key_'+provider); }catch(e){} }
function isAiKeyMode(){ const p=getProvider(); return !!(p && getKeyFor(p)); }

const PROVIDER_LABEL = {
  claude:'Claude (Anthropic)', gemini:'Gemini (Google AI Studio)', chatgpt:'ChatGPT (OpenAI)', agnes:'Agnes AI',
  nvidia:'NVIDIA NIM', groq:'GroqCloud', openrouter:'OpenRouter', mistral:'Mistral AI Studio'
};
const PROVIDER_DEFAULT_MODEL = {
  claude:'claude-sonnet-5', gemini:'gemini-2.5-flash', chatgpt:'gpt-4o', agnes:'agnes-2.5-flash',
  nvidia:'nvidia/nemotron-3-super-120b-a12b', groq:'openai/gpt-oss-20b',
  openrouter:'openrouter/free', mistral:'mistral-small-latest'
};
const PROVIDER_DEFAULT_BASEURL = {
  agnes:'https://apihub.agnes-ai.com/v1', nvidia:'https://integrate.api.nvidia.com/v1',
  groq:'https://api.groq.com/openai/v1', openrouter:'https://openrouter.ai/api/v1',
  mistral:'https://api.mistral.ai/v1'
};
let currentProviderTab = 'claude';

function switchProviderTab(p){
  currentProviderTab = p;
  document.querySelectorAll('.provider-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.provider === p));
  ['claude','gemini','chatgpt','agnes','nvidia','groq','openrouter','mistral'].forEach(name => {
    const pane = document.getElementById('provider-pane-' + name);
    if (pane) pane.style.display = (name === p) ? 'block' : 'none';
  });
}

function refreshApiUi(){
  const pill = document.getElementById('apiStatusPill');
  const modalMode = document.getElementById('modal-current-mode');
  const provider = getProvider();
  if (isAiKeyMode()){
    if (pill){ pill.classList.add('on'); pill.textContent = '已啟用：' + PROVIDER_LABEL[provider]; }
    if (modalMode) modalMode.innerHTML = '目前狀態：<b>' + PROVIDER_LABEL[provider] + ' 已啟用</b>（使用你自己貼上的 API Key）';
  } else {
    if (pill){ pill.classList.remove('on'); pill.textContent = '尚未設定 API Key（使用系統內建連線）'; }
    if (modalMode) modalMode.textContent = '目前狀態：系統內建連線（未設定任何 API Key）';
  }
}

function openApiModal(){
  const p = getProvider() || 'claude';
  switchProviderTab(p);
  ['claude','gemini','chatgpt','agnes','nvidia','groq','openrouter','mistral'].forEach(name => {
    const keyEl = document.getElementById('api-key-input-' + name);
    if (keyEl) keyEl.value = getKeyFor(name);
    const modelEl = document.getElementById('api-model-input-' + name);
    if (modelEl) modelEl.value = getModelFor(name);
    const baseEl = document.getElementById('api-baseurl-' + name);
    if (baseEl) baseEl.value = getBaseUrlFor(name);
  });
  refreshApiUi();
  document.getElementById('api-modal').classList.add('open');
}
function closeApiModal(){ document.getElementById('api-modal').classList.remove('open'); }

function saveApiKey(){
  const p = currentProviderTab;
  const v = document.getElementById('api-key-input-' + p).value.trim();
  const formatErr = validateProviderKey(p, v);
  if (formatErr){ alert(formatErr); return; }
  // 其他供應商同樣不限制金鑰格式；原廠格式可能隨時間變更。
  const modelEl = document.getElementById('api-model-input-' + p);
  const model = modelEl ? modelEl.value.trim() : '';
  if (!model){ alert('請輸入模型 ID。模型不再寫死，可依原廠最新模型自行修改。'); return; }
  setKeyFor(p, v);
  setModelFor(p, model);
  const baseEl = document.getElementById('api-baseurl-' + p);
  if (baseEl) setBaseUrlFor(p, baseEl.value.trim());
  setProvider(p);
  refreshApiUi();
  closeApiModal();
}

function clearApiKey(){
  ['claude','gemini','chatgpt','agnes','nvidia','groq','openrouter','mistral'].forEach(removeKeyFor);
  try{
    sessionStorage.removeItem(RM_KEY_PREFIX+'provider');
    ['claude','gemini','chatgpt','agnes','nvidia','groq','openrouter','mistral'].forEach(p => {
      sessionStorage.removeItem(RM_KEY_PREFIX+'model_'+p);
      sessionStorage.removeItem(RM_KEY_PREFIX+'baseurl_'+p);
    });
  }catch(e){}
  ['claude','gemini','chatgpt','agnes','nvidia','groq','openrouter','mistral'].forEach(p => {
    const el = document.getElementById('api-key-input-' + p);
    if (el) el.value = '';
  });
  ['agnes','nvidia','groq','openrouter','mistral'].forEach(p => {
    const el = document.getElementById('api-baseurl-' + p);
    if (el) el.value = '';
  });
  refreshApiUi();
  closeApiModal();
}



/* v3.3.81：沿用 FairView 本機可用的 API Key 操作方式：
   - 儲存後可立即測試目前供應商
   - OpenAI-compatible 供應商可同步 /models
   - Agnes 本機模式走 localhost proxy，避免瀏覽器 CORS；Base URL 由設定頁傳給 proxy
*/
async function testCurrentProvider(){
  const p=currentProviderTab;
  const key=(document.getElementById('api-key-input-'+p)?.value||getKeyFor(p)).trim();
  const model=(document.getElementById('api-model-input-'+p)?.value||getModelFor(p)).trim();
  if(!key || !model){ alert('請先填入 API Key 與 Model ID。'); return; }
  const baseEl=document.getElementById('api-baseurl-'+p);
  if(baseEl) setBaseUrlFor(p, baseEl.value.trim() || PROVIDER_DEFAULT_BASEURL[p] || '');
  try{
    const prompt='請只回覆 OK';
    if(p==='gemini') await fetchGeminiText('',prompt,64,key);
    else if(p==='claude') await fetchClaudeText('',prompt,64,key);
    else if(p==='chatgpt') await fetchChatGPTText('',prompt,64,key);
    else if(p==='agnes') await fetchAgnesText('',prompt,64,key);
    else await fetchOpenAICompatibleProviderText(p,'',prompt,64,key);
    alert('連線成功：'+(PROVIDER_LABEL[p]||p)+' / '+model);
  }catch(e){
    alert('連線測試失敗：\n'+String(e?.message||e));
  }
}

async function fetchProviderModels(provider){
  const key=(document.getElementById('api-key-input-'+provider)?.value||getKeyFor(provider)).trim();
  if(!key){ alert('請先輸入該供應商 API Key。'); return; }
  let base=(document.getElementById('api-baseurl-'+provider)?.value||getBaseUrlFor(provider)||'').trim().replace(/\/$/,'');
  if(provider==='agnes' && !base) base='https://apihub.agnes-ai.com/v1';
  if(!base){ alert('此供應商沒有可用的 Base URL。'); return; }
  try{
    let url=base+'/models', headers={};
    if(provider==='gemini'){
      url=base+'/models?key='+encodeURIComponent(key);
    }else if(provider==='claude'){
      headers={'x-api-key':key,'anthropic-version':'2023-06-01'};
    }else if(provider==='agnes' && (/^(localhost|127\.0\.0\.1)$/i.test(location.hostname))){
      url='/api/agnes/models';
      headers={'X-Agnes-Api-Key':key,'X-Agnes-Base-Url':base};
    }else{
      headers={Authorization:'Bearer '+key};
    }
    const r=await fetch(url,{headers});
    const text=await r.text();
    let d={}; try{ d=JSON.parse(text); }catch(_){ }
    if(!r.ok) throw new Error('HTTP '+r.status+'：'+(d?.error?.message||text.slice(0,240)));
    const models=Array.isArray(d?.data)?d.data.map(x=>x?.id).filter(Boolean):[];
    const field=document.getElementById('api-model-input-'+provider);
    if(!models.length){ alert('原廠沒有回傳可用模型清單，請手動輸入 Model ID。'); return; }
    const current=field?.value.trim();
    if(field) field.value=current&&models.includes(current)?current:models[0];
    alert('已同步 '+models.length+' 個模型。\n目前：'+(field?.value||models[0]));
  }catch(e){ alert('模型同步失敗：\n'+String(e?.message||e)); }
}
