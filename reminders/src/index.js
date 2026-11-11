// Healthspan Tracker reminders: stores opted-in devices and a list of {name, due date}, and once a day sends a
// push notification to anyone with something due today, due in a week, or overdue (overdue: Mondays only).
// Pushes carry no content; the app's service worker shows the reminder text it already has on the device.
// No test results or other health values are ever sent here.

const SCHEMA = `CREATE TABLE IF NOT EXISTS subs (
  endpoint TEXT PRIMARY KEY, uid TEXT NOT NULL, due TEXT NOT NULL DEFAULT '[]', tz TEXT, updated INTEGER, last_sent TEXT)`;
const MAX_ITEMS = 150;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = env.ALLOWED_ORIGINS.split(',').includes(origin);
    const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return json({ ok: true, service: 'healthspan-reminders' }, 200, cors);
    if (request.method !== 'POST' || !allowed) return json({ error: 'not allowed' }, 403, cors);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
    const uid = await verifyFirebaseToken(body.idToken, env.FIREBASE_PROJECT_ID).catch(() => null);
    if (!uid) return json({ error: 'unauthorized' }, 401, cors);
    await env.DB.prepare(SCHEMA).run();
    const due = cleanDue(body.due);
    if (url.pathname === '/subscribe') {
      const endpoint = body.subscription && body.subscription.endpoint;
      if (!validEndpoint(endpoint)) return json({ error: 'bad subscription' }, 400, cors);
      await env.DB.prepare(`INSERT INTO subs (endpoint, uid, due, tz, updated) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(endpoint) DO UPDATE SET uid = ?2, due = ?3, tz = ?4, updated = ?5`)
        .bind(endpoint, uid, JSON.stringify(due), String(body.tz || '').slice(0, 64), Date.now()).run();
      return json({ ok: true }, 200, cors);
    }
    if (url.pathname === '/due') {
      await env.DB.prepare('UPDATE subs SET due = ?1, updated = ?2 WHERE uid = ?3').bind(JSON.stringify(due), Date.now(), uid).run();
      return json({ ok: true }, 200, cors);
    }
    if (url.pathname === '/unsubscribe') {
      if (body.endpoint) await env.DB.prepare('DELETE FROM subs WHERE uid = ?1 AND endpoint = ?2').bind(uid, body.endpoint).run();
      else await env.DB.prepare('DELETE FROM subs WHERE uid = ?1').bind(uid).run();
      return json({ ok: true }, 200, cors);
    }
    if (url.pathname === '/test') {          // send one notification now to this person's devices
      const rows = (await env.DB.prepare('SELECT endpoint FROM subs WHERE uid = ?1').bind(uid).all()).results;
      let sent = 0; for (const r of rows) if (await sendPush(r.endpoint, env)) sent++;
      return json({ ok: true, sent }, 200, cors);
    }
    return json({ error: 'not found' }, 404, cors);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(sendDailyReminders(env));
  },
};

const SEND_HOUR = 8;
/** Local date (YYYY-MM-DD), hour and weekday for a time zone; falls back to UTC for unknown zones. */
function localNow(tz, now = new Date()) {
  let zone = 'UTC'; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); zone = tz || 'UTC'; } catch { }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), monday: parts.weekday === 'Mon' };
}
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** Which reminders (if any) to send for this person right now. */
export function shouldNotify(row, now = new Date()) {
  const local = localNow(row.tz, now);
  if (local.hour !== SEND_HOUR || row.last_sent === local.date) return null;
  let due = []; try { due = JSON.parse(row.due); } catch { }
  const inWeek = addDays(local.date, 7);
  const hit = due.some(x => x.d === local.date || x.d === inWeek || (local.monday && x.d < local.date));
  return hit ? local.date : null;
}
async function sendDailyReminders(env) {
  await env.DB.prepare(SCHEMA).run();
  const rows = (await env.DB.prepare('SELECT endpoint, due, tz, last_sent FROM subs').all()).results;
  for (const r of rows) {
    const day = shouldNotify(r); if (!day) continue;
    const ok = await sendPush(r.endpoint, env);
    if (ok === 'gone') await env.DB.prepare('DELETE FROM subs WHERE endpoint = ?1').bind(r.endpoint).run();
    else if (ok) await env.DB.prepare('UPDATE subs SET last_sent = ?1 WHERE endpoint = ?2').bind(day, r.endpoint).run();
  }
}

/* ---------- Web Push (VAPID, no payload) ---------- */
async function sendPush(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(aud, env.VAPID_PRIVATE_JWK);
  const res = await fetch(endpoint, { method: 'POST', headers: {
    TTL: '86400', Urgency: 'normal', 'Content-Length': '0', Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}` } });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok;
}
async function vapidJwt(aud, privateJwk) {
  const key = await crypto.subtle.importKey('jwk', JSON.parse(privateJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://healthspantracker.web.app' })}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

/* ---------- Firebase ID token check (Google's public keys; no service account needed) ---------- */
let jwksCache = null;
async function verifyFirebaseToken(token, projectId) {
  const [h, p, s] = String(token || '').split('.');
  if (!s) throw new Error('bad token');
  const header = JSON.parse(atob(b64std(h))), claims = JSON.parse(atob(b64std(p))), now = Date.now() / 1000;
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` || !claims.sub || claims.exp < now || claims.iat > now + 300)
    throw new Error('bad claims');
  if (!jwksCache || jwksCache.exp < Date.now()) {
    const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    jwksCache = { keys: (await res.json()).keys, exp: Date.now() + 3600e3 };
  }
  const jwk = jwksCache.keys.find(k => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64bytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error('bad signature');
  return claims.sub;
}

/* ---------- helpers ---------- */
function cleanDue(due) {
  return (Array.isArray(due) ? due : []).slice(0, MAX_ITEMS)
    .filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.d))
    .map(x => ({ n: String(x.n || '').slice(0, 80), d: x.d }));
}
function validEndpoint(e) {
  try { const u = new URL(e); return u.protocol === 'https:' && e.length < 1000; } catch { return false; }
}
const json = (o, status, headers) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64std = s => s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
const b64bytes = s => Uint8Array.from(atob(b64std(s)), c => c.charCodeAt(0));
