// 職透 (JobSight) — Agnes AI server-side proxy
// v3.3.79
//
// Browser 直接呼叫 Agnes API 會受到瀏覽器 CORS / DNS / 網路環境限制。
// 這支 Netlify Function 讓前端改成「同源」呼叫，再由 Netlify server-side
// 代為呼叫 Agnes。API Key 只由請求標頭短暫傳遞，不寫入 Netlify Blobs、log 或環境變數。
//
// Request:
//   POST /.netlify/functions/agnes-chat
//   x-agnes-api-key: <user's Agnes API key>
//   Content-Type: application/json
//   body: { model, max_tokens, messages, ...optional OpenAI-compatible fields }
//
// Upstream:
//   https://apihub.agnes-ai.com/v1/chat/completions

const AGNES_DEFAULT_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const AGNES_FALLBACK_BASE_URL = 'https://apihub.agnes-ai.cn/v1';
const ALLOWED_AGNES_HOSTS = new Set(['apihub.agnes-ai.com','apihub.agnes-ai.cn','api.agnes-ai.cn']);
function safeBaseUrl(value){
  const candidate = String(value || AGNES_DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  try { const u = new URL(candidate); if(u.protocol !== 'https:' || !ALLOWED_AGNES_HOSTS.has(u.hostname)) return AGNES_DEFAULT_BASE_URL; return candidate; } catch { return AGNES_DEFAULT_BASE_URL; }
}
const UPSTREAM_TIMEOUT_MS = 60000;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders }
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Agnes-Api-Key',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  if (req.method !== 'POST') {
    return json({ error: { message: 'Method not allowed' } }, 405);
  }

  const key = (req.headers.get('x-agnes-api-key') || '').trim();
  const baseUrl = safeBaseUrl(req.headers.get('x-agnes-base-url'));
  const targets = [baseUrl];
  if (baseUrl === AGNES_DEFAULT_BASE_URL) targets.push(AGNES_FALLBACK_BASE_URL);
  if (!key) {
    return json({ error: { message: '缺少 Agnes API Key' } }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: { message: 'Agnes proxy 收到無效 JSON' } }, 400);
  }

  if (!body || !body.model || !Array.isArray(body.messages)) {
    return json({ error: { message: '缺少 model 或 messages' } }, 400);
  }

  try {
    let lastErr;
    for (let i=0; i<targets.length; i++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
      try {
        const upstream = await fetch(`${targets[i]}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const text = await upstream.text();
        const contentType = upstream.headers.get('content-type') || 'application/json';
        // 只有真正的網路例外才嘗試備援路由；HTTP 400/401/403/429 等仍原樣回傳。
        return new Response(text, { status: upstream.status, headers: {'Content-Type': contentType, 'Cache-Control':'no-store'} });
      } catch (err) {
        lastErr = err;
        if (i === targets.length-1) throw err;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastErr || new Error('unknown upstream error');
  } catch (err) {
    const message = err?.name === 'AbortError'
      ? 'Agnes API 連線逾時（60 秒）。請稍後再試。'
      : `Agnes API server-side proxy 連線失敗：${String(err?.message || err)}`;
    return json({ error: { message, type: 'upstream_network_error' } }, 502);
  } finally {
    clearTimeout(timeout);
  }
};
