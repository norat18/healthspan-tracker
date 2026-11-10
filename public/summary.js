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
  const trend = v != null && pv != null && v !== pv ? `<span class="t-trend">${v > pv ? '▲' : '▼'} from ${esc(p.value)}</span>` : '';
  return `<button class="tile ${FLAG_TONE[f]}" data-test="${id}">
    <div class="t-top"><span class="t-name">${esc(short(t.name))}</span><span class="dot ${FLAG_TONE[f]}" title="${FLAG_WORD[f]}"></span></div>
    <div class="t-val">${esc(r.value)} <small>${esc(t.unit)}</small></div>
    <div class="t-meta"><span class="t-flag ${FLAG_TONE[f]}">${FLAG_WORD[f]}</span>${trend}</div>
    <div class="t-why">${esc(TILE_PURPOSE[id] || t.description)}</div>
    <div class="t-date ${stale ? 'stale' : ''}">${fmt(r.date)}${stale ? ' · over a year old' : ''}${t.optimalText ? ` · target ${esc(t.optimalText)}` : ''}</div></button>`;
}

function vSummary() {
  const T = today(), dob = db.settings.dob;
  const age = dob ? ageOn(dob, T) : null;
  // flagged latest results across bloodwork, body & fitness
  const flagged = db.tests.filter(t => t.kind !== 'scan').map(t => ({ t, r: resultsFor(t.id).at(-1) }))
    .filter(x => x.r && ['high', 'low'].includes(flag(x.t, x.r.value)));
  const scanFlags = typeof SCANS !== 'undefined' ? Object.keys(SCANS).map(id => ({ id, st: scanStatus(id) })).filter(x => ['warn', 'bad'].includes(x.st.tone)) : [];
  const items = allItems();
  const overdue = items.filter(x => x.s.state === 'overdue'), never = items.filter(x => x.s.state === 'never');
  // upcoming, with same-day bloodwork grouped
  const up = []; const seen = {};
  items.filter(x => x.s.due && x.s.due >= T && !['never', 'complete'].includes(x.s.state)).sort((a, b) => a.s.due.localeCompare(b.s.due)).forEach(x => {
    if (!isProc(x.i)) { const k = x.s.due; if (seen[k]) { seen[k].n++; return; } seen[k] = { blood: true, due: k, n: 1 }; up.push(seen[k]); }
    else up.push({ i: x.i, due: x.s.due });
  });
  const kinds = { blood: db.tests.filter(t => kindOf(t) === 'blood'), metric: db.tests.filter(t => kindOf(t) === 'metric') };
  const stat = list => { const latest = list.map(t => ({ t, r: resultsFor(t.id).at(-1) })); const has = latest.filter(x => x.r);
    return { total: list.length, tested: has.length, ok: has.filter(x => flag(x.t, x.r.value) === 'ok').length,
      off: has.filter(x => ['high', 'low'].includes(flag(x.t, x.r.value))).length, last: has.map(x => x.r.date).sort().at(-1) }; };
  const sb = stat(kinds.blood), sm = stat(kinds.metric);
  const procs = myProcs().map(i => ({ i, s: schedule(i) }));
  return `
  <div class="sum-head"><div><h2 style="margin:0">Health summary</h2>
    <div class="muted small">As of ${fmt(T)}${age != null ? ` · age ${age} (next birthday ${fmt(nextBirthday(dob))})` : ''} · tap any result for its history</div></div>
    <div class="legend small"><span><i class="dot ok"></i>In range</span><span><i class="dot bad"></i>Outside target</span><span><i class="dot none"></i>No target / not tested</span></div></div>

  ${!db.settings.dob ? `<div class="card welcome"><div class="card-b"><h2 style="margin:0 0 4px">Welcome to Healthspan Tracker</h2>
    <p>Track your blood tests, body and fitness results, scans, screenings and vaccines in one place — and get reminded when each is due. Start with two details so recommendations fit you:</p>
    <div class="grid2" style="max-width:520px"><label class="f">Date of birth<input id="dob" type="date"></label>
    <label class="f">Sex (for screenings &amp; fitness norms)<select id="sex"><option value="">Choose…</option><option value="female">Female</option><option value="male">Male</option></select></label></div>
    <p class="small muted" style="margin-top:10px">${cloudSync.user ? 'Saved to your account.' : 'Your data stays in this browser unless you <a href="#" data-signin>sign in with Google</a> to save it across devices.'}</p></div></div>` : ''}
  <div class="sum-top">
    <div class="card attn"><div class="card-h"><h3>Needs attention</h3><span class="chip ${flagged.length + scanFlags.length ? 'overdue' : 'ok'}">${flagged.length + scanFlags.length}</span></div>
      <div class="card-b"><ul class="list">
      ${flagged.map(({ t, r }) => { const lf = labFlag(t, r.value); return `<li class="row click" data-test="${t.id}"><div class="main"><div class="title">${esc(short(t.name))} <span class="v-${flag(t, r.value)}">${esc(r.value)} ${esc(t.unit)}</span>${lf ? ` <span class="labtag ${lf}">${lf === 'normal' ? 'Within lab normal' : 'Outside lab normal'}</span>` : ''}</div>
        <div class="meta">${esc(FLAG_WORD[flag(t, r.value)])}: ${esc(t.optimalText)}${t.labText ? ` · lab normal ${esc(t.labText)}` : ''} · ${fmt(r.date)} · ${kindOf(t) === 'blood' ? 'Bloodwork' : 'Body & Fitness'}</div></div></li>`; }).join('')}
      ${scanFlags.map(({ id, st }) => `<li class="row click" data-go="procs"><div class="main"><div class="title">${esc(SCANS[id].title)}</div><div class="meta">${esc(st.text)} · ${fmt(st.date)} · Imaging</div></div></li>`).join('')}
      ${flagged.length + scanFlags.length ? '' : '<li class="row muted">Everything is in range.</li>'}
      </ul></div></div>
    <div class="card"><div class="card-h"><h3>Reminders</h3><a href="#" data-go="reminders" class="small">See all</a></div>
      <div class="card-b">
        <div class="mini-stats"><div class="${overdue.length ? 'bad' : ''}"><b>${overdue.length}</b><span>overdue</span></div><div class="info"><b>${never.length}</b><span>never done / not on file</span></div></div>
        ${never.length ? `<p class="small" style="margin:8px 0 0">Many “not on file” items just need a past date. <a href="#" data-pastdates>Fill in past dates</a></p>` : ''}
        ${overdue.length ? `<p class="small" style="margin:8px 0 0"><b>Overdue:</b> ${esc(overdue.slice(0, 6).map(x => short(x.i.name)).join(', '))}${overdue.length > 6 ? '…' : ''}</p>` : ''}
        <div class="actions" style="margin-top:10px"><button class="btn" data-visitsheet="wellness-exam">Prepare for wellness exam</button><button class="btn" data-labimport>Import lab report</button></div>
        <h4 class="small muted" style="margin:14px 0 4px">Coming up</h4>
        <ul class="list">${up.slice(0, 5).map(u => `<li class="row ${u.i ? 'click' : ''}" ${u.i ? `data-proc="${u.i.id}"` : 'data-go="blood"'}><div class="main"><div class="title">${u.blood ? `Bloodwork · ${u.n} test${u.n > 1 ? 's' : ''}` : esc(u.i.name)}</div></div><span class="small muted">${fmt(u.due)}</span></li>`).join('')}</ul>
      </div></div>
  </div>

  ${SUMMARY_GROUPS.map(g => `<section class="sum-group"><div class="sg-h"><h3>${esc(g.title)}</h3><span class="muted small">${esc(g.why)}</span></div>
    <div class="tiles">${g.ids.map(tile).join('')}${(g.scans || []).map(scanTile).join('')}</div></section>`).join('')}

  <h2>By section</h2>
  <div class="sum-sections">
    <button class="card sec" data-go="blood"><h3>Bloodwork</h3>
      <p><b>${sb.ok}</b> in range · <b class="${sb.off ? 'v-high' : ''}">${sb.off}</b> outside target · <b>${sb.total - sb.tested}</b> never tested</p>
      <p class="small muted">${sb.total} tests tracked · latest draw ${fmt(sb.last)}</p></button>
    <button class="card sec" data-go="body"><h3>Body &amp; Fitness</h3>
      <p><b>${sm.ok}</b> in range · <b class="${sm.off ? 'v-high' : ''}">${sm.off}</b> outside target · ${sm.tested - sm.ok - sm.off} no target</p>
      <p class="small muted">${sm.total} measurements · latest scan ${fmt(sm.last)}</p></button>
    <button class="card sec" data-go="procs"><h3>Imaging &amp; Checkups</h3>
      ${typeof SCANS !== 'undefined' ? `<p>${Object.keys(SCANS).map(id => { const st = scanStatus(id); return `<span class="pill ${st.tone || 'none'}">${esc(SCANS[id].title.replace(/\s*\(.*\)/, ''))}: ${esc(st.short)}</span>`; }).join(' ')}</p>` : ''}
      <p class="small muted">${procs.filter(x => x.s.state === 'overdue').length} overdue · ${procs.filter(x => x.s.state === 'never').length} not on file · ${procs.length} appointments, screenings &amp; vaccines</p></button>
  </div>
  <p class="small muted" style="margin-top:20px">Targets are general guides from published sources and your lab reports. This is a personal tracker, not medical advice — talk to your doctor about any result.</p>`;
}

function scanTile(procId) {
  if (typeof SCANS === 'undefined' || !SCANS[procId]) return '';
  const st = scanStatus(procId), tone = st.tone === 'warn' ? 'warn' : st.tone === 'bad' ? 'bad' : st.tone === 'ok' ? 'ok' : 'none';
  return `<button class="tile ${tone}" data-go="procs"><div class="t-top"><span class="t-name">${esc(SCANS[procId].title.replace(/\s*\(.*\)/, ''))}</span><span class="dot ${tone}"></span></div>
    <div class="t-val" style="font-size:1.05rem">${esc(st.headline)}</div>
    <div class="t-why">${esc(procById(procId)?.purpose || SCANS[procId].what)}</div>
    <div class="t-date">${st.date ? fmt(st.date) : esc(schedule(procById(procId)).label)}</div></button>`;
}
