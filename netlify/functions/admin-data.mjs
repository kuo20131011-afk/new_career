// netlify/functions/admin-data.mjs
// 職透 (JobSight) 後台管理功能 — 僅限管理者查看的登入紀錄與履歷清單
// 只有 email 完全等於 ADMIN_EMAIL 的使用者才能取得資料，其餘一律回傳 403。
//
// v3.3.42 修復：改用 @netlify/identity 的 getUser() 取得登入身份，不再依賴
// context.clientContext.user（原因見下方 resolveIdentityUser 的說明）。
import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

const ADMIN_EMAIL = 'felix670131@gmail.com';
const LOG_KEY = 'login-log.json';
const INDEX_KEY = 'resume-index.json';

// v3.3.42 新增：統一的身份判斷邏輯，四支 function 共用同一套邏輯（各自複製一份，
// 避免額外建立共用模組被 Netlify 誤判為新的 function 端點）。
//
// 根本原因：這幾支 function 都是用新版（Modern / V2）的 `export default async (req, context)`
// 簽章撰寫，但原本的身份判斷卻用了舊版（Lambda-compatible / V1，`exports.handler =
// async (event, context)`）才適用的 context.clientContext.user。Netlify 官方文件明確指出，
// V2 簽章下 context.clientContext 不會自動帶入 Identity 使用者資料——所以無論 Google 登入本身
// 有沒有成功、Token 有沒有過期，後台管理一律回傳「未登入」，這是每次都會發生的必然結果，
// 不是 session 過期或偶發的 race condition。
// 解法：改用 Netlify 官方推薦、專門給 V2 functions 使用的 @netlify/identity 套件的 getUser()，
// 它會自動讀取前端送來的 Authorization: Bearer <token>（或 nf_jwt cookie）並回傳正規化後的
// 使用者物件。同時保留 context.clientContext.user 作為備援，避免未來 Netlify 行為調整時
// 整支功能又無預警失效。
async function resolveIdentityUser(context) {
  try {
    const user = await getUser();
    if (user && user.email) return user;
  } catch (e) {
    console.error('getUser() 失敗，改用備援方式判斷身份', e);
  }
  const legacyUser = context.clientContext && context.clientContext.user;
  if (legacyUser && legacyUser.email) return legacyUser;
  return null;
}

export default async (req, context) => {
  const user = await resolveIdentityUser(context);
  if (!user || !user.email) {
    return new Response(JSON.stringify({ error: '未登入' }), { status: 401 });
  }
  if (user.email.toLowerCase() !== ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: '無權限存取後台管理資料' }), { status: 403 });
  }

  try {
    const adminStore = getStore({ name: 'zhitou-admin', consistency: 'strong' });
    let logins = [];
    let resumes = [];
    try {
      const l = await adminStore.get(LOG_KEY, { type: 'json' });
      if (Array.isArray(l)) logins = l;
    } catch (e) {}
    try {
      const r = await adminStore.get(INDEX_KEY, { type: 'json' });
      if (Array.isArray(r)) resumes = r;
    } catch (e) {}

    // v3.3.67：後台不再「只相信索引檔」。如果 PDF 已成功寫進 Netlify Blobs，
    // 但索引在同一時間發生寫入衝突／暫時失敗，管理者仍然必須看得到這份檔案。
    // 直接掃描履歷 Blob 的 key，再從 metadata 重建缺失的索引項目。
    try {
      const filesStore = getStore({ name: 'zhitou-resumes', consistency: 'strong' });
      const listed = await filesStore.list({ prefix: 'resume-' });
      const knownKeys = new Set(resumes.map(r => r.key));
      for (const item of (listed.blobs || [])) {
        if (knownKeys.has(item.key)) continue;
        try {
          const meta = await filesStore.getMetadata(item.key, { consistency: 'strong' });
          if (!meta) continue;
          const m = meta.metadata || {};
          resumes.push({
            key: item.key,
            filename: m.filename || 'resume.pdf',
            email: m.email || '(未登入或身分不明)',
            name: m.name || '',
            verified: m.verified !== false,
            ip: m.ip || '',
            browser: m.browser || '',
            referer: m.referer || '',
            time: m.time || null,
            size: meta.size || 0,
            recoveredFromBlob: true,
          });
        } catch (e) {
          console.warn('重建履歷索引項目失敗', item.key, e);
        }
      }
      resumes.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
    } catch (e) {
      console.warn('掃描履歷 Blob 失敗，仍回傳現有索引', e);
    }

    return new Response(JSON.stringify({ logins, resumes }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('admin-data error', err);
    return new Response(JSON.stringify({ error: '讀取後台資料失敗' }), { status: 500 });
  }
};
