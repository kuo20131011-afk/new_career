// netlify/functions/ai-proxy.mjs
// 通用 AI 供應商 Proxy（v3.3.78 新增）
//
// 為什麼需要這支 function：
// js/ai-providers.js 裡，Agnes AI／NVIDIA／GroqCloud／OpenRouter／Mistral 這類
// 「使用者自行指定 Base URL」的供應商，原本是瀏覽器直接對該第三方網域發送
// fetch() 請求。這種「瀏覽器 -> 第三方 API」屬於跨來源請求，第三方伺服器必須
// 主動回應 Access-Control-Allow-Origin 才會成功；只要對方沒有為瀏覽器開放
// CORS（或使用者當下的網路對該網域 DNS／連線不穩），瀏覽器會在還沒收到任何
// HTTP 回應內容之前就直接讓 fetch() 拋出例外，前端只能看到語意含糊的
// 「cors_or_network」，完全無法分辨「對方沒開 CORS」「DNS 解析失敗」「純粹
// 網路不通」這三種完全不同的情況，也無法看到對方伺服器實際回傳了什麼。
//
// 這支 function 讓瀏覽器改成呼叫「同網域」的 /.netlify/functions/ai-proxy，
// 再由 Netlify 的伺服器端環境代為對第三方 API 發出請求。伺服器對伺服器的
// HTTP 請求完全不受瀏覽器 CORS 政策限制，也不會受使用者端 DNS／地區網路
// 狀況影響。回應（包含狀態碼與原始內容）會原封不動轉送回瀏覽器，前端既有的
// 401／403／429／503 等狀態碼判斷邏輯完全不需要更動。
//
// 安全性設計：
// - 只接受 POST，且只轉發到 /chat/completions（OpenAI 相容格式），不做成
//   任意路徑的開放代理。
// - 只允許 https 目標，並擋掉 localhost／私有網段／保留位址，避免被用來對
//   內部網路發送請求（SSRF）。
// - 這支 function 不會記錄、儲存使用者的 API Key 或請求內容；純粹單次轉發。

const ALLOWED_PATHS = new Set(['/chat/completions']);

function isDisallowedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h === '0.0.0.0') return true;
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8（loopback）
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16（link-local）
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    return false;
  }
  if (h === '::1') return true; // IPv6 loopback
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true; // IPv6 私有／link-local
  return false;
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { baseUrl, path, apiKey, payload } = body || {};

  if (!baseUrl || typeof baseUrl !== 'string') {
    return new Response(JSON.stringify({ error: 'missing_base_url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (!path || !ALLOWED_PATHS.has(path)) {
    return new Response(JSON.stringify({ error: 'invalid_path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let target;
  try {
    target = new URL(baseUrl.replace(/\/+$/, '') + path);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'invalid_base_url' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (target.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'only_https_allowed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (isDisallowedHost(target.hostname)) {
    return new Response(JSON.stringify({ error: 'target_not_allowed' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const upstreamHeaders = { 'Content-Type': 'application/json' };
  if (apiKey) upstreamHeaders['Authorization'] = 'Bearer ' + apiKey;

  let upstreamResp;
  try {
    upstreamResp = await fetch(target.toString(), {
      method: 'POST',
      headers: upstreamHeaders,
      body: JSON.stringify(payload || {})
    });
  } catch (err) {
    // 這裡才是「伺服器端也真的打不通」（DNS 解析失敗、目標主機拒絕連線、逾時等）；
    // 若走到這裡，代表問題不是瀏覽器端 CORS，而是目標服務本身／Base URL 有問題。
    console.error('ai-proxy upstream fetch failed:', target.toString(), err);
    return new Response(
      JSON.stringify({ error: 'upstream_unreachable', detail: String((err && err.message) || err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const text = await upstreamResp.text();
  return new Response(text, {
    status: upstreamResp.status,
    headers: { 'Content-Type': upstreamResp.headers.get('content-type') || 'application/json' }
  });
};
