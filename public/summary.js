/* Health summary tab: the most important results at a glance. Loaded after app.js. */
'use strict';
const SUMMARY_GROUPS = [
  { title: 'Heart & arteries', why: 'The biggest long-term risk for most people.', ids: ['ldl-nih', 'apob', 'lp-a', 'hs-crp', 'hdl', 'triglycerides'], scans: ['cimt', 'coronary-calcium-scan'] },
  { title: 'Blood sugar & metabolism', why: 'Early warning for diabetes and metabolic problems.', ids: ['hemoglobin-a1c', 'fasting-insulin', 'glucose', 'tsh'] },
  { title: 'Body composition & bone', why: 'Fat, muscle and bone — key to healthy aging.', ids: ['dexa-body-fat-pct', 'dexa-visceral-fat', 'dexa-almi', 'dexa-t-score'] },
  { title: 'Fitness', why: 'Cardio fitness is one of the strongest predictors of lifespan.', ids: ['fitness-age', 'vo2-max', 'resting-hr', 'bio-age'] },
  { title: 'Liver, kidney & nutrients', why: 'Organ function and the nutrients your body runs on.', ids: ['alt', 'egfr', 'vitamin-d-total', 'ferritin', 'vitamin-b12'] },
];
const TILE_PURPOSE = {
  'ldl-nih': 'Main “bad” cholesterol', 'apob': 'Count of artery-clogging particles', 'lp-a': 'Inherited heart risk (test once)',
  'hs-crp': 'Inflammation in blood vessels', 'hdl': '“Good” cholesterol', 'triglycerides': 'Blood fats from sugar and carbs',
  'hemoglobin-a1c': '3-month average blood sugar', 'fasting-insulin': 'How hard your body works to control sugar', 'glucose': 'Blood sugar right now',
  'tsh': 'Thyroid function', 'dexa-body-fat-pct': 'Share of your weight that is fat', 'dexa-visceral-fat': 'Risky fat around the organs',
  'dexa-almi': 'Arm and leg muscle for your height', 'dexa-t-score': 'Bone density vs. young adults', 'vo2-max': 'Cardio fitness (“engine size”)',
  'resting-hr': 'Heart efficiency at rest', 'vo2-redline': 'How much of your fitness you can sustain', 'bio-age': 'Estimated age from fitness and body',
  'alt': 'Liver health', 'egfr': 'Kidney filtering', 'vitamin-d-total': 'Bones, immunity and hormones', 'ferritin': 'Iron stores', 'vitamin-b12': 'Nerves and red blood cells',
};
const FLAG_TONE = { ok: 'ok', high: 'bad', low: 'bad', none: 'none' };
const FLAG_WORD = { ok: 'In range', high: 'Above target', low: 'Below target', none: 'Recorded' };

function tile(id) {
  if (id === 'fitness-age') {
    const F = typeof fitnessAge === 'function' && fitnessAge(); if (!F) return '';
    const tone = F.diff <= 0 ? 'ok' : 'bad';
    return `<button class="tile ${tone}" data-go="body"><div class="t-top"><span class="t-name">Fitness age</span><span class="dot ${tone}"></span></div>
      <div class="t-val">${F.fa} <small>vs. age ${F.age}</small></div>
      <div class="t-meta"><span class="t-flag ${tone}">${F.diff === 0 ? 'Same as your age' : Math.abs(F.diff) + ' years ' + (F.diff < 0 ? 'younger' : 'older')}</span></div>
      <div class="t-why">Age of a typical ${F.sex === 'female' ? 'woman' : 'man'} with your VO₂ max</div><div class="t-date">From VO₂ max on ${fmt(F.date)}</div></button>`;
  }
  const t = testById(id); if (!t) return '';
  const rs = resultsFor(id), r = rs.at(-1), p = rs.at(-2);
  if (!r) return `<button class="tile none" data-test="${id}"><div class="t-name">${esc(short(t.name))}</div>
    <div class="t-val muted">Not tested yet</div><div class="t-why">${esc(TILE_PURPOSE[id] || t.description)}</div></button>`;
  const f = flag(t, r.value), stale = days(r.date, today()) > 400;
  const v = num(r.value), pv = p ? num(p.value) : null;
  const trend = v != null && pv != null && v !== pv ? `<span class="t-trend">${v > pv ? '▲' : '▼'} from ${esc(showVal(t, p.value))}</span>` : '';
  return `<button class="tile ${FLAG_TONE[f]}" data-test="${id}">
    <div class="t-top"><span class="t-name">${esc(short(t.name))}</span><span class="dot ${FLAG_TONE[f]}" title="${FLAG_WORD[f]}"></span></div>
    <div class="t-val">${esc(showVal(t, r.value))} <small>${esc(showUnit(t))}</small></div>
    <div class="t-meta"><span class="t-flag ${FLAG_TONE[f]}">${FLAG_WORD[f]}</span>${trend}</div>
    <div class="t-why">${esc(TILE_PURPOSE[id] || t.description)}</div>
    <div class="t-date ${stale ? 'stale' : ''}">${fmt(r.date)}${stale ? ' · over a year old' : ''}${targetText(t) ? ` · target ${esc(targetText(t))}` : ''}</div></button>`;
}

/* ---------- insights: what's going well, what needs work ---------- */
const AREAS = [
  { key: 'heart', icon: '❤️', title: 'Heart & arteries', ids: ['ldl-nih', 'apob', 'lp-a', 'hs-crp', 'hdl', 'triglycerides', 'non-hdl', 'home-bp-sys', 'home-bp-dia'], scans: ['cimt', 'coronary-calcium-scan', 'coronary-ct-angiogram'], go: 'blood' },
  { key: 'sugar', icon: '🍬', title: 'Blood sugar', ids: ['hemoglobin-a1c', 'fasting-insulin', 'glucose'], go: 'blood' },
  { key: 'body', icon: '💪', title: 'Body composition', ids: ['dexa-body-fat-pct', 'dexa-visceral-fat', 'dexa-almi', 'dexa-ag-ratio'], go: 'body' },
  { key: 'bone', icon: '🦴', title: 'Bones', ids: ['dexa-t-score', 'dexa-z-score'], go: 'body' },
  { key: 'fit', icon: '🏃', title: 'Fitness', ids: ['vo2-max', 'resting-hr', 'home-rhr'], fitness: true, go: 'body' },
  { key: 'organs', icon: '🧪', title: 'Organs & nutrients', ids: ['alt', 'ast', 'egfr', 'tsh', 'vitamin-d-total', 'ferritin', 'vitamin-b12', 'folate'], go: 'blood' },
  { key: 'care', icon: '🩺', title: 'Checkups & scans', care: true, scans: ['full-body-mri'], go: 'reminders' },
];
/** Which area a tracked test belongs to, so every result counts (not just the headline ones above). */
function areaOf(t) {
  const listed = AREAS.find(a => (a.ids || []).includes(t.id)); if (listed) return listed.key;
  if (t.groupWith || t.kind === 'scan') return null;            // grouped duplicates and scan details are counted elsewhere
  const panel = t.panel || '', id = t.id;
  if (t.kind === 'metric') {
    if (/bone/i.test(panel) || /bmd|bmc|t-score|z-score/.test(id)) return 'bone';
    if (/bp-|blood-pressure/.test(id)) return 'heart';
    if (/fitness|metabolism|vo2/i.test(panel) || /rhr|hrv|vo2|grip|steps/.test(id)) return 'fit';
    return 'body';
  }
  if (/screening/i.test(panel)) return null;                     // one-time screenings belong with checkups
  if (/lipid|cardio|inflammation/i.test(panel)) return 'heart';
  if (/glucose|insulin|a1c/.test(id)) return 'sugar';
  return 'organs';
}
/** All tests in an area: the headline ones plus any other tracked test that belongs there. */
const areaIds = a => a.care ? [] : [...new Set([...(a.ids || []), ...db.tests.filter(t => areaOf(t) === a.key).map(t => t.id)])];
// How much each result matters when ranking what to work on (heart and blood sugar first).
const WEIGHT = { 'ldl-nih': 3, 'apob': 3, 'lp-a': 3, 'hs-crp': 2.5, 'non-hdl': 2.5, 'hemoglobin-a1c': 3, 'fasting-insulin': 2.5, 'glucose': 2.5,
  'dexa-visceral-fat': 2.5, 'dexa-body-fat-pct': 2, 'vo2-max': 2.5, 'resting-hr': 1.5, 'home-rhr': 1.5, 'home-bp-sys': 2.5, 'home-bp-dia': 2, 'vitamin-d-total': 2, 'dexa-t-score': 2, 'hdl': 2, 'triglycerides': 2 };
// Friendly words for a result that's on target.
const WIN_COPY = {
  'hemoglobin-a1c': ['🍬', 'Blood sugar control is excellent'], 'lp-a': ['🧬', 'Low inherited heart risk'], 'hs-crp': ['🔥', 'Low inflammation'],
  'apob': ['❤️', 'Few artery-clogging particles'], 'hdl': ['❤️', 'Healthy “good” cholesterol'], 'triglycerides': ['🥑', 'Healthy blood fats'],
  'ldl-nih': ['❤️', 'LDL cholesterol on target'], 'fasting-insulin': ['⚡', 'Insulin is low — your body handles sugar easily'], 'glucose': ['🍬', 'Healthy fasting blood sugar'],
  'dexa-t-score': ['🦴', 'Strong bones'], 'dexa-almi': ['💪', 'Good muscle for your size'], 'dexa-ag-ratio': ['🍐', 'Healthy fat distribution'],
  'vo2-max': ['🏃', 'Good cardio fitness'], 'egfr': ['🫘', 'Kidneys working well'], 'alt': ['🧪', 'Healthy liver'], 'ferritin': ['🩸', 'Healthy iron stores'],
  'vitamin-b12': ['🥦', 'B12 on target'], 'home-bp-sys': ['🩺', 'Healthy blood pressure'], 'resting-hr': ['💓', 'Healthy resting heart rate'], 'home-rhr': ['💓', 'Healthy resting heart rate'], 'tsh': ['🦋', 'Thyroid in range'], 'dexa-visceral-fat': ['🎯', 'Low visceral fat'], 'dexa-body-fat-pct': ['💪', 'Body fat on target'],
};
const RECENT_DAYS = 730;   // results older than 2 years don't count as current wins or problems
// The same measurement recorded two ways (e.g. resting heart rate from a fitness test and from home):
// only the newest reading counts, so a better recent reading replaces an older one.
const SAME_MEASURE = [['resting-hr', 'home-rhr']];
const lastDate = id => resultsFor(id).at(-1)?.date || '';
const supersededBy = id => (SAME_MEASURE.find(g => g.includes(id)) || []).find(o => o !== id && lastDate(o) > lastDate(id)) || null;
const latestOf = id => {
  const t = testById(id); const r = t && resultsFor(id).at(-1);
  if (!t || !r || supersededBy(id)) return null;
  return { t, r, f: flag(t, r.value), age: days(r.date, today()) };
};
/** Distance outside the target, relative to the target's size (0 = in range). */
function offBy(t, v) {
  const n = num(v); if (n == null) return 0;
  if (t.high != null && n > t.high) return (n - t.high) / Math.max(Math.abs(t.high), 0.1);
  if (t.low != null && n < t.low) return (t.low - n) / Math.max(Math.abs(t.low), 0.1);
  return 0;
}
/** Change since the previous result, if it moved toward (or into) the target. */
function improvement(t) {
  const rs = resultsFor(t.id).filter(r => num(r.value) != null); if (rs.length < 2 || (t.low == null && t.high == null)) return null;
  const [p, r] = rs.slice(-2), before = offBy(t, p.value), now = offBy(t, r.value);
  if (before <= 0 || now >= before * 0.85) return null;
  const d = Math.abs(showNum(t, num(r.value)) - showNum(t, num(p.value)));
  return { from: p, to: r, inRange: now === 0, delta: +d.toFixed(d < 10 ? 1 : 0), dir: num(r.value) < num(p.value) ? 'down' : 'up' };
}
/** When to recheck a result, in plain words. */
function nextCheck(t) {
  const id = t.kind === 'blood' ? 'wellness-exam' : /^vo2|resting-hr|rmr|bio-age/.test(t.id) ? 'vo2-max-test' : /^dexa/.test(t.id) ? 'dexa-scan' : null;
  const p = id && procById(id), s = p && schedule(p);
  if (!s) return 'Bring it up at your next checkup';
  const name = short(p.name).split(' ').map(w => /[A-Z].*[A-Z]/.test(w) ? w : w.toLowerCase()).join(' ');   // keep “DEXA”, “VO2”
  if (s.due && s.due >= today()) return `Recheck at your ${name} on ${fmt(s.due)}`;
  if (s.state === 'overdue' && s.last) return `Your ${name} is overdue — book it to recheck`;
  return `Book a ${name} to recheck`;
}
function insights() {
  const T = today(), wins = [], work = [];
  const fa = typeof fitnessAge === 'function' ? fitnessAge() : null;
  if (fa && fa.diff < 0) wins.push({ icon: '🏃', text: `Fitness age ${fa.fa} — ${Math.abs(fa.diff)} years younger than you`, go: 'body', score: 10 });
  // improvements
  db.tests.filter(t => t.kind === 'blood' || t.kind === 'metric').forEach(t => {
    const imp = improvement(t); if (!imp || days(imp.to.date, T) > RECENT_DAYS) return;
    wins.push({ icon: imp.inRange ? '🎉' : '📈', test: t.id, score: 8 + (WEIGHT[t.id] || 1),
      text: `${short(t.name)} ${imp.dir} ${imp.delta}${showUnit(t) && showUnit(t) !== '%' ? ' ' + showUnit(t) : imp.dir && showUnit(t) === '%' ? ' points' : ''} since ${fmt(imp.from.date)}${imp.inRange ? ' — now on target' : ' — moving the right way'}` });
  });
  // on-target highlights
  Object.entries(WIN_COPY).forEach(([id, [icon, text]], i) => {
    const x = latestOf(id); if (!x || x.f !== 'ok' || x.age > RECENT_DAYS || wins.some(w => w.test === id)) return;
    wins.push({ icon, text, test: id, value: `${showVal(x.t, x.r.value)} ${showUnit(x.t)}`.trim(), score: 6 - i * 0.1 + (WEIGHT[id] || 1) * 0.3 });
  });
  if (typeof SCANS !== 'undefined') Object.keys(SCANS).forEach(id => { const st = scanStatus(id); if (st.tone === 'ok') wins.push({ icon: '🩻', text: `${SCANS[id].title.replace(/\s*\(.*\)/, '')}: normal`, go: 'procs', score: 7 }); });
  // needs work: results outside target
  db.tests.filter(t => (t.kind === 'blood' || t.kind === 'metric') && !t.groupWith).forEach(t => {
    const x = latestOf(t.id); if (!x || !['high', 'low'].includes(x.f)) return;
    const stale = x.age > RECENT_DAYS, imp = improvement(t), lf = typeof labFlag === 'function' ? labFlag(t, x.r.value) : null;
    const sev = (WEIGHT[t.id] || 1) * Math.min(1, 0.25 + offBy(t, x.r.value)) * (stale ? 0.6 : 1) * (lf === 'normal' ? 0.8 : 1) * (imp ? 0.85 : 1);
    work.push({ test: t.id, score: sev, icon: x.f === 'high' ? '⬆️' : '⬇️',
      title: `${short(t.name)} is ${x.f === 'high' ? 'above' : 'below'} target`,
      value: `${showVal(t, x.r.value)} ${showUnit(t)}`.trim(), target: targetText(t),
      why: TILE_PURPOSE[t.id] || t.description || '',
      notes: [imp ? `Improving: ${imp.dir} ${imp.delta} since ${fmt(imp.from.date)}` : '', lf === 'normal' ? 'Within the lab’s normal range — your target is stricter' : '', stale ? `Last checked ${fmt(x.r.date)}` : ''].filter(Boolean),
      next: nextCheck(t) });
  });
  if (typeof SCANS !== 'undefined') Object.keys(SCANS).forEach(id => {
    const st = scanStatus(id); if (!['warn', 'bad'].includes(st.tone)) return;
    work.push({ go: 'procs', scan: id, score: st.tone === 'bad' ? 2.8 : 0.75, icon: '🩻', title: `${SCANS[id].title.replace(/\s*\(.*\)/, '')}: ${st.headline.toLowerCase()}`, why: procById(id)?.purpose || '', notes: [st.text], next: `Next scan: ${schedule(procById(id)).label.replace(/^Due /, '')}` });
  });
  // overdue care, as one item
  const items = allItems(), overdue = items.filter(x => x.s.state === 'overdue');
  if (overdue.length) {
    const n = overdue.length, allBlood = overdue.every(x => !isProc(x.i)), s = n === 1 ? '' : 's';
    work.push({ go: 'reminders', score: Math.min(1.5, 1 + n * 0.05), icon: '📅',
      title: allBlood ? `${n} blood test${s} overdue` : `${n} checkup${s} or test${s} overdue`,
      why: overdue.slice(0, 4).map(x => short(x.i.name)).join(', ') + (n > 4 ? '…' : ''), notes: [],
      next: allBlood ? 'Ask for them at your next blood draw' : 'See Reminders to book them' });
  }
  else if (items.some(x => isProc(x.i) && x.s.last)) wins.push({ icon: '✅', text: 'All checkups and tests are up to date', go: 'reminders', score: 5 });
  wins.sort((a, b) => b.score - a.score); work.sort((a, b) => b.score - a.score);
  return { wins, work, overdue, items, fa };
}
function areaStatus(a, ins) {
  if (a.care) {
    const od = ins.overdue.length, known = ins.items.filter(x => isProc(x.i) && x.s.last).length;
    const scanOff = (a.scans || []).filter(id => ['warn', 'bad'].includes(scanStatus(id).tone)).length;
    const parts = [od && `${od} overdue`, scanOff && `${scanOff} scan finding${scanOff === 1 ? '' : 's'}`].filter(Boolean);
    return parts.length ? { tone: 'work', text: parts.join(' · ') } : known ? { tone: 'good', text: 'Up to date' } : { tone: 'none', text: 'Add past dates' };
  }
  const ids = areaIds(a), xs = ids.map(latestOf).filter(Boolean).filter(x => x.f !== 'none');
  const scans = (a.scans || []).map(id => scanStatus(id)).filter(s => s.tone);
  const off = xs.filter(x => ['high', 'low'].includes(x.f)).length + scans.filter(s => ['warn', 'bad'].includes(s.tone)).length;
  const fa = a.fitness && ins.fa;
  if (!xs.length && !scans.length && !fa) return { tone: 'none', text: ids.some(id => resultsFor(id).length) ? 'Results logged' : 'No results yet' };
  if (off) return { tone: 'work', text: `${off} to work on` };
  if (fa && fa.diff > 0) return { tone: 'work', text: `Fitness age ${fa.fa}` };
  const stale = xs.length && xs.every(x => x.age > RECENT_DAYS);
  return stale ? { tone: 'stale', text: 'Due for a recheck' } : { tone: 'good', text: fa ? `Fitness age ${fa.fa}` : 'Looking good' };
}
function scoreRing(pct, tone) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<svg class="ring ${tone}" viewBox="0 0 120 120" role="img" aria-label="${pct}% of your key numbers are on target">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/><circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" text-anchor="middle" class="ring-num">${pct}%</text><text x="60" y="78" text-anchor="middle" class="ring-lbl">on target</text></svg>`;
}

// Area cards open a panel under the grid with that area's items to work on and what's on target.
let areaOpen = null;
document.addEventListener('click', e => {
  const b = e.target.closest('[data-area]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const key = b.dataset.area; areaOpen = areaOpen === key ? null : key;
  document.querySelectorAll('[data-area]').forEach(x => { x.classList.toggle('sel', x.dataset.area === areaOpen); x.setAttribute('aria-expanded', x.dataset.area === areaOpen); });
  document.querySelectorAll('.area-panel').forEach(x => { x.hidden = x.dataset.panel !== areaOpen; });
  const panel = areaOpen && document.querySelector(`.area-panel[data-panel="${areaOpen}"]`);
  if (panel) panel.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
/** Everything for one area: items to work on (as in Needs work) and results on target. */
function areaDetail(a, ins, workCard) {
  const work = [], good = [];
  if (a.care) {
    ins.overdue.forEach(x => work.push(`<li class="row click" ${isProc(x.i) ? `data-proc="${x.i.id}"` : `data-test="${x.i.id}"`}><div class="main"><div class="title">${esc(x.i.name)}</div></div><span class="small v-high">${esc(x.s.label)}</span></li>`));
    ins.items.filter(x => isProc(x.i) && x.s.last && x.s.state !== 'overdue').forEach(x => good.push(`<li class="row click" data-proc="${x.i.id}"><div class="main"><div class="title">✓ ${esc(x.i.name)}</div></div><span class="small muted">${esc(x.s.label)}</span></li>`));
    const never = ins.items.filter(x => x.s.state === 'never' && isProc(x.i)).length;
    const scanWork = ins.work.filter(w => w.scan && (a.scans || []).includes(w.scan));
    (a.scans || []).filter(id => scanStatus(id).tone === 'ok').forEach(id => good.unshift(`<li class="row click" data-go="procs"><div class="main"><div class="title">✓ ${esc(SCANS[id].title.replace(/\s*\(.*\)/, ''))}: normal</div></div></li>`));
    return `${scanWork.length ? `<h4>Scan findings</h4><ol class="works open">${scanWork.map(workCard).join('')}</ol>` : ''}${work.length ? `<h4>To work on</h4><ul class="list">${work.join('')}</ul>` : '<p class="nothing">🎉 Nothing overdue.</p>'}
      ${good.length ? `<h4>Up to date</h4><ul class="list">${good.slice(0, 8).join('')}</ul>${good.length > 8 ? `<p class="small muted">and ${good.length - 8} more</p>` : ''}` : ''}
      ${never ? `<p class="small" style="margin-top:8px"><a href="#" data-pastdates>Add ${never} past date${never === 1 ? '' : 's'}</a> so reminders are accurate.</p>` : ''}`;
  }
  const ids = areaIds(a), items = ins.work.filter(w => (w.test && ids.includes(w.test)) || (w.scan && (a.scans || []).includes(w.scan)));
  const fa = a.fitness && ins.fa;
  ids.map(latestOf).filter(x => x && x.f === 'ok').forEach(x => good.push(`<li class="win" data-test="${x.t.id}"><span class="w-ico" aria-hidden="true">✓</span><span class="w-txt">${esc(short(x.t.name))}${x.age > RECENT_DAYS ? ` <span class="small muted">· ${fmt(x.r.date)}</span>` : ''}</span><span class="w-val">${esc(`${showVal(x.t, x.r.value)} ${showUnit(x.t)}`.trim())}</span></li>`));
  (a.scans || []).filter(id => scanStatus(id).tone === 'ok').forEach(id => good.push(`<li class="win" data-go="procs"><span class="w-ico" aria-hidden="true">🩻</span><span class="w-txt">${esc(SCANS[id].title.replace(/\s*\(.*\)/, ''))}</span><span class="w-val">Normal</span></li>`));
  if (fa) (fa.diff <= 0 ? good : []).push(`<li class="win" data-go="body"><span class="w-ico" aria-hidden="true">🏃</span><span class="w-txt">Fitness age</span><span class="w-val">${fa.fa} (you’re ${fa.age})</span></li>`);
  const noTarget = ids.filter(id => resultsFor(id).length && latestOf(id)?.f === 'none').length;
  if (!items.length && !good.length) return `<p class="small muted">No results with a target yet. <a href="#" data-labimport>Import a report</a> or add results in <a href="#" data-go="${a.go}">${a.go === 'body' ? 'Body &amp; Fitness' : 'Bloodwork'}</a>.</p>`;
  return `${items.length ? `<h4>To work on</h4><ol class="works open">${items.map(workCard).join('')}</ol>` : '<p class="nothing">🎉 Nothing to work on here.</p>'}
    ${fa && fa.diff > 0 ? `<p class="small">Your fitness age is <b>${fa.fa}</b>, ${fa.diff} year${fa.diff === 1 ? '' : 's'} older than you — raising VO2 max is the biggest lever.</p>` : ''}
    ${good.length ? `<h4>On target</h4><ul class="wins">${good.join('')}</ul>` : ''}
    ${noTarget ? `<p class="small muted">${noTarget} more result${noTarget === 1 ? '' : 's'} without a target.</p>` : ''}`;
}
// "+N more" in Needs work expands the list in place (remembered while the page is open).
let workOpen = false;
document.addEventListener('click', e => {
  const b = e.target.closest('[data-wkmore]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const list = document.getElementById('works'); if (!list) return;
  workOpen = !workOpen; list.classList.toggle('open', workOpen);
  b.setAttribute('aria-expanded', workOpen); b.textContent = workOpen ? 'Show less' : `+${list.dataset.more} more`;
  if (workOpen) list.children[3]?.focus?.();
});
function vSummary() {
  const T = today(), dob = db.settings.dob, age = dob ? ageOn(dob, T) : null;
  const first = (cloudSync.user?.displayName || '').split(' ')[0];
  const ins = insights();
  // Score: share of key results (current, with a target) that are on target, plus scans with results.
  const key = [...new Set(AREAS.flatMap(areaIds))].map(latestOf).filter(x => x && x.f !== 'none' && x.age <= RECENT_DAYS);
  const scanStats = typeof SCANS !== 'undefined' ? Object.keys(SCANS).map(scanStatus).filter(s => s.tone) : [];
  const okN = key.filter(x => x.f === 'ok').length + scanStats.filter(s => s.tone === 'ok').length, totalN = key.length + scanStats.length;
  const pct = totalN ? Math.round(okN / totalN * 100) : 0;
  const mood = !totalN ? null : pct >= 85 ? ['Crushing it 💪', 'good'] : pct >= 65 ? ['Mostly on track 👍', 'good'] : pct >= 45 ? ['Some areas to work on 🌱', 'mid'] : ['Plenty to work on — you’ve got this 🌱', 'work'];
  const hasData = db.results.length > 0;
  // coming up: next 3, with same-day bloodwork grouped
  const up = [], seen = {};
  ins.items.filter(x => x.s.due && x.s.due >= T && !['never', 'complete'].includes(x.s.state)).sort((a, b) => a.s.due.localeCompare(b.s.due)).forEach(x => {
    if (!isProc(x.i)) { if (seen[x.s.due]) { seen[x.s.due].n++; return; } seen[x.s.due] = { blood: true, due: x.s.due, n: 1 }; up.push(seen[x.s.due]); }
    else up.push({ i: x.i, due: x.s.due });
  });
  const never = ins.items.filter(x => x.s.state === 'never' && isProc(x.i)).length;
  const wellness = procById('wellness-exam'), ws = wellness && schedule(wellness), visitSoon = ws && ws.due && days(T, ws.due) <= 60;
  const winRow = w => `<li class="win" ${w.test ? `data-test="${w.test}"` : w.go ? `data-go="${w.go}"` : ''}><span class="w-ico" aria-hidden="true">${w.icon}</span><span class="w-txt">${esc(w.text)}</span>${w.value ? `<span class="w-val">${esc(w.value)}</span>` : ''}</li>`;
  const workCard = (w, i) => `<li class="work" ${w.test ? `data-test="${w.test}"` : w.go ? `data-go="${w.go}"` : ''}>
    <div class="wk-top"><span class="wk-n" aria-hidden="true">${i + 1}</span><div class="wk-main"><div class="wk-title">${esc(w.title)}${w.value ? ` <span class="wk-val">${esc(w.value)}</span>` : ''}</div>
    ${w.target ? `<div class="wk-sub">Target ${esc(w.target)}</div>` : ''}${w.why ? `<div class="wk-sub">${esc(w.why)}</div>` : ''}</div></div>
    ${w.notes.length ? `<div class="wk-notes">${w.notes.map(n => `<span>${esc(n)}</span>`).join('')}</div>` : ''}
    <div class="wk-next">→ ${esc(w.next)}</div></li>`;

  return `
  ${typeof sizeNote === 'function' && sizeNote().warn ? `<div class="hint pd-hint warn-hint" style="margin:16px 0 0"><div><b>Your data is ${sizeNote().pct}% of your account’s storage.</b> See Data → Storage to free up space.</div></div>` : ''}
  ${!db.settings.dob || !db.settings.sex ? `<div class="card welcome"><div class="card-b"><h2 style="margin:0 0 4px">Welcome to Healthspan Tracker</h2>
    <p>Track your blood tests, body and fitness results, scans, screenings and vaccines in one place — and get reminded when each is due. Start with two details so recommendations fit you:</p>
    <div class="grid2" style="max-width:520px"><label class="f">Date of birth<input id="dob" type="date" value="${db.settings.dob || ''}"></label>
    <label class="f">Sex (for screenings &amp; fitness norms)<select id="sex"><option value="">Choose…</option><option value="female" ${db.settings.sex === 'female' ? 'selected' : ''}>Female</option><option value="male" ${db.settings.sex === 'male' ? 'selected' : ''}>Male</option></select></label></div>
    <p class="small muted" style="margin-top:10px">${cloudSync.user ? 'Saved to your account.' : 'Your data stays in this browser unless you <a href="#" data-signin>sign in with Google</a> to save it across devices. <a href="privacy.html">How your data is protected</a>'}</p></div></div>` : ''}

  <section class="sum-hero ${mood ? mood[1] : 'none'}">
    <div class="hero-txt">
      <div class="hero-hi">${first ? `Hi ${esc(first)} 👋` : 'Your health at a glance'}</div>
      <h2>${mood ? mood[0] : hasData ? 'Add results with targets to see your score' : 'Let’s get your health story started'}</h2>
      <p>${totalN ? `<b>${okN} of ${totalN}</b> key results are on target${ins.work.length ? `, and there ${ins.work.length === 1 ? 'is <b>1 thing</b>' : `are <b>${Math.min(ins.work.length, 3)}${ins.work.length > 3 ? '+' : ''} things</b>`} worth your attention` : ' — nothing needs attention right now'}.`
        : 'Import a lab, DEXA or fitness report, or add results by hand — your summary builds itself.'}</p>
      <div class="muted small">${fmt(T)}${age != null ? ` · age ${age}` : ''}</div>
    </div>
    ${totalN ? scoreRing(pct, mood[1]) : `<div class="hero-start"><button class="btn primary" data-labimport>Import a report</button><button class="btn" data-pastdates>Add past checkups</button></div>`}
  </section>

  ${hasData || ins.work.length ? `<div class="sum-cols">
    <section class="card sum-card"><div class="card-h"><h3>✨ Going well</h3>${ins.wins.length > 5 ? `<span class="small muted">top 5 of ${ins.wins.length}</span>` : ''}</div>
      <div class="card-b">${ins.wins.length ? `<ul class="wins">${ins.wins.slice(0, 5).map(winRow).join('')}</ul>` : '<p class="small muted">Wins will show up here as you add results.</p>'}</div></section>
    <section class="card sum-card"><div class="card-h"><h3>🎯 Needs work</h3>${ins.work.length > 3 ? `<button type="button" class="link-btn small" data-wkmore aria-controls="works" aria-expanded="${workOpen}">${workOpen ? 'Show less' : `+${ins.work.length - 3} more`}</button>` : ''}</div>
      <div class="card-b">${ins.work.length ? `<ol class="works${workOpen ? ' open' : ''}" id="works" data-more="${ins.work.length - 3}">${ins.work.map(workCard).join('')}</ol>` : '<p class="nothing">🎉 Nothing needs attention right now.</p>'}</div></section>
  </div>` : ''}

  <section class="card sum-card" style="margin-top:12px"><div class="card-h"><h3>📅 Coming up</h3><a href="#" data-go="reminders" class="small">All reminders</a></div>
    <div class="card-b"><ul class="list">${up.slice(0, 3).map(u => `<li class="row ${u.i ? 'click' : ''}" ${u.i ? `data-proc="${u.i.id}"` : 'data-go="blood"'}><div class="main"><div class="title">${u.blood ? `Bloodwork · ${u.n} test${u.n > 1 ? 's' : ''}` : esc(u.i.name)}${u.i && needsBooking(u.i, schedule(u.i)) ? ' <span class="tag-book">Not booked</span>' : u.i && u.i.bookedFor === u.due ? ' <span class="tag-booked">Booked</span>' : ''}</div></div><span class="small muted">${fmt(u.due)} · ${rel(days(T, u.due))}</span></li>`).join('') || '<li class="row muted">Nothing scheduled yet.</li>'}</ul>
      <div class="actions" style="margin-top:10px">${visitSoon ? `<button class="btn primary" data-visitsheet="wellness-exam">Prepare for your ${esc(fmt(ws.due))} visit</button>` : ''}<button class="btn" data-labimport>Import results</button>${never ? `<button class="btn" data-pastdates>Add ${never} past date${never === 1 ? '' : 's'}</button>` : ''}</div></div></section>

  <h3 class="areas-h">Your areas</h3>
  <div class="areas">${AREAS.map(a => { const st = areaStatus(a, ins); return `<button type="button" class="area ${st.tone}${areaOpen === a.key ? ' sel' : ''}" data-area="${a.key}" aria-controls="area-${a.key}" aria-expanded="${areaOpen === a.key}"><span class="a-ico" aria-hidden="true">${a.icon}</span><span class="a-txt"><b>${esc(a.title)}</b><span>${esc(st.text)}</span></span><span class="a-dot" aria-hidden="true"></span></button>`; }).join('')}</div>
  ${AREAS.map(a => `<section class="card area-panel" id="area-${a.key}" data-panel="${a.key}" ${areaOpen === a.key ? '' : 'hidden'} aria-label="${esc(a.title)}">
    <div class="card-h"><h3>${a.icon} ${esc(a.title)}</h3><a href="#" class="small" data-go="${a.go}">Open ${a.go === 'body' ? 'Body &amp; Fitness' : a.go === 'reminders' ? 'Reminders' : 'Bloodwork'} →</a></div>
    <div class="card-b">${areaDetail(a, ins, workCard)}</div></section>`).join('')}

  <details class="sum-more"><summary>See all key numbers</summary>
    ${SUMMARY_GROUPS.map(g => `<section class="sum-group"><div class="sg-h"><h3>${esc(g.title)}</h3><span class="muted small">${esc(g.why)}</span></div>
      <div class="tiles">${g.ids.map(tile).join('')}${(g.scans || []).map(scanTile).join('')}</div></section>`).join('')}
  </details>
  <p class="small muted" style="margin-top:20px">Targets are general guides from published sources and your lab reports. This is a personal tracker, not medical advice — talk to your doctor about any result. <a href="privacy.html">Privacy &amp; terms</a></p>`;
}

function scanTile(procId) {
  if (typeof SCANS === 'undefined' || !SCANS[procId]) return '';
  const st = scanStatus(procId), tone = st.tone === 'warn' ? 'warn' : st.tone === 'bad' ? 'bad' : st.tone === 'ok' ? 'ok' : 'none';
  return `<button class="tile ${tone}" data-go="procs"><div class="t-top"><span class="t-name">${esc(SCANS[procId].title.replace(/\s*\(.*\)/, ''))}</span><span class="dot ${tone}"></span></div>
    <div class="t-val" style="font-size:1.05rem">${esc(st.headline)}</div>
    <div class="t-why">${esc(procById(procId)?.purpose || SCANS[procId].what)}</div>
    <div class="t-date">${st.date ? fmt(st.date) : esc(schedule(procById(procId)).label)}</div></button>`;
}
