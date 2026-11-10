/* My Info tab: supplements & medications, lifestyle changes, family history, home measurements.
   Also: family-history screening adjustments and "what changed" markers used by charts. Loaded before app.js. */
'use strict';
const FIRST_DEGREE = ['Mother', 'Father', 'Sister', 'Brother', 'Daughter', 'Son'];
const RELATIVES = [...FIRST_DEGREE, 'Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Cousin', 'Half-sibling', 'Other'];
const CONDITIONS = ['Breast cancer', 'Ovarian cancer', 'Colorectal cancer', 'Prostate cancer', 'Melanoma', 'Pancreatic cancer', 'Other cancer',
  'Heart attack or heart disease', 'Stroke', 'High cholesterol', 'High blood pressure', 'Type 2 diabetes', 'Osteoporosis or hip fracture',
  'Dementia or Alzheimer’s', 'Thyroid disease', 'Other'];
const MALE = ['Father', 'Brother', 'Son', 'Grandfather', 'Uncle'];

/* ---------- family history → screening changes ---------- */
function familyAdjust(item) {
  const fam = (typeof db !== 'undefined' && db.family) || [];
  if (!fam.length) return null;
  const first = c => fam.filter(f => f.condition === c && FIRST_DEGREE.includes(f.relative));
  const any = c => fam.filter(f => f.condition === c);
  const youngest = list => Math.min(...list.map(f => Number(f.age) || 99));
  if (item.id === 'colorectal-screening' && first('Colorectal cancer').length) {
    const y = youngest(first('Colorectal cancer')), start = Math.max(18, Math.min(40, y === 99 ? 40 : y - 10));
    return { patch: { startAge: start, frequencyMonths: 60 }, why: `Colorectal cancer in a ${first('Colorectal cancer')[0].relative.toLowerCase()}: start at ${start} (40, or 10 years before their diagnosis), colonoscopy every 5 years.` };
  }
  if (item.id === 'mammogram' && first('Breast cancer').length) {
    const y = youngest(first('Breast cancer')), start = Math.max(25, Math.min(40, y === 99 ? 40 : y - 10));
    return { patch: { startAge: start }, why: `Breast cancer in a ${first('Breast cancer')[0].relative.toLowerCase()}: start mammograms at ${start} (10 years before their diagnosis, not before 25). Ask about yearly screening and breast MRI.` };
  }
  if (item.id === 'brca-counseling') {
    const hits = [...any('Ovarian cancer'), ...any('Pancreatic cancer'), ...any('Breast cancer').filter(f => (Number(f.age) || 99) < 50 || MALE.includes(f.relative)),
      ...any('Prostate cancer').filter(f => (Number(f.age) || 99) < 60)];
    if (hits.length) return { patch: { asNeeded: false, oneTime: true }, why: `Recommended because of ${hits[0].condition.toLowerCase()} in your ${hits[0].relative.toLowerCase()}${hits[0].age ? ` (age ${hits[0].age})` : ''}.` };
  }
  if (item.id === 'dermatologist' && first('Melanoma').length) return { patch: { asNeeded: false, frequencyMonths: 12 }, why: 'Melanoma in a close relative: yearly skin checks.' };
  if (item.id === 'coronary-calcium-scan') {
    const early = any('Heart attack or heart disease').filter(f => FIRST_DEGREE.includes(f.relative) && f.age && Number(f.age) < (MALE.includes(f.relative) ? 55 : 65));
    if (early.length) return { patch: {}, why: `Early heart disease in your ${early[0].relative.toLowerCase()} (age ${early[0].age}) — ask your doctor whether to do this scan sooner.` };
  }
  if (item.id === 'osteoporosis-screening' && first('Osteoporosis or hip fracture').length) return { patch: {}, why: 'A parent with osteoporosis or hip fracture raises your risk — ask about screening at menopause.' };
  return null;
}
function familyEffects() {
  return myProcs().map(p => ({ p, f: familyAdjust(p) })).filter(x => x.f);
}

/* ---------- changes that relate to a test (for charts) ---------- */
function changesFor(t) {
  const ev = (db.events || []).filter(e => (e.panels || []).includes(t.panel) || (e.tests || []).includes(t.id));
  const md = (db.meds || []).filter(m => m.start && ((m.panels || []).includes(t.panel) || (m.tests || []).includes(t.id)))
    .map(m => ({ id: m.id, date: m.start, title: `Started ${m.name}`, detail: m.dose }));
  const seen = new Set(); return [...ev, ...md].filter(x => { const k = x.date + x.title; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- view ---------- */
function vMyInfo() {
  const meds = (db.meds || []).slice().sort((a, b) => (a.stop ? 1 : 0) - (b.stop ? 1 : 0) || (b.start || '').localeCompare(a.start || ''));
  const events = (db.events || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const fam = db.family || [], eff = familyEffects();
  const homeIds = ['home-weight', 'home-bp-sys', 'home-bp-dia', 'home-rhr'];
  const latest = id => resultsFor(id).at(-1);
  return `
  <h2>Home measurements</h2>
  <p class="small muted" style="margin:-6px 0 12px">Readings between doctor visits. They appear with charts under Body &amp; Fitness → Home measurements.</p>
  <div class="card"><div class="card-b">
    <form id="homeform" class="grid2" style="margin-top:8px">
      <label class="f">Date<input type="date" name="date" value="${today()}" max="${today()}" required></label>
      <label class="f">Weight (lbs)<input name="home-weight" inputmode="decimal" placeholder="${esc(latest('home-weight')?.value || '')}"></label>
      <label class="f">Blood pressure (e.g. 118/76)<input name="bp" placeholder="${latest('home-bp-sys') ? esc(latest('home-bp-sys').value + '/' + (latest('home-bp-dia')?.value || '')) : 'top / bottom'}"></label>
      <label class="f">Resting heart rate (bpm)<input name="home-rhr" inputmode="numeric" placeholder="${esc(latest('home-rhr')?.value || '')}"></label>
      <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save reading</button>
        <span class="small muted">${homeIds.some(latest) ? `Last: ${homeIds.map(id => { const r = latest(id); return r ? `${esc(testById(id).name.replace(' (home)', ''))} ${esc(r.value)} (${fmtShort(r.date)})` : ''; }).filter(Boolean).join(' · ')}` : 'No readings yet.'}</span></div>
    </form>
  </div></div>

  <h2>Supplements &amp; medications</h2>
  <p class="small muted" style="margin:-6px 0 12px">What you take and when you started. Changes show up on related result charts.</p>
  <div class="card"><div class="card-b"><ul class="list">
    ${meds.length ? meds.map(m => `<li class="row click" data-med="${m.id}"><div class="main"><div class="title">${esc(m.name)} <span class="tag">${m.type === 'medication' ? 'Medication' : 'Supplement'}</span>${m.stop ? ' <span class="muted small">· stopped</span>' : ''}</div>
      <div class="meta">${esc(m.dose || '')}${m.reason ? ' · for ' + esc(m.reason) : ''} · ${m.start ? 'since ' + fmt(m.start) : 'start date not set'}${m.stop ? ' – ' + fmt(m.stop) : ''}</div></div></li>`).join('') : '<li class="row muted">Nothing added yet.</li>'}
  </ul><div class="actions" style="margin-top:8px"><button class="btn" data-med="new">Add supplement or medication</button></div></div></div>

  <h2>Lifestyle changes</h2>
  <p class="small muted" style="margin:-6px 0 12px">Diet, exercise or other changes. Each one is marked on the charts it affects, so you can see what worked.</p>
  <div class="card"><div class="card-b"><ul class="list">
    ${events.length ? events.map(e => `<li class="row click" data-event="${e.id}"><div class="main"><div class="title">${esc(e.title)}</div>
      <div class="meta">${fmt(e.date)}${(e.panels || []).length ? ' · marked on ' + esc(e.panels.join(', ')) : ''}</div>${e.detail ? `<div class="purpose-line">${esc(e.detail)}</div>` : ''}</div></li>`).join('') : '<li class="row muted">Nothing added yet.</li>'}
  </ul><div class="actions" style="margin-top:8px"><button class="btn" data-event="new">Add a change</button></div></div></div>

  <h2>Family history</h2>
  <p class="small muted" style="margin:-6px 0 12px">Conditions in blood relatives. Some change when your screenings should start — the app adjusts them for you.</p>
  <div class="card"><div class="card-b">
    ${eff.length ? `<div class="verdict warn" style="margin-bottom:10px"><b>Adjusted for your family history</b><ul style="margin:6px 0 0;padding-left:18px">${eff.map(x => `<li><b>${esc(x.p.name)}:</b> ${esc(x.f.why)}</li>`).join('')}</ul></div>` : ''}
    <ul class="list">${fam.length ? fam.map(f => `<li class="row"><div class="main"><div class="title">${esc(f.relative)} — ${esc(f.condition)}</div>
      <div class="meta">${f.age ? 'Diagnosed at age ' + esc(f.age) : 'Age at diagnosis unknown'}${f.notes ? ' · ' + esc(f.notes) : ''}</div></div><button class="btn link danger" data-delfam="${f.id}">Remove</button></li>`).join('') : '<li class="row muted">Nothing added yet. Add any cancers, early heart disease, diabetes or osteoporosis in parents, siblings, children, grandparents, aunts or uncles.</li>'}</ul>
    <form id="famform" class="grid2" style="margin-top:12px">
      <label class="f">Relative<select name="relative">${RELATIVES.map(r => `<option>${r}</option>`).join('')}</select></label>
      <label class="f">Condition<select name="condition">${CONDITIONS.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="f">Age at diagnosis<input name="age" inputmode="numeric" placeholder="If known"></label>
      <label class="f">Notes<input name="notes" placeholder="Optional"></label>
      <div class="actions" style="grid-column:1/-1"><button class="btn primary">Add to family history</button></div>
    </form>
  </div></div>`;
}

/* ---------- modals ---------- */
function openMed(id) {
  const m = id === 'new' ? { id: '', name: '', dose: '', type: 'supplement', start: today(), stop: null, reason: '', panels: [] } : db.meds.find(x => x.id === id);
  const panels = [...new Set(db.tests.filter(t => t.kind === 'blood' || t.kind === 'metric').map(t => t.panel))];
  open(`${head(m.id ? esc(m.name) : 'Add supplement or medication')}
  <form id="medform" class="m-b grid2" style="margin-top:12px">
    <label class="f">Name<input name="name" value="${esc(m.name)}" required></label>
    <label class="f">Type<select name="type"><option value="supplement" ${m.type !== 'medication' ? 'selected' : ''}>Supplement</option><option value="medication" ${m.type === 'medication' ? 'selected' : ''}>Medication</option></select></label>
    <label class="f">Dose &amp; timing<input name="dose" value="${esc(m.dose || '')}" placeholder="e.g. 2,000 IU daily"></label>
    <label class="f">Why you take it<input name="reason" value="${esc(m.reason || '')}"></label>
    <label class="f">Started<input type="date" name="start" value="${m.start || ''}"></label>
    <label class="f">Stopped<input type="date" name="stop" value="${m.stop || ''}"></label>
    <label class="f" style="grid-column:1/-1">Mark on these result charts<select name="panels" multiple size="5">${panels.map(p => `<option ${(m.panels || []).includes(p) ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button>${m.id ? `<button type="button" class="btn danger" data-delmed="${m.id}">Delete</button>` : ''}</div>
  </form>`);
  $('#medform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    Object.assign(m, { name: f.get('name').trim(), type: f.get('type'), dose: f.get('dose').trim(), reason: f.get('reason').trim(),
      start: f.get('start') || null, stop: f.get('stop') || null, panels: f.getAll('panels') });
    db.meds ||= []; if (!m.id) { m.id = uniqueId('med-' + m.name, db.meds); db.meds.push(m); }
    close(); save('Saved');
  });
}
function openEvent(id) {
  const ev = id === 'new' ? { id: '', date: today(), title: '', detail: '', panels: [] } : db.events.find(x => x.id === id);
  const panels = [...new Set(db.tests.filter(t => t.kind === 'blood' || t.kind === 'metric').map(t => t.panel))];
  open(`${head(ev.id ? esc(ev.title) : 'Add a lifestyle change')}
  <form id="evform" class="m-b grid2" style="margin-top:12px">
    <label class="f">What changed<input name="title" value="${esc(ev.title)}" required placeholder="e.g. Started Zone 2 training"></label>
    <label class="f">Date<input type="date" name="date" value="${ev.date}" required></label>
    <label class="f" style="grid-column:1/-1">Details<textarea name="detail">${esc(ev.detail || '')}</textarea></label>
    <label class="f" style="grid-column:1/-1">Mark on these result charts<select name="panels" multiple size="6">${panels.map(p => `<option ${(ev.panels || []).includes(p) ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
    <div class="actions" style="grid-column:1/-1"><button class="btn primary">Save</button>${ev.id ? `<button type="button" class="btn danger" data-delevent="${ev.id}">Delete</button>` : ''}</div>
  </form>`);
  $('#evform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target);
    Object.assign(ev, { title: f.get('title').trim(), date: f.get('date'), detail: f.get('detail').trim(), panels: f.getAll('panels') });
    db.events ||= []; if (!ev.id) { ev.id = uniqueId('ev-' + ev.date + '-' + ev.title, db.events); db.events.push(ev); }
    close(); save('Saved');
  });
}
function myInfoSubmit(e) {
  if (e.target.id === 'homeform') {
    e.preventDefault(); const f = new FormData(e.target), date = f.get('date'); let n = 0;
    const put = (id, v) => { v = (v || '').trim(); if (v) { upsertResult(id, date, v); n++; } };
    put('home-weight', f.get('home-weight')); put('home-rhr', f.get('home-rhr'));
    const bp = (f.get('bp') || '').match(/(\d{2,3})\s*[\/\\ ]\s*(\d{2,3})/);
    if (bp) { put('home-bp-sys', bp[1]); put('home-bp-dia', bp[2]); } else if ((f.get('bp') || '').trim()) { toast('Enter blood pressure like 118/76'); return true; }
    save(n ? `Saved ${n} reading${n === 1 ? '' : 's'}` : 'Nothing entered'); return true;
  }
  if (e.target.id === 'famform') {
    e.preventDefault(); const f = new FormData(e.target); db.family ||= [];
    db.family.push({ id: 'fam-' + Date.now(), relative: f.get('relative'), condition: f.get('condition'), age: f.get('age').trim(), notes: f.get('notes').trim() });
    save('Added to family history'); return true;
  }
  return false;
}
