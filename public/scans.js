/* Visual result cards for heart & imaging scans (CIMT, CAC, CCTA, full-body MRI).
   Each scan's key numbers are stored as results of 'scan' tests, so they keep a history. Loaded before app.js. */
'use strict';
const TONE = { ok: 'ok', warn: 'warn', bad: 'bad' };
const SCANS = {
  'cimt': {
    title: 'Carotid artery walls (CIMT)', what: 'Ultrasound of the neck arteries. Measures wall thickness — an early, reversible sign of artery stress that shows up before plaque.',
    metrics: [
      { id: 'cimt-mean', name: 'Mean wall thickness', unit: 'mm', type: 'num', step: 0.01,
        zones: [{ from: 0.3, to: 0.5, label: 'Normal <0.50', tone: TONE.ok }, { from: 0.5, to: 1.3, label: 'Thickened', tone: TONE.warn }, { from: 1.3, to: 2.0, label: 'Plaque ≥1.3', tone: TONE.bad }] },
      { id: 'cimt-max', name: 'Thickest point', unit: 'mm', type: 'num', step: 0.01,
        zones: [{ from: 0.3, to: 0.5, label: 'Normal <0.50', tone: TONE.ok }, { from: 0.5, to: 1.3, label: 'Thickened', tone: TONE.warn }, { from: 1.3, to: 2.0, label: 'Plaque ≥1.3', tone: TONE.bad }] },
      { id: 'cimt-plaque', name: 'Plaque found', type: 'choice', options: [['None', TONE.ok], ['Present', TONE.bad]] },
      { id: 'cimt-arterial-age', name: 'Arterial age', unit: 'years', type: 'age', vs: 'cimt-age' },
      { id: 'cimt-age', name: 'Your age at scan', unit: 'years', type: 'num', step: 1, hidden: true },
    ] },
  'full-body-mri': {
    title: 'Full-body MRI', what: 'Radiation-free scan of organs, brain and soft tissue for masses, cysts, prior strokes or other structural changes.',
    metrics: [
      { id: 'mri-overall', name: 'Overall result', type: 'choice', options: [['No significant findings', TONE.ok], ['Minor findings — monitor', TONE.warn], ['Follow-up needed', TONE.bad]] },
      { id: 'mri-brain', name: 'Brain', type: 'choice', options: [['Normal', TONE.ok], ['Minor findings', TONE.warn], ['Follow-up needed', TONE.bad]] },
      { id: 'mri-findings', name: 'Findings', type: 'text' },
    ] },
  'coronary-calcium-scan': {
    title: 'Coronary calcium score (CAC)', what: 'Low-dose CT that counts hardened (calcified) plaque in the heart arteries. A score of 0 is the goal.',
    metrics: [
      { id: 'cac-score', name: 'Calcium score (Agatston)', unit: '', type: 'num', step: 1,
        zones: [{ from: 0, to: 0, label: '0 · None', tone: TONE.ok }, { from: 0.0001, to: 99, label: '1–99 · Mild', tone: TONE.warn }, { from: 99.0001, to: 399, label: '100–399 · Moderate', tone: TONE.bad }, { from: 399.0001, to: 1500, label: '400+ · Severe', tone: TONE.bad }] },
      { id: 'cac-percentile', name: 'Percentile for age & sex', unit: 'th %ile', type: 'num', step: 1,
        zones: [{ from: 0, to: 25, label: '<25th', tone: TONE.ok }, { from: 25, to: 75, label: '25–75th', tone: TONE.warn }, { from: 75, to: 100, label: '>75th', tone: TONE.bad }] },
    ] },
  'coronary-ct-angiogram': {
    title: 'Coronary CT angiogram (CCTA)', what: 'Contrast CT showing soft and calcified plaque and how much the heart arteries are narrowed.',
    metrics: [
      { id: 'ccta-cad-rads', name: 'CAD-RADS grade', unit: '', type: 'num', step: 1, discrete: true,
        zones: [0, 1, 2, 3, 4, 5].map(n => ({ from: n, to: n, label: String(n), tone: n === 0 ? TONE.ok : n <= 2 ? TONE.warn : TONE.bad })) },
      { id: 'ccta-stenosis', name: 'Most narrowing', unit: '%', type: 'num', step: 1,
        zones: [{ from: 0, to: 0, label: 'None', tone: TONE.ok }, { from: 0.0001, to: 24, label: '1–24', tone: TONE.warn }, { from: 24.0001, to: 49, label: '25–49', tone: TONE.warn },
          { from: 49.0001, to: 69, label: '50–69', tone: TONE.bad }, { from: 69.0001, to: 99, label: '70–99', tone: TONE.bad }, { from: 99.0001, to: 100, label: '100', tone: TONE.bad }] },
      { id: 'ccta-plaque', name: 'Plaque type', type: 'choice', options: [['None', TONE.ok], ['Calcified', TONE.warn], ['Non-calcified (soft)', TONE.bad], ['Mixed', TONE.bad]] },
    ] },
};

/* Register the scan measurements as trackable tests (the catalog already includes them; this keeps custom edits working). */
(function () {
  const tests = [];
  Object.entries(SCANS).forEach(([procId, s]) => s.metrics.forEach(m => tests.push({
    id: m.id, kind: 'scan', procId, name: m.name, unit: m.unit || '', description: s.title, optimalText: '', low: null, high: null,
    panel: s.title, orderFrom: '', frequencyMonths: null, oneTime: false, nextDue: null, notes: '' })));
  (window.HEALTH_IMPORTS ||= []).push({ id: 'scan-tests-v1', label: 'Scan result tracking', tests });
})();

/* ---------- rendering ---------- */
function zoneOf(m, v) {
  const z = m.zones, i = z.findIndex(x => v <= x.to);
  return i < 0 ? z.length - 1 : i;
}
function scalePos(m, v) {
  const z = m.zones, n = z.length, i = zoneOf(m, v), cur = z[i];
  if (m.discrete || cur.to === cur.from) return (i + 0.5) / n * 100;
  const f = Math.min(1, Math.max(0, (v - cur.from) / (cur.to - cur.from)));
  return (i + f) / n * 100;
}
function toneOf(m, value) {
  if (value == null || value === '') return null;
  if (m.type === 'choice') return (m.options.find(o => o[0] === value) || [, 'warn'])[1];
  if (m.type === 'age') return null;
  const v = num(value); return v == null || !m.zones ? null : m.zones[zoneOf(m, v)].tone;
}
const scanVal = (id, date) => db.results.find(r => r.testId === id && r.date === date);
function scanDates(procId) {
  const ids = new Set(SCANS[procId].metrics.map(m => m.id));
  return [...new Set(db.results.filter(r => ids.has(r.testId)).map(r => r.date))].sort();
}
function scaleBar(m, v) {
  return `<div class="scale ${v == null ? 'empty' : ''}">${m.zones.map(z => `<div class="seg ${z.tone}" title="${esc(z.label)}"><span>${esc(z.label)}</span></div>`).join('')}
    ${v == null ? '' : `<div class="marker" style="left:${scalePos(m, v)}%"></div>`}</div>`;
}
function metricRow(m, date, prevDate) {
  const r = date && scanVal(m.id, date), p = prevDate && scanVal(m.id, prevDate);
  const tone = r ? toneOf(m, r.value) : null;
  if (m.type === 'age') {
    const a = r && num(r.value), b = date && num(scanVal(m.vs, date)?.value), diff = a != null && b != null ? a - b : null;
    if (a == null) return '';
    return `<div class="m"><div class="m-top"><span class="m-name">${esc(m.name)}</span>
      ${diff != null ? `<span class="chip ${diff > 0 ? 'soon' : 'ok'}">${diff > 0 ? '+' + diff + ' years older' : diff < 0 ? Math.abs(diff) + ' years younger' : 'Same as your age'}</span>` : ''}</div>
      <div class="ages"><div><b>${esc(r.note || r.value)}</b><span>arterial age</span></div>${b != null ? `<div class="vs">vs</div><div><b>${b}</b><span>your age</span></div>` : ''}</div></div>`;
  }
  if (m.type === 'text') return r ? `<div class="m"><div class="m-name">${esc(m.name)}</div><p class="small" style="margin:4px 0 0;white-space:pre-line">${esc(r.value)}</p></div>` : '';
  if (m.type === 'choice') return `<div class="m"><div class="m-top"><span class="m-name">${esc(m.name)}</span>
      ${r ? `<span class="pill ${tone}">${esc(r.value)}</span>` : '<span class="muted small">—</span>'}</div></div>`;
  const v = r ? num(r.value) : null, pv = p ? num(p.value) : null;
  const zl = v != null ? m.zones[zoneOf(m, v)].label.replace(/^[\d<>≥.–+ ]*·?\s*/, '') : '';
  return `<div class="m"><div class="m-top"><span class="m-name">${esc(m.name)}</span>
      <span class="m-val ${tone || ''}">${v != null ? `${esc(r.value)}${m.unit ? ' ' + esc(m.unit) : ''}${zl ? ` · ${esc(zl)}` : ''}` : '<span class="muted">—</span>'}</span></div>
    ${scaleBar(m, v)}
    ${v != null && pv != null ? `<div class="m-prev">Previous ${esc(p.value)} (${fmt(prevDate)}) · ${v - pv === 0 ? 'no change' : (v > pv ? '▲ ' : '▼ ') + Math.abs(+(v - pv).toFixed(3))}</div>` : ''}</div>`;
}
const VERDICT = { ok: ['All results in the normal range', 'ok'], warn: ['Mild changes — worth tracking', 'soon'], bad: ['Needs attention — discuss with your doctor', 'overdue'] };
function scanCard(procId) {
  const s = SCANS[procId], p = procById(procId); if (!p) return '';
  const sch = schedule(p), dates = scanDates(procId), date = dates.at(-1), prev = dates.at(-2);
  const visit = date && visitsFor(procId).find(v => v.date === date);
  const tones = date ? s.metrics.map(m => toneOf(m, scanVal(m.id, date)?.value)).filter(Boolean) : [];
  const worst = tones.includes('bad') ? 'bad' : tones.includes('warn') ? 'warn' : tones.length ? 'ok' : null;
  const flagged = date ? s.metrics.filter(m => ['warn', 'bad'].includes(toneOf(m, scanVal(m.id, date)?.value))).map(m => m.name) : [];
  const unconfirmed = !date && visitsFor(procId).find(v => (v.result || '').startsWith('Imported from spreadsheet ("'));
  const doneNoResults = !date && !unconfirmed && visitsFor(procId).filter(v => v.date).at(-1);
  return `<div class="card scan">
    <div class="card-h"><div><h3>${esc(s.title)}</h3><div class="small muted">${date ? 'Latest scan ' + fmt(date) : 'No results yet'}${p.provider ? ' · ' + esc(p.provider) : ''}</div></div>
      ${worst ? `<span class="chip ${VERDICT[worst][1]}">${worst === 'ok' ? 'Normal' : worst === 'warn' ? 'Mild' : 'Attention'}</span>` : chip(sch)}</div>
    <div class="card-b">
      ${worst ? `<div class="verdict ${worst}"><b>${VERDICT[worst][0]}</b>${flagged.length ? `<span> · ${esc(flagged.join(', '))}</span>` : ''}</div>`
        : `<div class="verdict none">${doneNoResults ? `Scan on <b>${fmt(doneNoResults.date)}</b> — no results recorded yet. Add them with <b>Log results</b>.` : unconfirmed ? `Your spreadsheet lists a scan on <b>${fmt(unconfirmed.date)}</b>. Did it happen?<div class="actions" style="margin-top:8px"><button type="button" class="btn primary" data-scanconfirm="${procId}|yes">Yes — add results</button><button type="button" class="btn" data-scanconfirm="${procId}|no">No, it didn’t happen</button></div>` : `Not done yet${sch.due ? ` · planned for <b>${fmt(sch.due)}</b>` : ''}. Below is the scale your results will be shown on.`}</div>`}
      <p class="small muted" style="margin:10px 0 4px">${esc(s.what)}</p>
      ${s.metrics.filter(m => !m.hidden).map(m => metricRow(m, date, prev)).join('')}
      ${visit?.result && !visit.result.startsWith('Imported from spreadsheet') ? `<details class="report"><summary>Report summary</summary><p class="small">${esc(visit.result)}</p></details>` : ''}
      <div class="small muted" style="margin-top:10px">Next scan: ${esc(sch.label)}${dates.length > 1 ? ` · ${dates.length} scans on file` : ''}</div>
    </div>
    <div class="card-h" style="border-top:1px solid var(--border);border-bottom:0"><button class="btn link" data-proc="${procId}">Details &amp; history</button>
      <button class="btn primary" data-scanlog="${procId}">Log results</button></div>
  </div>`;
}
function scanSection() {
  return `<h2>Heart &amp; imaging scan results</h2><div class="scans">${Object.keys(SCANS).map(scanCard).join('')}</div>`;
}

function openScanLog(procId, dateOverride) {
  const s = SCANS[procId], p = procById(procId), dates = scanDates(procId);
  const placeholder = visitsFor(procId).find(v => (v.result || '').startsWith('Imported from spreadsheet ("'));
  const date = dateOverride || dates.at(-1) || placeholder?.date || visitsFor(procId).filter(v => v.date).at(-1)?.date || today();
  const field = m => {
    const cur = scanVal(m.id, date)?.value || '';
    if (m.type === 'choice') return `<select name="${m.id}"><option value="">—</option>${m.options.map(([o]) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
    if (m.type === 'text') return `<textarea name="${m.id}" placeholder="List anything the report mentions">${esc(cur)}</textarea>`;
    return `<input name="${m.id}" value="${esc(cur)}" inputmode="decimal" placeholder="${m.unit ? esc(m.unit) : ''}">`;
  };
  const visit = visitsFor(procId).find(v => v.date === date);
  open(`${head('Log results · ' + esc(s.title), 'Leave blank anything the report doesn’t include')}
  <form id="scanform" class="m-b">
    <div class="fill-report"><label class="btn">📄 Fill from report (PDF or photo)<input type="file" id="scanfile" accept="application/pdf,.pdf,image/*,.txt" hidden></label>
      <span id="scanstatus" class="small muted" role="status">Read on your device — the file isn’t uploaded. You can check everything before saving.</span></div>
    <div class="grid2" style="margin-top:12px"><label class="f">Scan date<input type="date" name="__date" value="${date}" required></label></div>
    <div class="grid2" style="margin-top:12px">${s.metrics.map(m => `<label class="f" ${m.type === 'text' ? 'style="grid-column:1/-1"' : ''}>${esc(m.name)}${m.unit ? ` (${esc(m.unit)})` : ''}${field(m)}</label>`).join('')}</div>
    <label class="f" style="margin-top:12px">Report summary / interpretation<textarea name="__summary">${esc(visit && !(visit.result || '').startsWith('Imported from spreadsheet') ? visit.result : '')}</textarea></label>
    <div class="actions" style="margin-top:18px"><button class="btn primary">Save results</button><button type="button" class="btn" data-close>Cancel</button></div>
  </form>`);
  $('#scanfile').addEventListener('change', e => { const file = e.target.files[0]; if (file) fillScanForm(procId, file); });
  $('#scanform').addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target), dt = f.get('__date'), summary = f.get('__summary').trim();
    s.metrics.forEach(m => { const v = (f.get(m.id) || '').trim(); if (v || scanVal(m.id, dt)) upsertResult(m.id, dt, v); });
    let v = db.visits.find(x => x.procId === procId && x.date === dt);
    if (v) { if (summary || (v.result || '').startsWith('Imported from spreadsheet')) v.result = summary; }
    else db.visits.push({ id: `${procId}-${dt}`, procId, date: dt, result: summary });
    if (p.nextDue && p.nextDue <= dt) p.nextDue = null;
    close(); save('Scan results saved');
  });
}

/** One-line status for a scan, used by the Summary tab. */
function scanStatus(procId) {
  const s = SCANS[procId], dates = scanDates(procId), date = dates.at(-1);
  if (!date) {
    const placeholder = visitsFor(procId).find(v => (v.result || '').startsWith('Imported from spreadsheet ("'));
    return placeholder ? { tone: null, short: 'No results', headline: 'No results recorded', text: 'No results recorded', date: null }
      : { tone: null, short: 'Not done', headline: 'Not done yet', text: 'Not done yet', date: null };
  }
  const tones = s.metrics.map(m => toneOf(m, scanVal(m.id, date)?.value)).filter(Boolean);
  const tone = tones.includes('bad') ? 'bad' : tones.includes('warn') ? 'warn' : 'ok';
  const flagged = s.metrics.filter(m => ['warn', 'bad'].includes(toneOf(m, scanVal(m.id, date)?.value))).map(m => m.name.toLowerCase());
  const word = { ok: 'Normal', warn: 'Mild changes', bad: 'Needs attention' }[tone];
  return { tone, short: { ok: 'Normal', warn: 'Mild', bad: 'Attention' }[tone], headline: word, date,
    text: word + (flagged.length ? ': ' + flagged.join(', ') : '') };
}

function confirmScan(procId, yes) {
  const v = visitsFor(procId).find(x => (x.result || '').startsWith('Imported from spreadsheet ("')); if (!v) return;
  if (yes) { v.result = 'Scan confirmed; add findings from the report.'; save(); openScanLog(procId, v.date); return; }
  db.visits = db.visits.filter(x => x !== v);
  const p = procById(procId); if (p) p.nextDue = null;
  save('Removed — it now shows as due. Set a date if it’s booked.');
}
