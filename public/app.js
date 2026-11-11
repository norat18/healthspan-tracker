/* Healthspan Tracker — works without an account (data stays in this browser).
   Signed in with Google, data is saved automatically to the person's own Firestore document (see cloud.js). */
'use strict';
const KEY = 'healthspan-tracker-v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- dates ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = s => s ? toDate(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtShort = s => s ? toDate(s).toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) : '—';
const days = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
function addMonths(s, n) {
  const d = toDate(s), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return iso(d);
}
function rel(n) {
  if (n === 0) return 'today';
  const a = Math.abs(n), unit = a >= 365 ? [Math.round(a / 365 * 10) / 10, 'yr'] : a >= 60 ? [Math.round(a / 30.4), 'mo'] : [a, 'day'];
  const txt = `${unit[0]} ${unit[1]}${unit[0] === 1 ? '' : 's'}`;
  return n < 0 ? `${txt} ago` : `in ${txt}`;
}
const freqText = m => !m ? 'No repeat set' : m % 12 === 0 ? `Every ${m / 12 === 1 ? 'year' : m / 12 + ' years'}` : `Every ${m} month${m === 1 ? '' : 's'}`;

/* ---------- storage ---------- */
function load() {
  try { const s = localStorage.getItem(KEY); if (s) { const d = JSON.parse(s); if (applyImports(d)) localStorage.setItem(KEY, JSON.stringify(d)); return d; } } catch (e) { /* fall through */ }
  return fresh();
}
function fresh() {
  const d = structuredClone(window.HEALTH_SEED);
  d.settings = { soonDays: 60, lastNotified: null };
  applyImports(d);
  return d;
}
/** Apply each extra import (imports.js) once; returns true if anything changed. */
function applyImports(d) {
  d.settings ||= { soonDays: 60 }; const done = (d.settings.appliedImports ||= []); let changed = false;
  (window.HEALTH_IMPORTS || []).forEach(imp => {
    if (done.includes(imp.id)) return;
    (imp.tests || []).forEach(t => { if (!d.tests.some(x => x.id === t.id)) d.tests.push(structuredClone(t)); });
    (imp.results || []).forEach(r => { d.results = d.results.filter(x => !(x.testId === r.testId && x.date === r.date)); d.results.push({ ...r }); });
    (imp.draws || []).forEach(dr => { d.draws ||= []; const ex = d.draws.find(x => x.date === dr.date); if (ex) ex.note = dr.note || ex.note; else d.draws.push({ ...dr }); });
    (imp.procedures || []).forEach(p => { if (!d.procedures.some(x => x.id === p.id)) d.procedures.push(structuredClone(p)); });
    if (imp.settings) Object.assign(d.settings, imp.settings);
    (imp.removeEmptyDraws || []).forEach(dt => { if (!d.results.some(r => r.date === dt)) d.draws = (d.draws || []).filter(x => x.date !== dt); });
    ['events', 'meds', 'family'].forEach(k => (imp[k] || []).forEach(x => { d[k] ||= []; if (!d[k].some(y => y.id === x.id)) d[k].push({ ...x }); }));
    Object.entries(imp.testPatch || {}).forEach(([id, u]) => { const t = d.tests.find(x => x.id === id); if (t) Object.assign(t, u); });
    Object.entries(imp.procUpdates || {}).forEach(([id, u]) => { const p = d.procedures.find(x => x.id === id); if (p) Object.assign(p, u); });
    (imp.visits || []).forEach(v => {
      if (d.visits.some(x => x.id === v.id)) return;
      d.visits.push({ ...v });
      const p = d.procedures.find(x => x.id === v.procId); if (p && p.nextDue && p.nextDue <= v.date) p.nextDue = null;
    });
    Object.entries(imp.testNextDue || {}).forEach(([id, date]) => { const t = d.tests.find(x => x.id === id); if (t) t.nextDue = date; });
    (imp.testUpdates || []).forEach(([ids, u]) => d.tests.filter(t => ids.includes(t.id)).forEach(t => { if (t.nextDue && u.clearNextDueBefore && t.nextDue <= u.clearNextDueBefore) t.nextDue = null; }));
    done.push(imp.id); changed = true;
  });
  return changed;
}
let db = load();
if (typeof applyAgeNorms === 'function') applyAgeNorms(db);
let view = 'summary';
/* ---------- saving: this browser, plus your account when signed in ---------- */
const cloudSync = { ready: false, user: null, pending: false, error: false, savedAt: 0 };
let putTimer = null;
const hasData = d => d && ((d.results || []).length || (d.visits || []).length || (d.meds || []).length || (d.family || []).length);
/** Save without re-rendering: this browser now, your account a moment later. */
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* account copy is the main one when signed in */ }
  if (cloudSync.user) { cloudSync.pending = true; updateSyncBadge(); clearTimeout(putTimer); putTimer = setTimeout(pushToCloud, 600); }
}
async function pushToCloud() {
  if (!cloudSync.user || !window.cloud) return;
  try { const t = Date.now(); db.settings.owner = cloudSync.user.uid; await window.cloud.save(JSON.stringify(db), t); cloudSync.savedAt = t; cloudSync.pending = false; cloudSync.error = false; }
  catch (e) { cloudSync.error = true; console.warn('Save to account failed', e); }
  updateSyncBadge();
}
/** Load your account's copy. First sign-in: this browser's data moves into your account. */
async function syncFromCloud(first) {
  if (!cloudSync.user || !window.cloud) return;
  try {
    const remote = await window.cloud.load();
    if (!remote) { if (db.settings.owner && db.settings.owner !== cloudSync.user.uid) db = fresh(); await pushToCloud(); if (first) toast('Signed in — your data now saves to your account'); }
    else if ((remote.savedAtMs || 0) > cloudSync.savedAt) {
      const local = db, guestData = first && !local.settings.owner && hasData(local);
      if (guestData && !confirm('Your account already has saved data.\n\nOK — keep your account’s data (recommended)\nCancel — replace it with the data on this device')) { await pushToCloud(); }
      else {
        db = JSON.parse(remote.data); cloudSync.savedAt = remote.savedAtMs || Date.now();
        const changed = applyImports(db); if (typeof applyAgeNorms === 'function') applyAgeNorms(db);
        try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { }
        if (changed) await pushToCloud();
      }
    }
    cloudSync.error = false;
  } catch (e) { cloudSync.error = true; console.warn('Load from account failed', e); }
  updateSyncBadge(); if (!modal.open) render();
}
window.onCloudUser = async user => {
  const was = cloudSync.user; cloudSync.ready = true; cloudSync.user = user;
  if (user) await syncFromCloud(!was);
  else if (was) { try { localStorage.removeItem(KEY); } catch (e) { } db = fresh(); cloudSync.savedAt = 0; toast('Signed out'); }
  updateSyncBadge(); if (!modal.open) render();
};
/** Explain a sign-in problem in plain words, with the technical code for troubleshooting. */
function signInError(err) {
  const code = (err && err.code) || 'unknown';
  const why = {
    'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
    'auth/cancelled-popup-request': 'Another sign-in window was already open.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
    'auth/unauthorized-domain': 'This web address isn’t allowed to sign in yet.',
    'auth/operation-not-allowed': 'Google sign-in isn’t switched on for this app yet.',
    'auth/network-request-failed': 'The sign-in couldn’t reach Google. Check your connection, or turn off blockers for this site.',
    'auth/internal-error': 'Google sign-in hit an internal error.',
  }[code] || 'Something went wrong while signing in.';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return toast(why);
  open(`${head('Couldn’t sign in')}<div class="m-b"><p>${esc(why)}</p><p class="small muted">Error code: <code>${esc(code)}</code>${err && err.message ? `<br>${esc(err.message)}` : ''}</p>
    <div class="actions"><button class="btn primary" data-signin>Try again</button><button class="btn" data-close>Close</button></div></div>`);
}
function updateSyncBadge() {
  const el = document.getElementById('sync'); if (!el) return;
  if (!cloudSync.ready) { el.innerHTML = ''; return; }
  if (!cloudSync.user) { el.innerHTML = `<button class="btn primary" data-signin>Sign in to save</button>`; return; }
  const st = cloudSync.error ? '<span class="sync warn" title="Couldn’t reach your account — changes are kept on this device and will retry.">⚠ Not saved</span>'
    : cloudSync.pending ? '<span class="sync">Saving…</span>' : '<span class="sync ok" title="Saved to your account">✓ Saved</span>';
  el.innerHTML = `${st}<button class="acct" data-acctmenu title="${esc(cloudSync.user.email || '')}">${cloudSync.user.photoURL ? `<img src="${esc(cloudSync.user.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc((cloudSync.user.email || '?')[0].toUpperCase())}</button>`;
}
function save(msg) {
  persist();
  render(); if (msg) toast(msg);
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- domain ---------- */
const testById = id => db.tests.find(t => t.id === id);
const procById = id => db.procedures.find(p => p.id === id);
const resultsFor = id => db.results.filter(r => r.testId === id).sort((a, b) => a.date.localeCompare(b.date));
const visitsFor = id => db.visits.filter(v => v.procId === id).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
const num = v => { const m = String(v ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
function flag(t, v) {
  const n = num(v);
  if (n == null || (t.low == null && t.high == null)) return 'none';
  if (t.low != null && n < t.low) return 'low';
  if (t.high != null && n > t.high) return 'high';
  return 'ok';
}
/** Judge a value against the lab's printed normal range (null when no lab range is stored). */
function labFlag(t, v) {
  const n = num(v); if (n == null || (t.labLow == null && t.labHigh == null)) return null;
  if (t.labLow != null && n < t.labLow) return 'low';
  if (t.labHigh != null && n > t.labHigh) return 'high';
  return 'normal';
}
const LAB_WORD = { normal: 'Lab: normal', high: 'Lab: high', low: 'Lab: low' };
const FLAG_LABEL = { ok: 'In range', low: 'Below optimal', high: 'Above optimal', none: 'No target' };

const isProc = item => db.procedures.includes(item);
/** Screenings that apply to this person (women's/men's items follow the sex setting). */
const forMe = i => !i.sex || !db.settings.sex || i.sex === db.settings.sex;
const myProcs = () => db.procedures.filter(forMe);
function lastDone(item) {
  const ds = !isProc(item) ? resultsFor(item.id).map(r => r.date) : visitsFor(item.id).filter(v => v.date).map(v => v.date);
  return ds.sort().at(-1) || null;
}
/** When is this test/visit due next? */
function schedule(item) {
  const last = lastDone(item), T = today(), proc = isProc(item);
  const fam = typeof familyAdjust === 'function' ? familyAdjust(item) : null;
  if (fam) item = { ...item, ...fam.patch };
  if (item.oneTime && last) return { last, due: null, state: 'complete', label: 'Done (one-time)' };
  if (item.asNeeded && !item.nextDue) return { last, due: null, state: 'unscheduled', label: 'As needed' };
  if (item.optional && !last && !item.nextDue) return { last, due: null, state: 'unscheduled', label: 'Optional — not tested yet' };
  if (item.groupWith && !item.nextDue) { const g = testById(item.groupWith); if (g) { const gs = schedule(g); return { ...gs, last }; } }
  const dob = db.settings.dob;
  if (item.endAge != null && dob && addMonths(dob, item.endAge * 12) < T) return { last, due: null, state: 'complete', label: `Usually not needed after age ${item.endAge}` };
  if (item.startAge != null && !last && !item.nextDue) {
    if (!dob) return { last, due: null, state: 'unscheduled', label: `Starts at age ${item.startAge} — add your birth date in Data` };
    const start = addMonths(dob, item.startAge * 12), d0 = days(T, start);
    if (d0 > 0) return { last, due: start, days: d0, why: 'age', state: d0 <= db.settings.soonDays ? 'soon' : 'later', label: `Starts at age ${item.startAge}${fam ? ' (family history)' : ''} · ${fmt(start)} (${rel(d0)})`, fam: fam?.why };
  }
  let due = item.nextDue || null, why = 'scheduled';
  if (!due && item.oneTime) { due = T; why = 'never'; }
  else if (!due && item.frequencyMonths) { due = last ? addMonths(last, item.frequencyMonths) : T; why = last ? 'repeat' : 'never'; }
  if (!due) return { last, due: null, state: 'unscheduled', label: 'Not scheduled' };
  const d = days(T, due);
  if (why === 'never' && d <= 0) return { last, due, days: 0, why, state: 'never', label: proc ? 'No date on file — due now' : 'Never tested — due now' };
  const state = d < 0 ? 'overdue' : d <= db.settings.soonDays ? 'soon' : 'later';
  const label = state === 'overdue' ? `Overdue · was due ${fmt(due)}` : `Due ${fmt(due)} (${rel(d)})`;
  return { last, due, days: d, why, state, label };
}
const chip = s => `<span class="chip ${s.state}">${esc(s.label === 'As needed' ? 'As needed' : { overdue: 'Overdue', soon: 'Due soon', never: 'Not on file', later: 'Scheduled', complete: 'Done', unscheduled: 'Not scheduled' }[s.state])}</span>`;
const STATE_ORDER = { overdue: 0, never: 1, soon: 2, later: 3, unscheduled: 4, complete: 5 };
const byUrgency = (a, b) => STATE_ORDER[a.s.state] - STATE_ORDER[b.s.state] || (a.s.due || '9').localeCompare(b.s.due || '9');
const allItems = () => [...myProcs(), ...db.tests.filter(t => t.kind !== 'metric' && t.kind !== 'scan' && !t.groupWith)].map(i => ({ i, s: schedule(i) }));
const kindOf = t => t.kind === 'metric' || t.kind === 'scan' ? t.kind : 'blood';
function draws(kind = 'blood') {
  const m = new Map(), ids = new Set(db.tests.filter(t => kindOf(t) === kind).map(t => t.id)), rs = db.results.filter(r => ids.has(r.testId));
  if (kind === 'blood') (db.draws || []).forEach(d => m.set(d.date, { ...d }));
  rs.forEach(r => { if (!m.has(r.date)) m.set(r.date, { id: 'draw-' + r.date, date: r.date, note: '' }); });
  return [...m.values()].map(d => ({ ...d, count: rs.filter(r => r.date === d.date).length }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------- views ---------- */
function render() {
  $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#view').innerHTML = ({ summary: () => vSummary(), myinfo: () => vMyInfo(), reminders: vReminders, blood: () => vBlood('blood'), body: () => vBlood('metric'), procs: vProcs, orders: vOrders, data: vData })[view]();
}

function vReminders() {
  const items = allItems();
  const count = st => items.filter(x => x.s.state === st).length;
  const next = items.filter(x => x.s.due && x.s.days > 0 && x.s.state !== 'never').sort((a, b) => a.s.due.localeCompare(b.s.due))[0];
  const procs = items.filter(x => isProc(x.i)).sort(byUrgency);
  const procRow = ({ i, s }) => `
      <li class="row">
        <div class="main click" data-proc="${i.id}" style="cursor:pointer">
          <div class="title">${esc(i.name)}${i.sex === 'female' ? ' <span class="tag">♀</span>' : ''}</div>
          ${purposeOf(i) ? `<div class="purpose-line">${esc(i.purpose || purposeOf(i))}</div>` : ''}
          <div class="meta">${esc(s.label)}${s.last ? ' · Last: ' + fmt(s.last) : ''}${i.asNeeded || !i.frequencyMonths ? '' : ' · ' + esc(freqText(i.frequencyMonths))}${i.provider ? ' · ' + esc(i.provider) : ''}</div>
        </div>
        ${chip(s)}
        <div class="actions"><button class="btn" data-logvisit="${i.id}">${i.kind === 'vaccine' ? 'Log shot' : 'Log visit'}</button></div>
      </li>`;
  const procNow = procs.filter(x => ['overdue', 'never', 'soon'].includes(x.s.state)), procLater = procs.filter(x => !procNow.includes(x));
  const blood = items.filter(x => x.i.kind === 'blood');
  const groups = {};
  blood.forEach(x => (groups[x.i.orderFrom || 'Bloodwork'] ||= []).push(x));
  const wellness = procById('wellness-exam');
  const ws = wellness && schedule(wellness);
  return `
  <div class="stats">
    <div class="stat bad"><div class="n">${count('overdue')}</div><div class="l">Overdue</div></div>
    <div class="stat warn"><div class="n">${count('soon')}</div><div class="l">Due in next ${db.settings.soonDays} days</div></div>
    <div class="stat info"><div class="n">${count('never')}</div><div class="l">Never tested yet</div></div>
    <div class="stat"><div class="n" style="font-size:1.05rem;padding:6px 0 5px">${next ? esc(short(next.i.name)) : '—'}</div>
      <div class="l">${next ? 'Next up · ' + fmt(next.s.due) : 'Nothing scheduled'}</div></div>
  </div>
  ${ws && ws.due ? `<div class="hint">🩸 <b>Wellness exam ${ws.state === 'overdue' ? 'was due' : 'is'} ${fmt(ws.due)}</b> — a good time to get your routine bloodwork. <a href="#" data-visitsheet="wellness-exam">Print a visit prep sheet</a> with the tests to ask for.</div>` : ''}
  ${(() => { const n = pastDateItems().count; return n ? `<div class="hint pd-hint"><div><b>${n} items have no date on file.</b> Add when you last had them so reminders are accurate.</div><button class="btn primary" data-pastdates>Fill in past dates</button></div>` : ''; })()}
  <h2>Appointments, screenings &amp; vaccines</h2>
  <div class="card"><div class="card-b"><ul class="list">${procNow.map(procRow).join('') || '<li class="row muted">Nothing due right now.</li>'}</ul>
    ${procLater.length ? `<details class="later"><summary>Scheduled later, as needed or done (${procLater.length})</summary><ul class="list">${procLater.map(procRow).join('')}</ul></details>` : ''}
  </div></div>
  <h2>Bloodwork</h2>
  ${Object.entries(groups).map(([src, xs]) => {
    xs.sort(byUrgency);
    const due = xs.filter(x => ['overdue', 'never', 'soon'].includes(x.s.state));
    const rest = xs.length - due.length;
    return `<div class="card"><div class="card-h">
        <div><h3>${esc(src === 'UW' || src === 'Ulta Labs' ? 'Order from ' + src : src)}</h3>
        <div class="meta small muted">${due.length} of ${xs.length} tests due or overdue${rest ? ` · ${rest} scheduled later or complete` : ''}</div></div>
        <div class="actions"><button class="btn" data-copy="${esc(src)}">Copy due list</button><button class="btn primary" data-addresults="${esc(src)}">Log results</button></div>
      </div><div class="card-b"><ul class="list">
      ${(due.length ? due : xs).map(({ i, s }) => `
        <li class="row click" data-test="${i.id}">
          <div class="main"><div class="title">${esc(i.name)}${(() => { const g = db.tests.filter(x => x.groupWith === i.id); return g.length ? ` <span class="muted small">(includes ${esc(g.map(x => x.name.replace(/^Vitamin /, '')).join(', '))})</span>` : ''; })()}</div>
          ${i.description ? `<div class="purpose-line">${esc(i.description)}</div>` : ''}
          <div class="meta">${esc(s.label)}${s.last ? ' · Last: ' + fmt(s.last) : ''}${i.oneTime ? ' · One-time test' : ''}</div></div>
          ${chip(s)}
        </li>`).join('')}
      </ul></div></div>`;
  }).join('')}
  <p class="muted small" style="margin-top:20px">Want reminders outside this page? Go to <a href="#" data-go="data">Data</a> to add them to your calendar or turn on desktop notifications.</p>`;
}
const PANEL_INFO = {
  'Complete Blood Count': 'Red cells, white cells and platelets — screens for anemia, infection and blood disorders.',
  'Lipid Panel': 'Cholesterol and triglycerides — the fats in your blood that drive heart-disease risk.',
  'Comprehensive Metabolic Panel (CMP)': 'Electrolytes, blood sugar, and kidney and liver function in one test.',
  'Thyroid & Metabolic': 'How your body handles sugar and energy, and whether your thyroid works normally.',
  'Vitamins & Iron': 'Nutrients that affect energy, bones, nerves and red blood cells.',
  'Advanced Cardiovascular': 'Deeper heart-risk markers that go beyond the standard lipid panel.',
  'Inflammation': 'Signs of inflammation in the body and blood vessels, which is linked to heart disease.',
  'Sexual health screening': 'Common sexually transmitted infections, which often cause no symptoms.',
  'Infection screening (one-time)': 'Hepatitis B, hepatitis C and HIV — recommended at least once for every adult.',
  'DEXA · Body composition': 'How much of your body is fat vs. muscle, and where fat is stored.',
  'DEXA · Regional': 'Fat and muscle by body region — shows imbalances between arms, legs and trunk.',
  'DEXA · Bone': 'Bone density — your protection against osteoporosis and fractures later in life.',
  'Fitness · VO₂ max': 'Cardio fitness, a top predictor of lifespan, plus your heart-rate training zones.',
  'Metabolism & heart': 'Calories you burn at rest, which fuel you burn, and your resting heart rate.',
};
const KIND_INFO = {
  imaging: ['Other imaging', 'Scans that look inside the body.'],
  fitness: ['Fitness tests', 'Measures of cardio fitness and metabolism.'],
  checkup: ['Routine checkups', 'Regular visits that catch problems early.'],
  mens: ['Men’s health', 'Screenings specific to male anatomy. Based on U.S. guidelines (USPSTF) — your doctor may adjust them for your history.'],
  womens: ['Women’s health', 'Screenings and visits specific to female anatomy. Based on U.S. guidelines (USPSTF, ACOG, ACS) — your doctor may adjust them for your history.'],
  screening: ['Preventive screenings', 'Checks recommended for all adults at certain ages.'],
  vaccine: ['Vaccines', 'Recommended adult immunizations (CDC schedule). Log each dose so you know when the next is due.'],
};
const showPurpose = () => !db.settings.hidePurpose;
const purposeOf = i => i.purpose || i.description || '';
const short = n => { const s = n.replace(/\s*\(.*\)\s*/, '').trim(); return s.length < 4 ? n : s; };

let bloodFilter = { q: '', src: 'all', flagged: false };
function vBlood(kind) {
  const ds = draws(kind), body = kind === 'metric', cards = db.settings.resultView !== 'table';
  const q = bloodFilter.q.toLowerCase();
  const tests = db.tests.filter(t => kindOf(t) === kind && (!q || (t.name + ' ' + t.panel).toLowerCase().includes(q))
    && (body || bloodFilter.src === 'all' || (t.orderFrom || 'none') === bloodFilter.src)
    && (!bloodFilter.flagged || ['high', 'low'].includes(flag(t, resultsFor(t.id).at(-1)?.value))));
  const panels = [...new Set(db.tests.filter(t => kindOf(t) === kind).map(t => t.panel))];
  const srcs = [...new Set(db.tests.filter(t => kindOf(t) === kind).map(t => t.orderFrom || 'none'))];
  return `
  <div class="toolbar">
    <input id="bq" type="search" placeholder="Search tests…" value="${esc(bloodFilter.q)}">
    ${body ? '' : `<select id="bsrc"><option value="all">All sources</option>${srcs.map(s => `<option value="${esc(s)}" ${bloodFilter.src === s ? 'selected' : ''}>${s === 'none' ? 'Not on an order list' : 'Order from ' + esc(s)}</option>`).join('')}</select>`}
    <label class="check small"><input id="bflag" type="checkbox" ${bloodFilter.flagged ? 'checked' : ''}> Only out of range</label>
    <label class="check small"><input id="bpurpose" type="checkbox" ${showPurpose() ? 'checked' : ''}> Show what each test is for</label>
    <span class="grow"></span>
    <div class="seg-toggle" role="group" aria-label="View"><button class="${cards ? 'on' : ''}" data-rview="cards">Cards</button><button class="${cards ? '' : 'on'}" data-rview="table">Table</button></div>
    <button class="btn" data-newtest="${kind}">Add ${body ? 'metric' : 'test'}</button>
    ${body ? '' : '<button class="btn" data-labimport>Import lab report</button>'}
    <button class="btn primary" data-addresults="all" data-kind="${kind}">Log ${body ? 'results' : 'lab results'}</button>
  </div>
  ${body && typeof fitnessAgeCard === 'function' ? fitnessAgeCard() : ''}
  ${cards ? resultCards(kind, panels, tests) : `<div class="tablewrap"><table>
    <thead><tr><th>Test</th><th>Optimal</th>
      ${ds.map(d => `<th title="${esc(d.note || '')}" class="${d.note ? 'drawhead' : ''}" data-draw="${d.date}" data-kind="${kind}">${fmtShort(d.date)}${d.count ? '' : ' (empty)'}</th>`).join('')}
      <th>Trend</th>${body ? '' : '<th>Next due</th>'}</tr></thead>
    <tbody>
    ${panels.map(p => {
      const ts = tests.filter(t => t.panel === p); if (!ts.length) return '';
      return `<tr class="panel"><td colspan="${ds.length + (body ? 3 : 4)}"><span class="ph">${esc(p)}</span>${PANEL_INFO[p] ? `<span class="pd">${esc(PANEL_INFO[p])}</span>` : ''}</td></tr>` + ts.map(t => {
        const rs = resultsFor(t.id), s = schedule(t);
        return `<tr class="t" data-test="${t.id}"><td class="name">${esc(t.name)} <span class="muted small">${esc(t.unit)}</span>${showPurpose() && t.description ? `<div class="purpose-line">${esc(t.description)}</div>` : ''}</td>
          <td class="muted small">${esc(t.optimalText)}${t.labText ? `<div>Lab: ${esc(t.labText)}</div>` : ''}</td>
          ${ds.map(d => { const r = rs.find(x => x.date === d.date); return `<td class="num ${r ? 'v-' + flag(t, r.value) : ''}" ${r?.note ? `title="${esc(r.note)}"` : ''}>${r ? esc(r.value) : '<span class="muted">·</span>'}</td>`; }).join('')}
          <td>${spark(t, rs)}</td>
          ${body ? '' : `<td>${chip(s)} <span class="small muted">${s.due ? fmtShort(s.due) : ''}</span></td>`}</tr>`;
      }).join('');
    }).join('')}
    </tbody></table></div>`}
  ${body ? `<p class="small muted" style="margin-top:12px">Full write-ups and reminders for these visits are under <a href="#" data-go="procs">Imaging &amp; Checkups</a>. Hover a value to see its percentile or notes.</p>` : `<h2>Lab draws</h2>
  <div class="card"><div class="card-b"><ul class="list">
    ${ds.map(d => `<li class="row"><div class="main"><div class="title">${fmt(d.date)} <span class="muted small">· ${d.count} result${d.count === 1 ? '' : 's'}</span></div>
      ${d.note ? `<div class="meta" style="white-space:pre-line">${esc(d.note)}</div>` : d.count ? '' : '<div class="meta">No values entered for this date yet.</div>'}</div>
      <div class="actions"><button class="btn" data-editdraw="${d.date}">${d.count ? 'Edit' : 'Enter results'}</button></div></li>`).join('')}
  </ul></div></div>`}`;
}

function spark(t, rs) {
  const pts = rs.map(r => num(r.value)).filter(v => v != null);
  if (pts.length < 2) return '<span class="muted small">—</span>';
  const w = 70, h = 22, mn = Math.min(...pts), mx = Math.max(...pts), span = mx - mn || 1;
  const xy = pts.map((v, i) => [i / (pts.length - 1) * (w - 4) + 2, h - 3 - (v - mn) / span * (h - 6)]);
  const f = flag(t, rs.at(-1).value);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="trend"><polyline points="${xy.map(p => p.join(',')).join(' ')}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>
    <circle cx="${xy.at(-1)[0]}" cy="${xy.at(-1)[1]}" r="2.6" fill="${f === 'ok' ? 'var(--ok)' : f === 'none' ? 'var(--muted)' : 'var(--bad)'}"/></svg>`;
}

function vProcs() {
  const items = myProcs().map(i => ({ i, s: schedule(i) })).sort(byUrgency);
  const sect = (kind, title) => !items.some(x => x.i.kind === kind && !(typeof SCANS !== 'undefined' && SCANS[x.i.id])) ? '' : `<h2>${title}</h2>${KIND_INFO[kind] ? `<p class="small muted" style="margin:-6px 0 12px">${esc(KIND_INFO[kind][1])}</p>` : ''}<div class="procs">${items.filter(x => x.i.kind === kind && !(typeof SCANS !== 'undefined' && SCANS[x.i.id])).map(({ i, s }) => {
    const vs = visitsFor(i.id), lastRes = [...vs].reverse().find(v => v.result && !v.result.startsWith('Imported from spreadsheet ("'));
    const bundle = i.bundleWith && procById(i.bundleWith);
    return `<div class="card"><div class="card-h"><h3>${esc(i.name)}${i.sex === 'female' ? ' <span class="tag">♀</span>' : ''}</h3>${chip(s)}</div>
      <div class="card-b"><p class="purpose"><b>What it’s for:</b> ${esc(purposeOf(i))}</p>
      ${i.purpose && i.description ? `<p class="small muted clamp">${esc(i.description)}</p>` : ''}
      ${bundle ? `<p class="small">Usually done at your <b>${esc(bundle.name.replace(/\s*\(.*\)/, ''))}</b>.</p>` : ''}
      <dl class="kv"><dt>Next</dt><dd>${esc(s.label)}</dd><dt>Last</dt><dd>${fmt(s.last)}</dd><dt>Repeat</dt><dd>${esc(i.asNeeded ? 'As needed' : freqText(i.frequencyMonths))}</dd>
      ${i.provider ? `<dt>Provider</dt><dd>${esc(i.provider)}</dd>` : ''}</dl>
      ${lastRes ? `<p class="small clamp"><b>Latest result:</b> ${esc(lastRes.result)}</p>` : ''}</div>
      <div class="card-h" style="border-top:1px solid var(--border);border-bottom:0"><button class="btn link" data-proc="${i.id}">Details &amp; history</button>
      <button class="btn primary" data-logvisit="${i.id}">${i.kind === 'vaccine' ? 'Log shot' : 'Log visit'}</button></div></div>`;
  }).join('')}</div>`;
  return (typeof scanSection === 'function' ? scanSection() : '') + sect('imaging', 'Other imaging') + sect('fitness', 'Fitness tests') + sect('checkup', 'Routine checkups') +
    sect('womens', 'Women’s health') + sect('mens', 'Men’s health') + sect('screening', 'Preventive screenings') + sect('vaccine', 'Vaccines') +
    `<div class="toolbar"><button class="btn" data-newproc>Add appointment type</button></div>`;
}

function vOrders() {
  return `${db.orderLists.map(ol => `
    <h2>${esc(ol.title)}</h2>
    <div class="card"><div class="card-h"><span class="muted small">${ol.items.length} items from your General Info tab</span>
      <button class="btn" data-copylist="${ol.id}">Copy list</button></div>
    <div class="card-b"><ul class="list">
    ${ol.items.map(it => {
      const ts = it.testIds.map(testById).filter(Boolean);
      const ss = ts.map(schedule).sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);
      const s = ss[0] || { state: 'unscheduled', label: '' };
      const last = ts.map(t => resultsFor(t.id).at(-1)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      return `<li class="row ${ts.length ? 'click' : ''}" ${ts.length === 1 ? `data-test="${ts[0].id}"` : ''}>
        <div class="main"><div class="title">${esc(it.label)}</div>
        <div class="meta">${ts.length > 1 ? `${ts.length} tests · ` : ''}${last ? 'Last: ' + fmt(last.date) : 'Never tested'}${s.due ? ' · ' + esc(s.label) : ''}</div></div>${chip(s)}</li>`;
    }).join('')}
    </ul></div></div>`).join('')}
  ${db.resources?.length ? `<h2>Resources</h2><div class="card"><div class="card-b"><ul class="list">${db.resources.map(r => `<li class="row"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a><span class="muted small">${esc(r.url)}</span></li>`).join('')}</ul></div></div>` : ''}`;
}

function vData() {
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  return `
  <h2>Reminders outside the app</h2>
  <div class="card"><div class="card-b">
    <p>Download a calendar file with every upcoming test and appointment. Each event alerts you <b>a week before</b> and <b>on the day</b>. Open it to add it to Apple Calendar, Google Calendar or Outlook. Re-download after you log results so dates stay current.</p>
    <div class="actions"><button class="btn primary" data-ics>Download calendar (.ics)</button></div>
    <p class="small muted" style="margin-top:14px">Desktop notifications: ${perm === 'granted' ? 'on — you’ll get a summary once a day when this page is open.' : perm === 'denied' ? 'blocked in this browser’s settings.' : perm === 'unsupported' ? 'not supported in this browser.' : 'off.'}</p>
    ${perm === 'default' ? '<button class="btn" data-notify>Turn on notifications</button>' : ''}
    <label class="f" style="margin-top:14px;max-width:240px">Date of birth (for age-based screenings)<input id="dob" type="date" value="${db.settings.dob || ''}"></label>
    ${db.settings.dob ? `<p class="small muted" style="margin:6px 0 0">You’re ${ageOn(db.settings.dob, today())} · next birthday ${fmt(nextBirthday(db.settings.dob))}. Age-based screenings and fitness ratings use this.</p>` : ''}
    <label class="f" style="margin-top:14px;max-width:240px">Sex (for fitness-age comparison)<select id="sex"><option value="female" ${db.settings.sex !== 'male' ? 'selected' : ''}>Female</option><option value="male" ${db.settings.sex === 'male' ? 'selected' : ''}>Male</option></select></label>
    <label class="f" style="margin-top:14px;max-width:240px">“Due soon” window (days)<input id="soon" type="number" min="7" max="365" value="${db.settings.soonDays}"></label>
  </div></div>
  <h2>Past dates</h2>
  <div class="card"><div class="card-b"><p>Add the last date for checkups, screenings, vaccines and one-time tests that have no date on file (${pastDateItems().count} right now).</p>
    <button class="btn" data-pastdates>Fill in past dates</button></div></div>
  <h2>Your account &amp; privacy</h2>
  <div class="card"><div class="card-b">
    ${cloudSync.user ? `<p><b>✓ Signed in as ${esc(cloudSync.user.email || '')}.</b> Every change saves automatically to your account, so your data is the same on any device you sign in on. Only you can read it.</p>
      <div class="actions"><button class="btn" data-signout>Sign out</button><button class="btn danger" data-deleteaccount>Delete my data from the cloud</button></div>`
      : `<p><b>Not signed in.</b> Your data is kept only in this browser. Sign in with Google to save it to your account and use it on other devices.</p><div class="actions"><button class="btn primary" data-signin>Sign in with Google</button></div>`}
    <p class="small muted" style="margin-top:12px">Healthspan Tracker doesn’t sell or share your data and has no ads or tracking. Signed-in data is stored in Google Firebase, locked so only your account can read or write it. Not medical advice.</p>
    <p class="small muted">Optional: download a copy to keep somewhere else, or restore one.</p>
    <div class="actions"><button class="btn" data-export>Download a copy (.json)</button>
    <label class="btn" style="display:inline-block">Restore a copy<input id="importfile" type="file" accept=".json,application/json" hidden></label></div>
  </div></div>
  <h2>Start over</h2>
  <div class="card"><div class="card-b">
    <p class="small">Erase all your results, visits and notes and start with an empty tracker.</p>
    <button class="btn danger" data-reset>Erase everything</button>
  </div></div>`;
}

/* ---------- modals ---------- */
const modal = $('#modal');
function open(html) { $('#modal-body').innerHTML = html; if (!modal.open) modal.showModal(); }
function close() { modal.close(); }
const head = (title, sub) => `<div class="m-h"><div><h2 style="margin:0">${title}</h2>${sub ? `<div class="muted small">${sub}</div>` : ''}</div><button class="x" data-close aria-label="Close">×</button></div>`;

function chart(t, rs) {
  const pts = rs.map(r => ({ d: r.date, v: num(r.value), raw: r.value })).filter(p => p.v != null);
  if (!pts.length) return '<p class="muted small">No results yet.</p>';
  const W = 640, H = 200, L = 44, R = 16, T = 14, B = 28;
  const vals = pts.map(p => p.v).concat([t.low, t.high].filter(v => v != null));
  let mn = Math.min(...vals), mx = Math.max(...vals); const padv = (mx - mn) * .15 || Math.abs(mx) * .2 || 1; mn -= padv; mx += padv;
  const t0 = toDate(pts[0].d).getTime(), t1 = toDate(pts.at(-1).d).getTime(), sp = t1 - t0 || 1;
  const X = d => pts.length === 1 ? (L + W - R) / 2 : L + (toDate(d).getTime() - t0) / sp * (W - L - R);
  const Y = v => T + (mx - v) / (mx - mn) * (H - T - B);
  const ticks = [0, .25, .5, .75, 1].map(f => mn + (mx - mn) * f);
  const dec = Math.abs(mx - mn) < 5 ? 2 : Math.abs(mx - mn) < 50 ? 1 : 0;
  const bandTop = Y(t.high != null ? t.high : mx), bandBot = Y(t.low != null ? t.low : mn);
  const chg = typeof changesFor === 'function' ? changesFor(t) : [];
  const inRange = chg.filter(c => pts.length > 1 && c.date >= pts[0].d && c.date <= pts.at(-1).d);
  const marks = inRange.map((c, i) => `<line x1="${X(c.date)}" x2="${X(c.date)}" y1="${T}" y2="${H - B}" stroke="var(--info)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <text x="${X(c.date) + 4}" y="${T + 10 + i * 13}" style="fill:var(--info);font-weight:600">${esc(c.title.length > 28 ? c.title.slice(0, 27) + '…' : c.title)}</text>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t.name)} over time">${marks}
    ${t.low != null || t.high != null ? `<rect class="band" x="${L}" width="${W - L - R}" y="${bandTop}" height="${Math.max(0, bandBot - bandTop)}"/>` : ''}
    ${ticks.map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(dec)}</text>`).join('')}
    <polyline class="line" points="${pts.map(p => `${X(p.d)},${Y(p.v)}`).join(' ')}"/>
    ${pts.map(p => { const f = flag(t, p.raw); return `<circle cx="${X(p.d)}" cy="${Y(p.v)}" r="4.5" fill="${f === 'ok' ? 'var(--ok)' : f === 'none' ? 'var(--accent)' : 'var(--bad)'}"><title>${fmt(p.d)}: ${esc(p.raw)} ${esc(t.unit)}</title></circle>
      <text x="${X(p.d)}" y="${H - 8}" text-anchor="${pts.length === 1 ? 'middle' : p === pts[0] ? 'start' : p === pts.at(-1) ? 'end' : 'middle'}">${fmtShort(p.d)}</text>`; }).join('')}
  </svg>${t.low != null || t.high != null ? '<div class="small muted">Shaded area = your target range' + (inRange.length ? ' · dashed purple line = a change you made' : '') + '</div>' : ''}
  ${chg.length ? `<div class="changes"><b class="small">Changes that may affect this result</b>${chg.map(c => `<div class="small"><span class="muted">${fmt(c.date)}</span> · ${esc(c.title)}${c.detail ? ` — <span class="muted">${esc(c.detail)}</span>` : ''}</div>`).join('')}</div>` : ''}`;
}

function openTest(id, kind = 'blood') {
  const t = id ? testById(id) : { id: '', kind, name: '', unit: '', description: '', optimalText: '', low: null, high: null, panel: 'Other', orderFrom: '', frequencyMonths: 12, oneTime: false, nextDue: null, notes: '' };
  const rs = id ? resultsFor(id) : [], s = id ? schedule(t) : null;
  const panels = [...new Set(db.tests.filter(x => kindOf(x) === kindOf(t)).map(x => x.panel))];
  open(`${head(id ? esc(t.name) : 'New test', id ? `${esc(t.panel)}${t.orderFrom ? ' · Order from ' + esc(t.orderFrom) : ''}` : '')}
  <div class="m-b">
    ${id ? `<p>${esc(t.description)}</p>
    <p class="small">${t.kind === 'metric' ? '' : chip(s) + ' ' + esc(s.label) + ' · '}Your target: <b>${esc(t.optimalText || '—')}</b>${t.labText ? ` · Lab normal range: <b>${esc(t.labText)}</b>` : ''}${t.notes ? `<br><span class="muted">Note: ${esc(t.notes)}</span>` : ''}</p>
    ${chart(t, rs)}
    <h3>History</h3>
    ${rs.length ? `<ul class="list">${[...rs].reverse().map(r => { const f = flag(t, r.value); return `<li class="row"><div class="main"><span class="title v-${f}">${esc(r.value)} ${esc(t.unit)}</span> <span class="meta">· ${fmt(r.date)}${r.note ? ' · ' + esc(r.note) : ''}</span></div><span class="chip ${f}">${FLAG_LABEL[f]}</span><button class="btn link danger" data-delresult="${t.id}|${r.date}">Delete</button></li>`; }).join('')}</ul>` : '<p class="muted small">No results yet.</p>'}
    <form id="addone" class="toolbar"><input type="date" name="date" value="${today()}" required><input name="value" placeholder="Value${t.unit ? ' (' + esc(t.unit) + ')' : ''}" required style="width:160px"><button class="btn primary">Add result</button></form>` : ''}
    <h3>${id ? 'Settings' : 'Details'}</h3>
    <form id="testform" class="grid2">
      <label class="f">Name<input name="name" value="${esc(t.name)}" required></label>
      <label class="f">Unit<input name="unit" value="${esc(t.unit)}"></label>
      <label class="f">Panel<input name="panel" list="panels" value="${esc(t.panel)}"><datalist id="panels">${panels.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="f">Order from<input name="orderFrom" list="srcs" value="${esc(t.orderFrom)}"><datalist id="srcs"><option value="UW"><option value="Ulta Labs"></datalist></label>
      <label class="f">Optimal range (text)<input name="optimalText" value="${esc(t.optimalText)}"></label>
      <label class="f">Flag below<input name="low" type="number" step="any" value="${t.low ?? ''}"></label>
      <label class="f">Flag above<input name="high" type="number" step="any" value="${t.high ?? ''}"></label>
      <label class="f">Repeat every (months)<input name="frequencyMonths" type="number" min="1" value="${t.frequencyMonths ?? ''}" placeholder="No repeat"></label>
      <label class="f">Next due (override)<input name="nextDue" type="date" value="${t.nextDue || ''}"></label>
      <label class="check small" style="align-self:end"><input name="oneTime" type="checkbox" ${t.oneTime ? 'checked' : ''}> One-time test (no repeats)</label>
      <label class="f" style="grid-column:1/-1">What this tells us<textarea name="description">${esc(t.description)}</textarea></label>
      <label class="f" style="grid-column:1/-1">Notes<textarea name="notes">${esc(t.notes)}</textarea></label>
      <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button>${id ? `<button type="button" class="btn danger" data-deltest="${t.id}">Delete test</button>` : ''}</div>
    </form>
  </div>`);
  $('#addone')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    upsertResult(t.id, f.get('date'), f.get('value').trim()); t.nextDue = null;
    save('Result added'); openTest(t.id);
  });
  $('#testform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    const nOrNull = k => f.get(k) === '' ? null : Number(f.get(k));
    Object.assign(t, { name: f.get('name').trim(), unit: f.get('unit').trim(), panel: f.get('panel').trim() || 'Other',
      orderFrom: f.get('orderFrom').trim(), optimalText: f.get('optimalText').trim(), low: nOrNull('low'), high: nOrNull('high'),
      frequencyMonths: nOrNull('frequencyMonths'), nextDue: f.get('nextDue') || null, oneTime: f.get('oneTime') === 'on',
      description: f.get('description').trim(), notes: f.get('notes').trim() });
    if (!id) { t.id = uniqueId(t.name, db.tests); db.tests.push(t); }
    save('Saved'); openTest(t.id);
  });
}
function uniqueId(name, arr) { let b = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item', id = b, n = 2; while (arr.some(x => x.id === id)) id = `${b}-${n++}`; return id; }
function upsertResult(testId, date, value) {
  db.results = db.results.filter(r => !(r.testId === testId && r.date === date));
  if (value !== '') db.results.push({ testId, date, value });
}

function openResults(src, date, kind = 'blood') {
  const editing = !!date; date ||= today();
  const ds = draws(kind), d = ds.find(x => x.date === date);
  const tests = db.tests.filter(t => kindOf(t) === kind).filter(t => src === 'all' || (t.orderFrom || 'Bloodwork') === src || editing);
  const panels = [...new Set(tests.map(t => t.panel))];
  open(`${head(editing ? 'Lab results · ' + fmt(date) : 'Log lab results', src !== 'all' && !editing ? (src.startsWith('Other') ? esc(src) : 'Order from ' + esc(src)) : 'Leave blank anything that wasn’t tested')}
  <form id="resform" class="m-b">
    <div class="grid2" style="margin-top:12px"><label class="f">Date of blood draw<input type="date" name="__date" value="${date}" required ${editing ? 'readonly' : ''}></label></div>
    ${kind === 'blood' ? `<label class="f" style="margin-top:12px">Notes (fasting, diet changes, supplements…)<textarea name="__note">${esc(d?.note || '')}</textarea></label>` : ''}
    ${panels.map(p => `<h3>${esc(p)}</h3>${tests.filter(t => t.panel === p).map(t => {
      const cur = db.results.find(r => r.testId === t.id && r.date === date), prev = resultsFor(t.id).filter(r => r.date < date).at(-1);
      return `<div class="entry"><div><div>${esc(t.name)} <span class="u">${esc(t.unit)}</span></div><div class="u">Optimal ${esc(t.optimalText || '—')}${prev ? ` · last ${esc(prev.value)}` : ''}</div></div>
      <input name="${t.id}" value="${esc(cur?.value || '')}" inputmode="decimal" aria-label="${esc(t.name)}"></div>`;
    }).join('')}`).join('')}
    <div class="actions" style="margin-top:18px"><button class="btn primary">Save results</button><button type="button" class="btn" data-close>Cancel</button></div>
  </form>`);
  $('#resform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target), dt = f.get('__date'); let n = 0;
    tests.forEach(t => {
      const v = (f.get(t.id) || '').trim(), had = db.results.some(r => r.testId === t.id && r.date === dt);
      if (v || had) { upsertResult(t.id, dt, v); if (v) { n++; t.nextDue = null; } }
    });
    db.draws ||= [];
    const ex = db.draws.find(x => x.date === dt), note = (f.get('__note') || '').trim();
    if (kind !== 'blood') { /* metrics: no draw notes */ } else if (ex) ex.note = note; else if (note || n) db.draws.push({ id: 'draw-' + dt, date: dt, note });
    close(); save(`Saved ${n} result${n === 1 ? '' : 's'} for ${fmt(dt)}`);
  });
}

function openProc(id, focusLog) {
  const p = id ? procById(id) : { id: '', kind: 'checkup', name: '', description: '', frequencyMonths: 12, nextDue: null, provider: '', notes: '' };
  const vs = id ? visitsFor(id).reverse() : [], s = id ? schedule(p) : null;
  open(`${head(id ? esc(p.name) : 'New appointment type', id ? ((KIND_INFO[p.kind] || [])[0] || 'Routine checkup') : '')}
  <div class="m-b">
    ${id ? `<p class="purpose"><b>What it’s for:</b> ${esc(purposeOf(p))}</p>${p.purpose && p.description ? `<p class="small muted">${esc(p.description)}</p>` : ''}<p class="small">${chip(s)} ${esc(s.label)}${p.rawNext ? ` <span class="muted">· Spreadsheet said: “${esc(p.rawNext.replace(/\s+/g, ' '))}”</span>` : ''}</p>
    ${['checkup', 'womens', 'screening'].includes(p.kind) ? `<div class="actions"><button class="btn" data-visitsheet="${p.id}">Prepare visit sheet</button></div>` : ''}
    <h3 id="logh">Log a visit</h3>
    <form id="visitform" class="grid2">
      <label class="f">Date<input type="date" name="date" value="${today()}" required></label>
      <label class="f">Next visit (leave blank to use repeat interval)<input type="date" name="next"></label>
      <label class="f" style="grid-column:1/-1">Result / interpretation<textarea name="result" placeholder="What did they find?"></textarea></label>
      ${(() => { const b = db.procedures.filter(x => x.bundleWith === p.id); return b.length ? `<div style="grid-column:1/-1"><div class="small muted">Also done at this visit:</div>${b.map(x => `<label class="check small"><input type="checkbox" name="bundle" value="${x.id}" checked> ${esc(x.name)}</label>`).join('')}</div>` : ''; })()}
      <div class="actions" style="grid-column:1/-1"><button class="btn primary">Log visit</button></div>
    </form>
    <h3>History</h3>
    ${vs.length ? `<ul class="list">${vs.map(v => `<li class="row"><div class="main"><div class="title">${fmt(v.date)}</div><div class="meta" style="white-space:pre-line">${esc(v.result || '')}</div></div><button class="btn link danger" data-delvisit="${esc(v.id)}">Delete</button></li>`).join('')}</ul>` : '<p class="muted small">No visits logged yet.</p>'}` : ''}
    <h3>Settings</h3>
    <form id="procform" class="grid2">
      <label class="f">Name<input name="name" value="${esc(p.name)}" required></label>
      <label class="f">Type<select name="kind"><option value="imaging" ${p.kind === 'imaging' ? 'selected' : ''}>Imaging</option><option value="fitness" ${p.kind === 'fitness' ? 'selected' : ''}>Fitness test</option><option value="checkup" ${p.kind === 'checkup' ? 'selected' : ''}>Routine checkup</option><option value="womens" ${p.kind === 'womens' ? 'selected' : ''}>Women’s health</option><option value="mens" ${p.kind === 'mens' ? 'selected' : ''}>Men’s health</option><option value="screening" ${p.kind === 'screening' ? 'selected' : ''}>Preventive screening</option><option value="vaccine" ${p.kind === 'vaccine' ? 'selected' : ''}>Vaccine</option></select></label>
      <label class="f">Start at age<input name="startAge" type="number" min="0" value="${p.startAge ?? ''}" placeholder="Any age"></label>
      <label class="f">Stop after age<input name="endAge" type="number" min="0" value="${p.endAge ?? ''}" placeholder="No limit"></label>
      <label class="check small" style="align-self:end"><input name="oneTime" type="checkbox" ${p.oneTime ? 'checked' : ''}> One-time (no repeats)</label>
      <label class="f">Repeat every (months)<input name="frequencyMonths" type="number" min="1" value="${p.frequencyMonths ?? ''}" placeholder="No repeat"></label>
      <label class="f">Next due<input name="nextDue" type="date" value="${p.nextDue || ''}"></label>
      <label class="f">Provider<input name="provider" value="${esc(p.provider)}"></label>
      <label class="check small" style="align-self:end"><input name="asNeeded" type="checkbox" ${p.asNeeded ? 'checked' : ''}> As needed (no repeat reminders)</label>
      <label class="f" style="grid-column:1/-1">What it’s for (one line)<input name="purpose" value="${esc(p.purpose || '')}"></label>
      <label class="f" style="grid-column:1/-1">Details<textarea name="description">${esc(p.description)}</textarea></label>
      <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button>${id ? `<button type="button" class="btn danger" data-delproc="${p.id}">Delete</button>` : ''}</div>
    </form>
  </div>`);
  if (focusLog) setTimeout(() => $('#visitform [name=result]')?.focus(), 50);
  $('#visitform')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target), date = f.get('date');
    db.visits.push({ id: `${p.id}-${date}-${Date.now() % 1e5}`, procId: p.id, date, result: f.get('result').trim() });
    p.nextDue = f.get('next') || null;
    f.getAll('bundle').forEach(bid => { const b = procById(bid); if (!b) return; db.visits.push({ id: `${bid}-${date}-${Date.now() % 1e5}`, procId: bid, date, result: `Done at ${p.name}` }); if (b.nextDue && b.nextDue <= date) b.nextDue = null; });
    save('Visit logged'); openProc(p.id);
  });
  $('#procform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    Object.assign(p, { name: f.get('name').trim(), kind: f.get('kind'), frequencyMonths: f.get('frequencyMonths') ? Number(f.get('frequencyMonths')) : null,
      nextDue: f.get('nextDue') || null, asNeeded: f.get('asNeeded') === 'on', provider: f.get('provider').trim(), description: f.get('description').trim(),
      purpose: f.get('purpose').trim(), oneTime: f.get('oneTime') === 'on',
      startAge: f.get('startAge') === '' ? null : Number(f.get('startAge')), endAge: f.get('endAge') === '' ? null : Number(f.get('endAge')) });
    if (!id) { p.id = uniqueId(p.name, db.procedures); db.procedures.push(p); }
    save('Saved'); openProc(p.id);
  });
}

/* ---------- reminders: calendar + notifications ---------- */
function icsText() {
  const T = today(), stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const e = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const d8 = s => s.replace(/-/g, '');
  const events = [];
  const ev = (uid, date, summary, desc) => {
    const on = date < T ? T : date, end = iso(new Date(toDate(on).getTime() + 864e5 + 36e5));
    events.push(['BEGIN:VEVENT', `UID:${uid}-${d8(on)}@health-tracker`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(on)}`, `DTEND;VALUE=DATE:${d8(end.slice(0, 10))}`,
      `SUMMARY:${e(summary)}`, `DESCRIPTION:${e(desc)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(summary)} in 1 week`, 'TRIGGER:-P7D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${e(summary)} today`, 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  };
  myProcs().forEach(p => { const s = schedule(p); if (s.due) ev(p.id, s.due, `${short(p.name)}${s.state === 'overdue' ? ' (overdue)' : ''}`, `${p.name}\n${s.label}${p.provider ? '\nProvider: ' + p.provider : ''}\n${freqText(p.frequencyMonths)}`); });
  const groups = {};
  db.tests.forEach(t => { const s = schedule(t); if (!s.due) return; const on = s.due < T ? T : s.due; (groups[`${t.orderFrom || 'Other'}|${on}`] ||= []).push([t, s]); });
  Object.entries(groups).forEach(([k, xs]) => {
    const [src, on] = k.split('|');
    ev(`blood-${src.toLowerCase().replace(/\W+/g, '')}`, on, `Bloodwork due${src !== 'Other' ? ' (order from ' + src + ')' : ''}: ${xs.length} test${xs.length === 1 ? '' : 's'}`,
      xs.map(([t, s]) => `• ${t.name} — ${s.state === 'never' ? 'never tested' : s.state === 'overdue' ? 'overdue since ' + fmt(s.due) : 'due ' + fmt(s.due)}`).join('\n'));
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Health Tracker//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Health tests', ...events, 'END:VCALENDAR'].join('\r\n');
}
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function notifyIfDue() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || db.settings.lastNotified === today()) return;
  const items = allItems(), od = items.filter(x => x.s.state === 'overdue'), soon = items.filter(x => x.s.state === 'soon');
  if (!od.length && !soon.length) return;
  new Notification('Health Tracker', { body: [od.length && `${od.length} overdue: ${od.slice(0, 3).map(x => short(x.i.name)).join(', ')}${od.length > 3 ? '…' : ''}`, soon.length && `${soon.length} due soon`].filter(Boolean).join(' · ') });
  db.settings.lastNotified = today(); persist();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-view],[data-go],[data-test],[data-proc],[data-logvisit],[data-addresults],[data-editdraw],[data-copy],[data-copylist],[data-close],[data-delresult],[data-deltest],[data-delvisit],[data-delproc],[data-newtest],[data-newproc],[data-ics],[data-export],[data-reset],[data-notify],[data-draw],[data-scanlog],[data-rview],[data-pastdates],[data-scanconfirm],[data-med],[data-event],[data-delfam],[data-delmed],[data-delevent],[data-visitsheet],[data-printsheet],[data-labimport],[data-signin],[data-signout],[data-acctmenu],[data-deleteaccount]');
  if (!el) { if (e.target === modal) close(); return; }
  const D = el.dataset;
  if (D.view || D.go) { e.preventDefault(); view = D.view || D.go; close(); render(); scrollTo(0, 0); }
  else if (D.pastdates !== undefined) openPastDates();
  else if (D.med) openMed(D.med);
  else if (D.event) openEvent(D.event);
  else if (D.delfam) { if (confirm('Remove this family history entry?')) { db.family = db.family.filter(f => f.id !== D.delfam); save('Removed'); } }
  else if (D.delmed) { if (confirm('Delete this item?')) { db.meds = db.meds.filter(m => m.id !== D.delmed); close(); save('Deleted'); } }
  else if (D.delevent) { if (confirm('Delete this change?')) { db.events = db.events.filter(x => x.id !== D.delevent); close(); save('Deleted'); } }
  else if (D.visitsheet) openVisitSheet(D.visitsheet);
  else if (D.printsheet !== undefined) printSheet();
  else if (D.labimport !== undefined) openLabImport();
  else if (D.signin !== undefined) { if (!window.cloud) toast('Sign-in isn’t available right now — check your connection'); else window.cloud.signIn().catch(err => { console.error('Sign-in error', err); signInError(err); }); }
  else if (D.signout !== undefined || D.acctmenu !== undefined) { if (confirm(`Sign out of ${cloudSync.user?.email || 'your account'}? Your data stays saved in your account and is removed from this browser.`)) window.cloud.signOut(); }
  else if (D.deleteaccount !== undefined) { if (confirm('Permanently delete all your data from the cloud and sign out? This can’t be undone.')) window.cloud.remove().then(() => window.cloud.signOut()).then(() => toast('Your cloud data was deleted')).catch(() => toast('Couldn’t delete — try again')); }
  else if (D.scanconfirm) { const [pid, ans] = D.scanconfirm.split('|'); confirmScan(pid, ans === 'yes'); }
  else if (D.scanlog) openScanLog(D.scanlog);
  else if (D.rview) { db.settings.resultView = D.rview; save(); }
  else if (D.logvisit) openProc(D.logvisit, true);
  else if (D.proc) openProc(D.proc);
  else if (D.test) openTest(D.test);
  else if (D.newtest !== undefined) openTest(null, D.newtest || 'blood');
  else if (D.newproc !== undefined) openProc(null);
  else if (D.addresults) openResults(D.addresults, null, D.kind || 'blood');
  else if (D.editdraw) openResults('all', D.editdraw);
  else if (D.draw) openResults('all', D.draw, D.kind || 'blood');
  else if (D.close !== undefined) close();
  else if (D.copy) {
    const xs = db.tests.filter(t => (t.orderFrom || 'Bloodwork') === D.copy).map(t => [t, schedule(t)]).filter(([, s]) => ['overdue', 'never', 'soon'].includes(s.state));
    copy(xs.map(([t]) => t.name).join('\n'), `Copied ${xs.length} tests`);
  } else if (D.copylist) { const ol = db.orderLists.find(o => o.id === D.copylist); copy(`${ol.title}\n` + ol.items.map(i => i.label).join('\n'), 'List copied'); }
  else if (D.delresult) { const [id, date] = D.delresult.split('|'); if (confirm(`Delete the ${fmt(date)} result?`)) { upsertResult(id, date, ''); save('Deleted'); openTest(id); } }
  else if (D.deltest) { if (confirm('Delete this test and all its results?')) { db.tests = db.tests.filter(t => t.id !== D.deltest); db.results = db.results.filter(r => r.testId !== D.deltest); close(); save('Test deleted'); } }
  else if (D.delvisit) { const v = db.visits.find(x => x.id === D.delvisit); if (confirm('Delete this visit?')) { db.visits = db.visits.filter(x => x !== v); save('Deleted'); openProc(v.procId); } }
  else if (D.delproc) { if (confirm('Delete this item and its history?')) { db.procedures = db.procedures.filter(p => p.id !== D.delproc); db.visits = db.visits.filter(v => v.procId !== D.delproc); close(); save('Deleted'); } }
  else if (D.ics !== undefined) { download('health-reminders.ics', icsText(), 'text/calendar'); toast('Calendar file downloaded — open it to add the reminders'); }
  else if (D.export !== undefined) { db.settings.lastBackup = today(); download(`health-tracker-backup-${today()}.json`, JSON.stringify(db, null, 1), 'application/json'); save('Backup exported'); }
  else if (D.reset !== undefined) { if (confirm('Erase all your results, visits and notes? This can’t be undone.')) { const keep = { dob: db.settings.dob, sex: db.settings.sex, owner: db.settings.owner }; db = fresh(); Object.assign(db.settings, keep); save('Started over'); } }
  else if (D.notify !== undefined) { Notification.requestPermission().then(() => { render(); notifyIfDue(); }); }
});
function copy(text, msg) { navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast('Copy failed')); }
document.addEventListener('submit', e => { if (typeof myInfoSubmit === 'function') myInfoSubmit(e); });
document.addEventListener('input', e => {
  if (e.target.id === 'bq') { bloodFilter.q = e.target.value; const pos = e.target.selectionStart; render(); const q = $('#bq'); q.focus(); q.setSelectionRange(pos, pos); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'bsrc') { bloodFilter.src = e.target.value; render(); }
  if (e.target.id === 'bpurpose') { db.settings.hidePurpose = !e.target.checked; save(); }
  if (e.target.id === 'sex') { db.settings.sex = e.target.value || null; applyAgeNorms(db); save('Saved'); }
  if (e.target.id === 'dob') { db.settings.dob = e.target.value || null; applyAgeNorms(db); save('Birth date saved'); }
  if (e.target.id === 'bflag') { bloodFilter.flagged = e.target.checked; render(); }
  if (e.target.id === 'soon') { db.settings.soonDays = Math.max(7, Number(e.target.value) || 60); save('Updated'); }
  if (e.target.id === 'importfile') {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(txt => { const d = JSON.parse(txt); if (!d.tests || !d.results) throw new Error(); if (confirm('Replace current data with this backup?')) { db = d; db.settings ||= { soonDays: 60 }; save('Backup imported'); } })
      .catch(() => toast('That file isn’t a Health Tracker backup'));
  }
});

render();
updateSyncBadge();
notifyIfDue();
setInterval(notifyIfDue, 36e5);
// pick up changes made on another device
document.addEventListener('visibilitychange', () => { if (!document.hidden && cloudSync.user && !cloudSync.pending) syncFromCloud(false); });
