/* Printable doctor-visit prep sheet. Loaded before app.js. */
'use strict';
function openVisitSheet(procId) {
  const p = procById(procId) || procById('wellness-exam'); if (!p) return;
  const s = schedule(p), visit = s.due && s.due >= today() ? s.due : today(), dob = db.settings.dob;
  const age = dob ? ageOn(dob, visit) : null;
  const dueBy = x => ['overdue', 'never'].includes(x.s.state) || (x.s.due && x.s.due <= visit);
  // tests to ask for
  const blood = db.tests.filter(t => t.kind === 'blood' && !t.groupWith).map(t => ({ t, s: schedule(t) }));
  const ask = blood.filter(x => dueBy(x) && x.s.state !== 'complete');
  const groups = {}; ask.forEach(x => (groups[x.t.orderFrom || 'Other'] ||= []).push(x));
  const optional = blood.filter(x => x.t.optional && !resultsFor(x.t.id).length).map(x => x.t.name);
  // results to discuss
  const flagged = db.tests.filter(t => t.kind === 'blood' || t.kind === 'metric').map(t => ({ t, r: resultsFor(t.id).at(-1) }))
    .filter(x => x.r && ['high', 'low'].includes(flag(x.t, x.r.value)));
  const scans = typeof SCANS !== 'undefined' ? Object.keys(SCANS).map(id => ({ id, st: scanStatus(id) })).filter(x => ['warn', 'bad'].includes(x.st.tone)) : [];
  // other care due
  const care = myProcs().filter(x => x.id !== p.id && !x.asNeeded).map(x => ({ i: x, s: schedule(x) })).filter(x => dueBy(x) && x.s.state !== 'complete' && x.s.why !== 'age');
  const bundled = db.procedures.filter(x => x.bundleWith === p.id);
  const meds = (db.meds || []).filter(m => !m.stop);
  const fam = db.family || [];
  const yearAgo = addMonths(today(), -12), changes = (db.events || []).filter(e => e.date >= yearAgo).sort((a, b) => a.date.localeCompare(b.date));
  const q = (db.settings.visitQuestions || {})[p.id] || '';
  const li = arr => arr.length ? `<ul>${arr.join('')}</ul>` : '<p class="muted small">None.</p>';
  open(`${head('Visit prep sheet', esc(p.name))}
  <div class="m-b sheet">
    <div class="sheet-head"><div><h2 style="margin:0">${esc(p.name.replace(/\s*\(.*\)/, ''))}</h2>
      <div>${fmt(visit)}${p.provider ? ' · ' + esc(p.provider) : ''}</div></div>
      <div class="small">${age != null ? `Age ${age}` : ''}${dob ? ` · born ${fmt(dob)}` : ''}${db.settings.sex ? ` · ${esc(db.settings.sex)}` : ''}<br>Prepared ${fmt(today())}</div></div>

    <h3>1. Blood tests to ask for</h3>
    ${Object.keys(groups).length ? Object.entries(groups).map(([src, xs]) => `<h4>${src === 'Other' ? 'Also due' : 'Usually ordered from ' + esc(src)}</h4>${li(xs.map(({ t, s }) => {
      const r = resultsFor(t.id).at(-1), g = db.tests.filter(x => x.groupWith === t.id);
      return `<li><span class="box"></span><b>${esc(t.name)}</b>${g.length ? ` (with ${esc(g.map(x => x.name).join(', '))})` : ''} — ${r ? `last ${esc(r.value)} ${esc(t.unit)} on ${fmt(r.date)}` : 'never tested'}</li>`; }))}`).join('') : '<p class="muted small">No blood tests due.</p>'}
    ${optional.length ? `<p class="small"><b>Optional, if you want them:</b> ${esc(optional.join(', '))}.</p>` : ''}

    <h3>2. Results to discuss</h3>
    ${li([...flagged.map(({ t, r }) => { const lf = labFlag(t, r.value); return `<li><b>${esc(t.name)}: ${esc(r.value)} ${esc(t.unit)}</b> (${fmt(r.date)}) — my target ${esc(t.optimalText)}${t.labText ? `; lab normal ${esc(t.labText)}${lf === 'normal' ? ' (within lab normal)' : ''}` : ''}</li>`; }),
      ...scans.map(({ id, st }) => `<li><b>${esc(SCANS[id].title)}</b> (${fmt(st.date)}) — ${esc(st.text)}</li>`)])}

    <h3>3. Other screenings &amp; vaccines due</h3>
    ${bundled.length ? `<p class="small">Usually done at this visit: ${esc(bundled.map(x => x.name).join(', '))}.</p>` : ''}
    ${li(care.map(({ i, s }) => `<li><span class="box"></span><b>${esc(i.name)}</b> — ${esc(s.label)}${s.last ? ` (last ${fmt(s.last)})` : ''}</li>`))}

    <h3>4. Current supplements &amp; medications</h3>
    ${li(meds.map(m => `<li><b>${esc(m.name)}</b>${m.dose ? ' — ' + esc(m.dose) : ''}${m.start ? ` (since ${fmt(m.start)})` : ''}${m.reason ? ` · for ${esc(m.reason)}` : ''}</li>`))}

    <h3>5. Family history</h3>
    ${li(fam.map(f => `<li>${esc(f.relative)}: ${esc(f.condition)}${f.age ? ` (age ${esc(f.age)})` : ''}</li>`))}

    <h3>6. Changes in the past year</h3>
    ${li(changes.map(e => `<li>${fmt(e.date)} — <b>${esc(e.title)}</b>${e.detail ? `: ${esc(e.detail)}` : ''}</li>`))}

    <h3>7. My questions</h3>
    <textarea id="visitq" class="no-print" placeholder="Write questions to ask — they’re saved and printed.">${esc(q)}</textarea>
    <div class="print-only q-print">${q ? esc(q).replace(/\n/g, '<br>') : '<br><br><br>'}</div>

    <div class="actions no-print" style="margin-top:18px"><button class="btn primary" data-printsheet>Print or save as PDF</button><button class="btn" data-close>Close</button></div>
  </div>`);
  $('#visitq').addEventListener('input', e => {
    db.settings.visitQuestions ||= {}; db.settings.visitQuestions[p.id] = e.target.value;
    persist();
    $('.q-print').innerHTML = esc(e.target.value).replace(/\n/g, '<br>') || '<br><br><br>';
  });
}
function printSheet() {
  document.body.classList.add('print-sheet');
  const done = () => { document.body.classList.remove('print-sheet'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1500);
}
