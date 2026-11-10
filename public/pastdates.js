/* "Fill in past dates": one form for every appointment, screening, vaccine and one-time test with no date on file. Loaded before app.js. */
'use strict';
const PD_GROUPS = [
  ['checkup', 'Routine checkups'], ['womens', 'Women’s health'], ['screening', 'Preventive screenings'],
  ['vaccine', 'Vaccines'], ['imaging', 'Imaging'], ['fitness', 'Fitness tests'], ['tests', 'One-time blood tests'],
];
function pastDateItems() {
  const procs = myProcs().filter(p => !visitsFor(p.id).some(v => v.date) && schedule(p).why !== 'age');
  const tests = db.tests.filter(t => t.kind === 'blood' && t.oneTime && !resultsFor(t.id).length);
  return { procs, tests, count: procs.length + tests.length };
}
function openPastDates() {
  const { procs, tests, count } = pastDateItems();
  if (!count) { toast('Every item already has a date on file'); return; }
  const row = (id, name, purpose, extra = '') => `<div class="pd-row">
      <div class="pd-name"><div>${esc(name)}</div>${purpose ? `<div class="u">${esc(purpose)}</div>` : ''}</div>
      <div class="pd-in"><input type="date" name="d:${id}" max="${today()}" aria-label="Last date for ${esc(name)}">${extra}</div></div>`;
  const groups = PD_GROUPS.map(([k, title]) => {
    const rows = k === 'tests'
      ? tests.map(t => row('t:' + t.id, t.name, t.description, `<input name="v:${t.id}" value="${esc(t.optimalText || 'Negative')}" aria-label="Result for ${esc(t.name)}" class="pd-val">`))
      : procs.filter(p => p.kind === k).map(p => row('p:' + p.id, p.name, p.purpose || p.description));
    return rows.length ? `<h3>${esc(title)}</h3>${rows.join('')}` : '';
  }).join('');
  open(`${head('Fill in past dates', `${count} items have no date on file`)}
  <form id="pdform" class="m-b">
    <p class="small" style="margin-top:12px">Enter the <b>most recent</b> date for anything you’ve had. Approximate is fine — if you only know the month, pick the 1st. Leave blank if you’ve never had it or don’t know; it stays “due now”. You can find many of these in MyChart (Health Summary → Immunizations, Test Results).</p>
    ${groups}
    <div class="actions pd-actions"><button class="btn primary">Save dates</button><button type="button" class="btn" data-close>Cancel</button><span class="small muted" id="pdcount"></span></div>
  </form>`);
  const form = $('#pdform'), upd = () => { const n = [...form.querySelectorAll('input[type=date]')].filter(i => i.value).length; $('#pdcount').textContent = n ? `${n} date${n === 1 ? '' : 's'} entered` : ''; };
  form.addEventListener('input', upd);
  form.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(form); let n = 0;
    for (const [k, date] of f.entries()) {
      if (!k.startsWith('d:') || !date) continue;
      const [, type, id] = k.split(':');
      if (type === 'p') {
        const p = procById(id); if (!p) continue;
        db.visits.push({ id: `${id}-${date}-pd`, procId: id, date, result: 'Added from “Fill in past dates”.' });
        if (p.nextDue && p.nextDue <= date) p.nextDue = null;
      } else {
        upsertResult(id, date, (f.get('v:' + id) || 'Done').trim());
      }
      n++;
    }
    close(); save(n ? `Saved ${n} date${n === 1 ? '' : 's'}` : 'No dates entered');
  });
}
