/* Weekly habits linked to focus goals, filled in from Strava (workouts, including Garmin activities synced to
   Strava), a food-log CSV (MyFitnessPal, Cronometer…) or a quick weekly check-in.
   Only weekly totals are kept — never individual workouts or meals — and like everything else they're end-to-end
   encrypted. Strava data is fetched by this browser directly from Strava; the reminders service only helps sign in
   (it holds the app's Strava secret) and never sees activities. Loaded after encourage.js, before app.js. */
'use strict';
const HABITS = {
  cardio: { icon: '🏃', name: 'Cardio', unit: 'min', target: 150, src: 'strava', max: 1500,
    tests: ['vo2-max', 'resting-hr', 'home-rhr', 'bio-age', 'hdl', 'triglycerides', 'fasting-insulin', 'glucose', 'hemoglobin-a1c', 'home-bp-sys', 'home-bp-dia', 'dexa-visceral-fat', 'dexa-body-fat-pct'],
    why: '150 minutes a week raises VO₂ max and HDL, and lowers blood pressure, blood sugar and visceral fat.' },
  strength: { icon: '🏋️', name: 'Strength sessions', unit: 'sessions', target: 2, src: 'strava', max: 7,
    tests: ['dexa-almi', 'dexa-ffmi', 'dexa-lean-mass', 'dexa-t-score', 'dexa-body-fat-pct', 'dexa-visceral-fat', 'fasting-insulin', 'hemoglobin-a1c'],
    why: 'Two sessions a week builds muscle and bone and helps blood sugar.' },
  fiber: { icon: '🥦', name: 'Days with 25 g+ fiber', unit: 'days', target: 5, src: 'food', max: 7,
    tests: ['ldl-nih', 'apob', 'non-hdl', 'total-chol', 'glucose', 'hemoglobin-a1c', 'fasting-insulin', 'hs-crp'],
    why: 'Fiber — especially oats, beans and psyllium — lowers LDL and steadies blood sugar.' },
  satfat: { icon: '🥑', name: 'Days under 13 g saturated fat', unit: 'days', target: 5, src: 'food', max: 7,
    tests: ['ldl-nih', 'apob', 'non-hdl', 'total-chol'],
    why: 'Keeping saturated fat low (about 6% of calories) is one of the biggest levers on LDL.' },
  sodium: { icon: '🧂', name: 'Days under 2,300 mg sodium', unit: 'days', target: 5, src: 'food', max: 7,
    tests: ['home-bp-sys', 'home-bp-dia'],
    why: 'Less salt lowers blood pressure within a few weeks.' },
  vitd: { icon: '☀️', name: 'Days you took vitamin D', unit: 'days', target: 6, src: 'manual', max: 7,
    tests: ['vitamin-d-total'], why: 'Taking it consistently is what raises your level.' },
};
const FOOD_LIMITS = { fiber: v => v >= 25, satfat: v => v < 13, sodium: v => v < 2300 };

/** Monday of the week containing a YYYY-MM-DD date. */
function weekOf(date) { const d = new Date(date + 'T12:00:00Z'), back = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); }
const shiftWeek = (wk, n) => { const d = new Date(wk + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 7 * n); return d.toISOString().slice(0, 10); };

/* ---------- pure helpers (unit-tested) ---------- */
const CARDIO_TYPES = /^(Run|TrailRun|VirtualRun|Ride|VirtualRide|MountainBikeRide|GravelRide|EBikeRide|EMountainBikeRide|Handcycle|Velomobile|Swim|Rowing|VirtualRow|Elliptical|StairStepper|Hike|Walk|NordicSki|BackcountrySki|RollerSki|Snowshoe|Kayaking|Canoeing|StandUpPaddling|InlineSkate|IceSkate|Skateboard|Wheelchair|HighIntensityIntervalTraining|Workout|Soccer|Tennis|Pickleball|Badminton|Squash|Racquetball|TableTennis|Basketball|Volleyball|Dance|Surfing)$/;
const STRENGTH_TYPES = /^(WeightTraining|Crossfit)$/;
/** Strava activities → { weekStart: { cardio: minutes, strength: sessions } } */
function weeklyFromActivities(acts) {
  const out = {};
  for (const a of acts || []) {
    const date = String(a.start_date_local || a.start_date || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const type = a.sport_type || a.type || '', w = out[weekOf(date)] ||= { cardio: 0, strength: 0 };
    if (STRENGTH_TYPES.test(type)) w.strength += 1;
    else if (CARDIO_TYPES.test(type)) w.cardio += Math.round((a.moving_time || a.elapsed_time || 0) / 60);
  }
  return out;
}
function csvRows(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
/** A food-log CSV (one row per meal or per day) → { weeks: { weekStart: { fiber, satfat, sodium } }, days, found } where each
    value is the number of logged days that week meeting the habit. Only columns present are counted. */
function weeklyFromFoodCsv(text) {
  const rows = csvRows(String(text || '').replace(/^﻿/, '')); if (rows.length < 2) return { weeks: {}, days: 0, found: [] };
  const h = rows[0].map(x => x.trim().toLowerCase());
  const col = re => h.findIndex(x => re.test(x));
  const ci = { date: col(/^(date|day)\b/), fiber: col(/fib(er|re)/), satfat: col(/saturated/), sodium: col(/sodium/) };
  if (ci.date < 0) return { weeks: {}, days: 0, found: [] };
  const found = ['fiber', 'satfat', 'sodium'].filter(k => ci[k] >= 0);
  const days = {};
  for (const r of rows.slice(1)) {
    const d = toIsoDate(r[ci.date]); if (!d) continue;
    const t = days[d] ||= { fiber: 0, satfat: 0, sodium: 0 };
    for (const k of found) { const n = parseFloat(String(r[ci[k]] || '').replace(/,/g, '')); if (!isNaN(n)) t[k] += n; }
  }
  const weeks = {};
  for (const [d, t] of Object.entries(days)) {
    const w = weeks[weekOf(d)] ||= Object.fromEntries(found.map(k => [k, 0]));
    for (const k of found) if (FOOD_LIMITS[k](t[k])) w[k]++;
  }
  return { weeks, days: Object.keys(days).length, found };
}
function toIsoDate(s) {
  s = String(s || '').trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

/* ---------- stored weekly values ---------- */
const habitStore = () => (db.habits ||= {});
/** This habit's value for a week: { v, src } or null. Values you typed win over imported ones. */
const habitVal = (key, wk) => (habitStore()[key] || {})[wk] || null;
function setHabit(key, wk, v, src) {
  const h = habitStore()[key] ||= {}, cur = h[wk];
  if (src !== 'manual' && cur && cur.src === 'manual') return false;
  if (v == null || v === '') delete h[wk]; else h[wk] = { v: Math.max(0, Math.min(HABITS[key].max, Math.round(+v))), src };
  return true;
}
const habitsFor = testId => Object.entries(HABITS).filter(([, x]) => x.tests.includes(testId)).map(([k]) => k);

/* ---------- on the Summary: habits under each focus goal ---------- */
function habitRows(testId) {
  const keys = habitsFor(testId).slice(0, 2); if (!keys.length) return '';
  const wk = weekOf(today()), connected = !!S().strava;
  return `<div class="habits">${keys.map(k => {
    const x = HABITS[k], cur = habitVal(k, wk), v = cur ? cur.v : 0, pct = Math.min(100, Math.round(v / x.target * 100));
    const dots = [3, 2, 1].map(n => { const p = habitVal(k, shiftWeek(wk, -n)); return `<i class="${p ? (p.v >= x.target ? 'met' : 'part') : ''}" title="Week of ${fmt(shiftWeek(wk, -n))}: ${p ? p.v + ' ' + x.unit : 'nothing logged'}"></i>`; }).join('');
    const input = x.unit === 'min'
      ? `<input class="h-in" type="number" inputmode="numeric" min="0" max="${x.max}" step="10" value="${cur ? v : ''}" placeholder="min" data-habit="${k}" aria-label="${esc(x.name)} minutes this week">`
      : `<span class="h-days" role="group" aria-label="${esc(x.name)} this week">${Array.from({ length: x.max + 1 }, (_, n) => `<button class="${cur && v === n ? 'on' : ''}" data-habitset="${k}:${n}" aria-pressed="${cur && v === n}">${n}</button>`).join('')}</span>`;
    const hint = x.src === 'strava' && !connected ? `<a href="#" class="small" data-enc="strava">Connect Strava</a> to fill this in` : x.src === 'food' && !cur ? `<a href="#" class="small" data-go="data">Import a food log</a> or tap a number` : cur && cur.src !== 'manual' ? `<span class="small muted">from ${cur.src === 'strava' ? 'Strava' : 'your food log'}</span>` : '';
    return `<div class="habit" title="${esc(x.why)}"><div class="h-top"><span aria-hidden="true">${x.icon}</span><b>${esc(x.name)}</b><span class="h-wk muted small">this week</span>
      <span class="h-val${v >= x.target ? ' met' : ''}">${v} / ${x.target}${x.unit === 'min' ? ' min' : ''}${v >= x.target ? ' ✓' : ''}</span></div>
      <div class="h-bar"><i style="width:${pct}%"></i></div>
      <div class="h-bot"><span class="h-dots" aria-label="Last 3 weeks">${dots}</span>${input}${hint ? `<span class="h-hint">${hint}</span>` : ''}</div></div>`;
  }).join('')}</div>`;
}

/* ---------- Strava ---------- */
const STRAVA_API = 'https://www.strava.com/api/v3';
let stravaCfg = null;
async function stravaClientId() {
  if (stravaCfg) return stravaCfg.clientId;
  try { stravaCfg = await (await fetch(PUSH.url + '/strava/config')).json(); } catch (e) { stravaCfg = {}; }
  return stravaCfg.clientId;
}
async function connectStrava() {
  if (!cloudSync.user) { toast('Sign in first — your Strava connection is saved (encrypted) in your account'); return; }
  const id = await stravaClientId(); if (!id) { toast('Strava isn’t set up for this app yet'); return; }
  const state = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  sessionStorage.setItem('strava-state', state);
  location.href = `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(id)}&response_type=code&approval_prompt=auto`
    + `&scope=activity:read_all&redirect_uri=${encodeURIComponent(location.origin + '/')}&state=${state}`;
}
/** Coming back from Strava: keep the one-time code for after sign-in and remove it from the address bar. */
(function catchStravaReturn() {
  const p = new URLSearchParams(location.search); if (!p.has('state') || !(p.has('code') || p.has('error'))) return;
  if (p.get('state') === sessionStorage.getItem('strava-state')) sessionStorage.setItem('strava-return', JSON.stringify({ code: p.get('code'), scope: p.get('scope') || '', error: p.get('error') }));
  sessionStorage.removeItem('strava-state');
  history.replaceState(null, '', location.pathname + location.hash);
})();
async function stravaCall(body) {
  const res = await fetch(PUSH.url + '/strava/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: await window.cloud.getIdToken(), ...body }) });
  if (!res.ok) throw new Error('strava token ' + res.status); return res.json();
}
/** Called once signed in and unlocked: finish connecting, then refresh this week's numbers now and then. */
async function stravaAfterSignIn() {
  if (!cloudSync.user || cloudSync.locked) return;
  const ret = sessionStorage.getItem('strava-return');
  if (ret) {
    sessionStorage.removeItem('strava-return'); const r = JSON.parse(ret);
    if (r.error || !r.code) { toast('Strava wasn’t connected'); return; }
    if (!/activity:read/.test(r.scope)) { toast('To count workouts, allow Strava to “View data about your activities”'); return; }
    try {
      const t = await stravaCall({ code: r.code });
      S().strava = { access: t.access_token, refresh: t.refresh_token, expiresAt: t.expires_at, connected: today() };
      save('Strava connected'); await stravaSync(true);
    } catch (e) { console.warn(e); toast('Couldn’t connect Strava — try again'); }
    return;
  }
  const st = S().strava; if (st && Date.now() - (st.lastSync || 0) > 6 * 36e5) stravaSync(false);
}
async function stravaToken() {
  const st = S().strava; if (!st) return null;
  if ((st.expiresAt || 0) * 1000 > Date.now() + 60e3) return st.access;
  const t = await stravaCall({ refresh: st.refresh });
  Object.assign(st, { access: t.access_token, refresh: t.refresh_token, expiresAt: t.expires_at }); persist();
  return st.access;
}
/** Fetch the last 12 weeks of activities and keep only weekly cardio minutes and strength sessions. */
async function stravaSync(loud) {
  const st = S().strava; if (!st) return;
  try {
    const token = await stravaToken(), from = shiftWeek(weekOf(today()), -11);
    const after = Math.floor(Date.parse(from + 'T00:00:00Z') / 1000) - 86400, acts = [];
    for (let page = 1; page <= 5; page++) {
      const r = await fetch(`${STRAVA_API}/athlete/activities?after=${after}&per_page=100&page=${page}`, { headers: { Authorization: 'Bearer ' + token } });
      if (r.status === 401) { toast('Strava needs to be reconnected (Data → Connections)'); return; }
      if (!r.ok) throw new Error('strava ' + r.status);
      const batch = await r.json(); acts.push(...batch); if (batch.length < 100) break;
    }
    const weeks = weeklyFromActivities(acts);
    for (let wk = from; wk <= weekOf(today()); wk = shiftWeek(wk, 1)) {
      const w = weeks[wk] || { cardio: 0, strength: 0 };
      setHabit('cardio', wk, w.cardio, 'strava'); setHabit('strength', wk, w.strength, 'strava');
    }
    st.lastSync = Date.now(); save(loud ? `Synced ${acts.length} Strava activit${acts.length === 1 ? 'y' : 'ies'} (weekly totals only)` : undefined);
  } catch (e) { console.warn('Strava sync', e); if (loud) toast('Couldn’t reach Strava — try again later'); }
}
async function disconnectStrava() {
  const st = S().strava; if (!st || !confirm('Disconnect Strava? Weekly totals already saved are kept.')) return;
  try { await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', mode: 'no-cors', body: new URLSearchParams({ access_token: st.access }) }); } catch (e) { }
  delete S().strava; save('Strava disconnected');
}

/* ---------- food log import ---------- */
async function importFoodLog(file) {
  try {
    const r = weeklyFromFoodCsv(await file.text());
    if (!r.days || !r.found.length) { toast('Couldn’t find dates and fiber, saturated fat or sodium columns in that file'); return; }
    let n = 0; for (const [wk, w] of Object.entries(r.weeks)) for (const k of r.found) if (setHabit(k, wk, w[k], 'food')) n++;
    save(`Imported ${r.days} days from your food log (weekly totals only)`);
  } catch (e) { console.warn(e); toast('Couldn’t read that file'); }
}

/* ---------- Data tab: connections ---------- */
function connectionsSection() {
  const st = S().strava, onMirror = /pages\.dev$/.test(location.hostname);
  return `<h2>Connections</h2><div class="card"><div class="card-b">
    <p class="small" style="margin-top:0">Count your weekly habits automatically. Only weekly totals are saved, end-to-end encrypted like the rest of your data.</p>
    <div class="conn"><div><b>Strava</b> <span class="small muted">— workouts, including Garmin, Apple Watch and others that sync to Strava</span>
      <div class="small">${st ? `✓ Connected${st.lastSync ? ` · last synced ${new Date(st.lastSync).toLocaleString()}` : ''}` : 'Weekly cardio minutes and strength sessions.'}</div></div>
      <div class="actions">${st ? '<button class="btn" data-enc="stravasync">Sync now</button><button class="btn" data-enc="stravaoff">Disconnect</button>'
        : onMirror ? '<span class="small">Open <a href="https://healthspantracker.web.app">healthspantracker.web.app</a> to connect Strava.</span>' : '<button class="btn strava-btn" data-enc="strava">Connect with Strava</button>'}</div></div>
    <div class="conn"><div><b>Food log</b> <span class="small muted">— MyFitnessPal, Cronometer or any CSV with dates and nutrients</span>
      <div class="small">Days with 25 g+ fiber, under 13 g saturated fat and under 2,300 mg sodium. MyFitnessPal: Reports → Export (Premium).</div></div>
      <div class="actions"><label class="btn">Import food log (CSV)<input type="file" accept=".csv,text/csv" id="foodcsv" hidden></label></div></div>
    ${st ? '<p class="small muted" style="margin:10px 0 0">Powered by Strava</p>' : ''}
  </div></div>`;
}

/* ---------- clicks and inputs ---------- */
document.addEventListener('click', e => {
  const enc = e.target.closest('[data-enc]');
  if (enc && /^(strava|stravasync|stravaoff)$/.test(enc.dataset.enc)) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (enc.dataset.enc === 'strava') connectStrava(); else if (enc.dataset.enc === 'stravasync') stravaSync(true); else disconnectStrava();
    return;
  }
  const set = e.target.closest('[data-habitset]');
  if (set) { e.preventDefault(); e.stopImmediatePropagation(); const [k, n] = set.dataset.habitset.split(':'); const wk = weekOf(today()), cur = habitVal(k, wk);
    setHabit(k, wk, cur && cur.v === +n && cur.src === 'manual' ? null : n, 'manual'); save(); return; }
  if (e.target.closest('.habit')) e.stopImmediatePropagation();       // typing in a habit doesn't open the test
}, true);
document.addEventListener('change', e => {
  if (e.target.matches('[data-habit]')) { setHabit(e.target.dataset.habit, weekOf(today()), e.target.value, 'manual'); save(); }
  if (e.target.id === 'foodcsv' && e.target.files[0]) importFoodLog(e.target.files[0]);
});
