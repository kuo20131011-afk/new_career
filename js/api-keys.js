/* =========================================================================
   js/api-keys.js — 多供應商 AI API Key / Base URL / Model 設定
   V3.3.87：模型不再寫死；每家供應商的 Key、Base URL、Model 都可獨立設定。
   金鑰與設定僅暫存在 sessionStorage，不上傳到伺服器。
========================================================================= */
const RM_KEY_PREFIX = 'resumeMatcher_';

const AI_PROVIDER_CONFIG = {
  claude:   { label:'Claude (Anthropic)', kind:'anthropic', defaultBaseUrl:'https://api.anthropic.com/v1', defaultModel:'claude-sonnet-5', keyHint:'sk-ant-...', keyUrl:'https://console.anthropic.com/' },
  gemini:   { label:'Gemini (Google AI Studio)', kind:'gemini', defaultBaseUrl:'https://generativelanguage.googleapis.com/v1beta', defaultModel:'gemini-3.8-flash', keyHint:'AIza... 或 AQ....', keyUrl:'https://aistudio.google.com/apikey' },
  chatgpt:  { label:'ChatGPT (OpenAI)', kind:'openai', defaultBaseUrl:'https://api.openai.com/v1', defaultModel:'gpt-5.6-luna', keyHint:'sk-...', keyUrl:'https://platform.openai.com/api-keys' },
  agnes:    { label:'Agnes AI', kind:'openai', defaultBaseUrl:'https://apihub.agnes-ai.com/v1', defaultModel:'agnes-2.5-flash', keyHint:'貼上 Agnes API Key', keyUrl:'' },
  nvidia:   { label:'NVIDIA NIM', kind:'openai', defaultBaseUrl:'https://integrate.api.nvidia.com/v1', defaultModel:'openai/gpt-oss-20b', keyHint:'貼上 NVIDIA API Key', keyUrl:'https://build.nvidia.com/' },
  groq:     { label:'GroqCloud', kind:'openai', defaultBaseUrl:'https://api.groq.com/openai/v1', defaultModel:'openai/gpt-oss-20b', keyHint:'gsk_...', keyUrl:'https://console.groq.com/keys' },
  openrouter:{ label:'OpenRouter', kind:'openai', defaultBaseUrl:'https://openrouter.ai/api/v1', defaultModel:'openrouter/free', keyHint:'sk-or-v1-...', keyUrl:'https://openrouter.ai/keys' },
  mistral:  { label:'Mistral AI Studio', kind:'openai', defaultBaseUrl:'https://api.mistral.ai/v1', defaultModel:'mistral-small-latest', keyHint:'貼上 Mistral API Key', keyUrl:'https://console.mistral.ai/api-keys/' }
};
const AI_PROVIDER_ORDER = Object.keys(AI_PROVIDER_CONFIG);

function getProvider(){ try{ return sessionStorage.getItem(RM_KEY_PREFIX+'provider')||''; }catch(e){ return ''; } }
function setProvider(p){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'provider', p); }catch(e){} }
function getKeyFor(provider){ try{ return sessionStorage.getItem(RM_KEY_PREFIX+'key_'+provider)||''; }catch(e){ return ''; } }
function setKeyFor(provider,k){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'key_'+provider, k); }catch(e){} }
function removeKeyFor(provider){ try{ sessionStorage.removeItem(RM_KEY_PREFIX+'key_'+provider); }catch(e){} }
function getBaseUrlFor(provider){
  const cfg=AI_PROVIDER_CONFIG[provider];
  try{ return (sessionStorage.getItem(RM_KEY_PREFIX+'baseurl_'+provider)||cfg.defaultBaseUrl).trim().replace(/\/+$/,''); }catch(e){ return cfg ? cfg.defaultBaseUrl : ''; }
}
function setBaseUrlFor(provider,v){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'baseurl_'+provider, v.trim().replace(/\/+$/,'')); }catch(e){} }
function getModelFor(provider){
  const cfg=AI_PROVIDER_CONFIG[provider];
  try{ return (sessionStorage.getItem(RM_KEY_PREFIX+'model_'+provider)||cfg.defaultModel).trim(); }catch(e){ return cfg ? cfg.defaultModel : ''; }
}
function setModelFor(provider,v){ try{ sessionStorage.setItem(RM_KEY_PREFIX+'model_'+provider, v.trim()); }catch(e){} }
function isAiKeyMode(){ const p=getProvider(); return !!(p && getKeyFor(p)); }

const PROVIDER_LABEL = Object.fromEntries(AI_PROVIDER_ORDER.map(p=>[p,AI_PROVIDER_CONFIG[p].label]));
let currentProviderTab = 'claude';

function switchProviderTab(p){
  if (!AI_PROVIDER_CONFIG[p]) p='claude';
  currentProviderTab = p;
  document.querySelectorAll('.provider-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.provider === p));
  AI_PROVIDER_ORDER.forEach(name => {
    const pane=document.getElementById('provider-pane-'+name);
    if (pane) pane.style.display=(name===p)?'block':'none';
  });
  refreshProviderFields(p);
}
function refreshProviderFields(p){
  const cfg=AI_PROVIDER_CONFIG[p];
  const key=document.getElementById('api-key-input-'+p);
  const base=document.getElementById('api-baseurl-'+p);
  const model=document.getElementById('api-model-input-'+p);
  if(key) key.value=getKeyFor(p);
  if(base) base.value=getBaseUrlFor(p);
  if(model) model.value=getModelFor(p);
}
function refreshApiUi(){
  const pill=document.getElementById('apiStatusPill');
  const modalMode=document.getElementById('modal-current-mode');
  const provider=getProvider();
  if (isAiKeyMode()){
    if(pill){ pill.classList.add('on'); pill.textContent='已啟用：'+(PROVIDER_LABEL[provider]||provider); }
    if(modalMode) modalMode.innerHTML='目前狀態：<b>'+(PROVIDER_LABEL[provider]||provider)+' 已啟用</b>（使用你自己貼上的 API Key）';
  } else {
    if(pill){ pill.classList.remove('on'); pill.textContent='尚未設定 API Key（使用系統內建連線）'; }
    if(modalMode) modalMode.textContent='目前狀態：系統內建連線（未設定任何 API Key）';
  }
}
function openApiModal(){
  const p=getProvider()||'claude';
  AI_PROVIDER_ORDER.forEach(refreshProviderFields);
  switchProviderTab(p);
  refreshApiUi();
  document.getElementById('api-modal').classList.add('open');
}
function closeApiModal(){ document.getElementById('api-modal').classList.remove('open'); }

function isValidGeminiKeyFormat(v){ return v.startsWith('AIza') || v.startsWith('AQ.'); }
function validateKeyFormat(p,v){
  if(!v) return false;
  if(p==='claude' && !v.startsWith('sk-ant-')) return false;
  if(p==='gemini' && !isValidGeminiKeyFormat(v)) return false;
  if(p==='groq' && !v.startsWith('gsk_')) return false;
  if(p==='openrouter' && !v.startsWith('sk-or-')) return false;
  return true;
}
function getModelEndpoint(p){
  const base=getBaseUrlFor(p);
  if(p==='gemini') return base+'/models';
  return base+'/models';
}
async function loadProviderModels(p){
  const key=getKeyFor(p);
  if(!key){ alert('請先貼上 API Key，再載入模型清單。'); return; }
  const status=document.getElementById('api-model-status-'+p);
  if(status) status.textContent='正在讀取原廠模型清單…';
  try{
    const headers={'Content-Type':'application/json'};
    if(p==='gemini') headers['x-goog-api-key']=key; else headers['Authorization']='Bearer '+key;
    const resp=await fetch(getModelEndpoint(p),{method:'GET',headers});
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    const data=await resp.json();
    let ids=[];
    if(p==='gemini') ids=(data.models||[]).map(x=>String(x.name||'').replace(/^models\//,'')).filter(Boolean);
    else ids=(data.data||[]).map(x=>x.id).filter(Boolean);
    ids=[...new Set(ids)];
    if(!ids.length) throw new Error('原廠沒有回傳可用模型');
    const select=document.getElementById('api-model-select-'+p);
    if(select){
      select.innerHTML='<option value="">— 從原廠清單選擇（可自行輸入）—</option>'+ids.map(id=>'<option value="'+escapeHtmlAttr(id)+'">'+escapeHtml(id)+'</option>').join('');
      select.style.display='block';
      select.value=getModelFor(p);
      select.onchange=()=>{ if(select.value){ const input=document.getElementById('api-model-input-'+p); if(input) input.value=select.value; } };
    }
    if(status) status.textContent='已讀取 '+ids.length+' 個模型；你仍可直接輸入新模型 ID。';
  }catch(err){
    if(status) status.textContent='無法自動讀取模型清單（可能是 CORS/權限），仍可直接輸入模型 ID。';
  }
}
function escapeHtml(v){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeHtmlAttr(v){ return escapeHtml(v); }

function saveApiKey(){
  const p=currentProviderTab;
  const keyEl=document.getElementById('api-key-input-'+p);
  const baseEl=document.getElementById('api-baseurl-'+p);
  const modelEl=document.getElementById('api-model-input-'+p);
  const v=keyEl ? keyEl.value.trim() : '';
  const model=modelEl ? modelEl.value.trim() : '';
  if(!v){ alert('請先貼上 API Key。'); return; }
  if(!validateKeyFormat(p,v)){
    const cfg=AI_PROVIDER_CONFIG[p];
    alert('這不像是有效的 '+cfg.label+' API Key 格式；若原廠已改版，請仍以原廠最新格式為準。');
    return;
  }
  if(!model){ alert('請輸入 Model ID。模型不再寫死，可直接填入原廠最新模型。'); return; }
  setKeyFor(p,v);
  setBaseUrlFor(p,baseEl ? baseEl.value.trim() : '');
  setModelFor(p,model);
  setProvider(p);
  refreshApiUi();
  closeApiModal();
}
function clearApiKey(){
  AI_PROVIDER_ORDER.forEach(removeKeyFor);
  try{
    sessionStorage.removeItem(RM_KEY_PREFIX+'provider');
    AI_PROVIDER_ORDER.forEach(p=>{
      sessionStorage.removeItem(RM_KEY_PREFIX+'baseurl_'+p);
      sessionStorage.removeItem(RM_KEY_PREFIX+'model_'+p);
    });
  }catch(e){}
  AI_PROVIDER_ORDER.forEach(p=>{
    ['api-key-input-','api-baseurl-','api-model-input-'].forEach(prefix=>{
      const el=document.getElementById(prefix+p); if(el) el.value='';
    });
  });
  refreshApiUi(); closeApiModal();
}
window.addEventListener('DOMContentLoaded',function(){ refreshApiUi(); });

/* V3.3.101 QA HARDENED — inline Step 4 AI provider selection */
let inlineSelectedProvider = '';
function selectInlineProvider(p){
  if(!AI_PROVIDER_CONFIG[p]) return;
  inlineSelectedProvider = p;
  document.querySelectorAll('.v400-provider-option').forEach(btn=>{
    const active = btn.dataset.provider === p;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  const cfg = AI_PROVIDER_CONFIG[p];
  const box = document.getElementById('inlineAiConfig');
  const title = document.getElementById('inlineAiTitle');
  const status = document.getElementById('inlineAiStatus');
  const key = document.getElementById('inlineApiKey');
  const model = document.getElementById('inlineApiModel');
  if(title) title.textContent = cfg.label + ' 已選擇';
  if(key) key.value = getKeyFor(p);
  if(model) model.value = getModelFor(p);
  if(status) status.textContent = getKeyFor(p) ? '✓ API Key 已設定' : '請輸入 API Key 後儲存啟用';
  if(box) box.hidden = false;
  setTimeout(()=>{ if(key) key.focus(); }, 0);
}
function refreshInlineAiUi(){
  const p = getProvider();
  if(p && AI_PROVIDER_CONFIG[p]){
    selectInlineProvider(p);
    const status=document.getElementById('inlineAiStatus');
    if(status) status.textContent = getKeyFor(p) ? '✓ API Key 已設定並啟用' : '目前使用系統內建連線';
  }
}
function saveInlineAiConfig(){
  const p = inlineSelectedProvider;
  if(!p || !AI_PROVIDER_CONFIG[p]){ alert('請先選擇 AI 模型。'); return; }
  const keyEl=document.getElementById('inlineApiKey');
  const modelEl=document.getElementById('inlineApiModel');
  const v=keyEl ? keyEl.value.trim() : '';
  const model=modelEl ? modelEl.value.trim() : '';
  if(!v){ alert('請先貼上 API Key。若不使用自備 Key，可改用系統內建連線。'); return; }
  if(!validateKeyFormat(p,v)){
    alert('這不像是有效的 '+AI_PROVIDER_CONFIG[p].label+' API Key 格式；若原廠已改版，請仍以原廠最新格式為準。');
    return;
  }
  if(!model){ alert('請輸入 Model ID。'); return; }
  setKeyFor(p,v);
  setModelFor(p,model);
  setBaseUrlFor(p,getBaseUrlFor(p));
  setProvider(p);
  refreshApiUi();
  refreshInlineAiUi();
  if(typeof updateAllButtonStates === 'function') updateAllButtonStates();
}
window.addEventListener('DOMContentLoaded', function(){ setTimeout(refreshInlineAiUi, 0); });
