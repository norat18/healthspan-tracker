/* Encouragement on the Summary: one next step (a getting-started checklist for new people), up to 3 focus goals with
   progress bars, a celebration when a result improves or a goal is reached, a few milestones, and a yearly recap.
   Also hides tabs that have nothing in them yet. Loaded after summary.js and before app.js. */
'use strict';
const addDaysISO = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const lowerName = name => short(name).split(' ').map(w => /[A-Z].*[A-Z]/.test(w) ? w : w.toLowerCase()).join(' ');
const S = () => (db.settings ||= {});

/* ---------- getting started ---------- */
function startSteps() {
  const s = S();
  return [
    { key: 'details', done: !!(s.dob && s.sex), title: 'Add your birth date and sex', why: 'So screenings, targets and fitness age fit you.', btn: '<span class="small">Fill in the two boxes above ↑</span>' },
    { key: 'results', done: db.results.length > 0, title: 'Add your first results', why: 'Import a lab, DEXA or fitness report — or type numbers in.',
      btn: '<button class="btn primary" data-labimport>Import a report</button><button class="btn" data-enc="addbyhand">Type them in</button>' },
    { key: 'past', done: myProcs().some(p => visitsFor(p.id).length), title: 'Add your last checkups', why: 'Dentist, eye exam, vaccines… so reminders are right.',
      btn: '<button class="btn primary" data-pastdates>Add past dates</button>' },
    { key: 'remind', done: !!(s.pushOn || s.icsDownloaded), title: 'Turn on reminders', why: 'Get a nudge when something’s due — on your phone or in your calendar.',
      btn: '<button class="btn primary" data-go="data">Set up reminders</button>' },
  ];
}
const startActive = () => !S().startHidden && startSteps().some(x => !x.done);
function startCard() {
  const steps = startSteps(), done = steps.filter(x => x.done).length, cur = steps.findIndex(x => !x.done);
  return `<section class="card next-step start" aria-label="Getting started">
    <div class="ns-kicker">Getting started · ${done} of ${steps.length} done</div>
    <div class="ns-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${done}"><i style="width:${done / steps.length * 100}%"></i></div>
    <ol class="steps">${steps.map((x, i) => `<li class="${x.done ? 'done' : i === cur ? 'current' : 'todo'}"><span class="st-ch" aria-hidden="true">${x.done ? '✓' : i + 1}</span>
      <div><b>${esc(x.title)}</b>${x.done ? '' : `<div class="small muted">${esc(x.why)}</div>`}${i === cur ? `<div class="actions">${x.btn}</div>` : ''}</div></li>`).join('')}</ol>
    <button class="btn link small" data-enc="hidestart">Hide this</button></section>`;
}

/* ---------- one next step ---------- */
function nextStepCandidates(ins) {
  const T = today(), out = [], procs = ins.items.filter(x => isProc(x.i) && !x.i.bundleWith && x.s.due);
  const open = x => `<button class="btn primary" data-proc="${x.i.id}">Open ${esc(short(x.i.name))}</button>`;
  procs.filter(x => x.s.state === 'overdue').sort((a, b) => a.s.due.localeCompare(b.s.due)).forEach(x => out.push({ key: 'od:' + x.i.id, icon: '📅',
    title: `Book your ${lowerName(x.i.name)}`, text: `It was due ${fmt(x.s.due)} — getting it on the calendar is the most useful thing you can do right now.`, btn: open(x) }));
  procs.filter(x => typeof needsBooking === 'function' && needsBooking(x.i, x.s) && x.s.due >= T && days(T, x.s.due) <= 45).sort((a, b) => a.s.due.localeCompare(b.s.due))
    .forEach(x => out.push({ key: `book:${x.i.id}:${x.s.due}`, icon: '📞', title: `Book your ${lowerName(x.i.name)}`,
      text: `It’s due ${fmt(x.s.due)} (${rel(days(T, x.s.due))}). Once you have a date, tick “I’ve booked this” so reminders know.`, btn: open(x) }));
  procs.filter(x => x.i.bookedFor === x.s.due && x.s.due >= T && days(T, x.s.due) <= 14).forEach(x => out.push({ key: `prep:${x.i.id}:${x.s.due}`, icon: '📝',
    title: `Get ready for your ${lowerName(x.i.name)}`, text: `${fmt(x.s.due)} — ${rel(days(T, x.s.due))}. A one-page sheet lists what to ask for and what’s changed.`,
    btn: ['checkup', 'womens', 'screening'].includes(x.i.kind) ? `<button class="btn primary" data-visitsheet="${x.i.id}">Prepare visit sheet</button>` : open(x) }));
  const odBlood = ins.overdue.filter(x => !isProc(x.i));
  if (odBlood.length) out.push({ key: 'odblood:' + odBlood.length, icon: '🩸', title: `Catch up on ${odBlood.length} blood test${odBlood.length === 1 ? '' : 's'}`,
    text: `${odBlood.slice(0, 4).map(x => short(x.i.name)).join(', ')}${odBlood.length > 4 ? '…' : ''} — ask for ${odBlood.length === 1 ? 'it' : 'them'} at your next blood draw.`,
    btn: '<button class="btn primary" data-go="reminders">See reminders</button>' });
  // Ideas for focus goals live in the “Your focus” card, so they aren't repeated here.
  return out;
}
function nextStepCard(ins) {
  if (startActive()) return startCard();
  if (!db.results.length && !db.visits.length) return '';
  const T = today(), snoozed = S().snoozed || {};
  const c = nextStepCandidates(ins).find(x => !(snoozed[x.key] > T));
  if (!c) {
    const up = ins.items.filter(x => x.s.due && x.s.due >= T && !['never', 'complete', 'unscheduled'].includes(x.s.state)).sort((a, b) => a.s.due.localeCompare(b.s.due))[0];
    return `<section class="card next-step calm" aria-label="Your next step"><div class="ns-ico" aria-hidden="true">🌿</div><div class="ns-main">
      <div class="ns-kicker">Your next step</div><h3>You’re all caught up</h3><p>${up ? `Nothing to do until your ${esc(lowerName(up.i.name))} on ${fmt(up.s.due)}. Enjoy it.` : 'Nothing to do right now. Enjoy it.'}</p></div></section>`;
  }
  return `<section class="card next-step" aria-label="Your next step"><div class="ns-ico" aria-hidden="true">${c.icon}</div><div class="ns-main">
    <div class="ns-kicker">Your next step</div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p>
    <div class="actions">${c.btn}<button class="btn link" data-enc="snooze:${esc(c.key)}">Not now</button></div></div></section>`;
}

/* ---------- focus goals ---------- */
const MAX_GOALS = 3;
const goals = () => (S().goals || []).filter(g => testById(g.id));
const goalable = t => t && (t.low != null || t.high != null) && resultsFor(t.id).some(r => num(r.value) != null);
function addGoal(id) {
  const t = testById(id); if (!goalable(t) || goals().some(g => g.id === id)) return;
  if (goals().length >= MAX_GOALS) { toast(`You can focus on up to ${MAX_GOALS} things — remove one first`); return; }
  const rs = resultsFor(id).filter(r => num(r.value) != null), cur = rs.at(-1), prev = rs.at(-2);
  const start = prev && offBy(t, prev.value) > offBy(t, cur.value) ? prev : cur;   // count progress you've already made
  S().goals = [...goals(), { id, start: num(start.value), startDate: start.date, since: today() }];
  save(`${label(t)} is now a focus goal`);
}
function removeGoal(id) { S().goals = goals().filter(g => g.id !== id); save('Removed from your focus'); }
function goalInfo(g) {
  const t = testById(g.id), rs = resultsFor(g.id).filter(r => num(r.value) != null); if (!t || !rs.length) return null;
  const cur = num(rs.at(-1).value), start = g.start ?? cur;
  const down = t.high != null && start > t.high, up = !down && t.low != null && start < t.low;
  const target = down ? t.high : up ? t.low : null, reached = flag(t, rs.at(-1).value) === 'ok';
  const pct = reached || target == null ? 100 : Math.max(0, Math.min(100, Math.round((down ? start - cur : cur - start) / Math.abs(start - target) * 100)));
  const d = n => { const v = Math.abs(showNum(t, n)); return +v.toFixed(v < 10 ? 1 : 0); };
  return { t, cur, start, target, reached, reachedAtStart: target == null, pct, last: rs.at(-1),
    left: target != null && !reached ? d(cur - target) : 0, moved: d(cur - start), better: down ? cur < start : up ? cur > start : false };
}
function goalsCard(ins) {
  const gs = goals(), ids = gs.map(g => g.id);
  const ideas = ins.work.filter(w => w.test && !ids.includes(w.test) && goalable(testById(w.test))).slice(0, 4);
  if (!gs.length && !ideas.length) return '';
  const unit = t => showUnit(t) && showUnit(t) !== '%' ? ' ' + showUnit(t) : showUnit(t) === '%' ? ' points' : '';
  const rows = gs.map(goalInfo).filter(Boolean).map(g => `<div class="goal${g.reached ? ' reached' : ''}" data-test="${g.t.id}">
    <div class="g-top"><b>${esc(label(g.t))}</b><span class="g-state">${g.reached ? '🎉 On target' : `${g.left}${esc(unit(g.t))} to go`}</span>
      <button class="g-x" data-enc="ungoal:${g.t.id}" aria-label="Stop focusing on ${esc(label(g.t))}" title="Remove">✕</button></div>
    <div class="g-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${g.pct}" aria-label="${esc(label(g.t))} progress"><i style="width:${Math.max(g.pct, 3)}%"></i></div>
    <div class="small muted">Now ${esc(showVal(g.t, g.last.value))}${esc(unit(g.t) === ' points' ? '%' : unit(g.t))} · target ${esc(targetText(g.t))}${g.better && g.moved ? ` · ${g.moved}${esc(unit(g.t))} better since ${fmt(gsOf(g.t.id).startDate)}` : ''}</div></div>`).join('');
  return `<section class="card sum-card goals"><div class="card-h"><h3>🎯 Your focus</h3>${gs.length ? `<span class="small muted">${gs.length} of ${MAX_GOALS}</span>` : ''}</div><div class="card-b">
    ${rows || '<p class="small" style="margin:0 0 8px">Pick one to three things to work on. You’ll see a progress bar fill up as new results come in — and a little celebration when you get there.</p>'}
    ${gs.length < MAX_GOALS && ideas.length ? `<div class="goal-add"><span class="small muted">${gs.length ? 'Add a focus:' : 'Ideas:'}</span>${ideas.map(w => `<button class="gchip" data-enc="goal:${w.test}">+ ${esc(label(testById(w.test)))}</button>`).join('')}</div>` : ''}
  </div></section>`;
}
const gsOf = id => goals().find(g => g.id === id) || {};

/* ---------- milestones and celebrations ---------- */
function milestones(ins) {
  const T = today(), first = db.results.map(r => r.date).sort()[0];
  const improved = db.tests.filter(t => typeof improvement === 'function' && improvement(t)).length;
  const fa = typeof fitnessAge === 'function' ? fitnessAge() : null;
  const reachedGoal = goals().map(goalInfo).some(g => g && g.reached && !g.reachedAtStart);
  const anyDone = myProcs().some(p => visitsFor(p.id).length);
  return [
    { key: 'first', icon: '🌱', title: 'First results tracked', text: 'Every number you add makes your summary smarter.', earned: db.results.length > 0 },
    { key: 'goal', icon: '🏆', title: 'First goal reached', text: 'You set a target and hit it.', earned: reachedGoal },
    { key: 'improved5', icon: '📈', title: 'Five markers improved', text: 'Five results have moved toward their targets.', earned: improved >= 5 },
    { key: 'younger', icon: '🏃', title: 'Fitness age younger than you', text: 'Your cardio fitness is ahead of your age.', earned: !!(fa && fa.diff < 0) },
    { key: 'uptodate', icon: '✅', title: 'Every checkup up to date', text: 'Nothing overdue — that’s the whole game.', earned: anyDone && !(ins || insights()).overdue.length },
    { key: 'year', icon: '🗓️', title: 'A full year of tracking', text: 'A year of results to learn from.', earned: !!first && days(first, T) >= 365 },
  ];
}
function winEvents() {
  const T = today(), ev = [];
  db.tests.filter(t => (t.kind === 'blood' || t.kind === 'metric') && !t.groupWith).forEach(t => {
    const last = resultsFor(t.id).at(-1); if (!last || days(last.date, T) > 60) return;
    const imp = improvement(t); if (!imp || imp.to.date !== last.date) return;
    const u = showUnit(t) && showUnit(t) !== '%' ? ' ' + showUnit(t) : showUnit(t) === '%' ? ' points' : '';
    ev.push({ key: `imp:${t.id}:${last.date}`, icon: imp.inRange ? '🎉' : '📈', title: imp.inRange ? `${label(t)} is on target!` : `${label(t)} is moving the right way`,
      text: `${imp.dir === 'down' ? 'Down' : 'Up'} ${imp.delta}${u} since ${fmt(imp.from.date)}.` });
  });
  goals().forEach(g => { const gi = goalInfo(g); if (gi && gi.reached && !gi.reachedAtStart) ev.push({ key: `goal:${g.id}:${g.since}`, icon: '🏆', title: `Goal reached: ${label(gi.t)}`, text: `Now ${showVal(gi.t, gi.last.value)} — right on target. Well done.` }); });
  milestones().filter(m => m.earned).forEach(m => ev.push({ key: 'm:' + m.key, icon: m.icon, title: `Milestone: ${m.title}`, text: m.text }));
  return ev;
}
/** After a save: celebrate anything new (once). The first time, existing wins are recorded quietly. */
function checkCelebrations() {
  if (!db || !db.settings || (typeof cloudSync !== 'undefined' && cloudSync.locked)) return;
  const s = S(), ev = winEvents();
  if (!s.celebrated) { s.celebrated = {}; ev.forEach(e => { s.celebrated[e.key] = today(); }); persist(); return; }
  const fresh = ev.filter(e => !s.celebrated[e.key]); if (!fresh.length) return;
  fresh.forEach(e => { s.celebrated[e.key] = today(); }); persist();
  showCelebration(fresh.sort((a, b) => (b.key.startsWith('goal') - a.key.startsWith('goal')) || (a.key.startsWith('m:') - b.key.startsWith('m:'))));
}
function showCelebration(list) {
  document.querySelector('.celebrate')?.remove();
  const e = list[0], more = list.length - 1, calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['var(--ok)', 'var(--accent)', 'var(--warn)', 'var(--info)', 'var(--bad)'];
  const el = document.createElement('div'); el.className = 'celebrate';
  el.innerHTML = `${calm ? '' : `<div class="confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${colors[i % 5]};animation-delay:${(i % 7) * 0.08}s;--r:${(i * 53) % 360}deg"></i>`).join('')}</div>`}
    <div class="cel-card" role="status"><span class="cel-ico" aria-hidden="true">${e.icon}</span><div><b>${esc(e.title)}</b><div class="small">${esc(e.text)}${more ? ` And ${more} more win${more > 1 ? 's' : ''} — see Going well.` : ''}</div></div>
    <button class="g-x cel-x" aria-label="Close">✕</button></div>`;
  document.body.appendChild(el);
  el.querySelector('.cel-x').addEventListener('click', () => el.remove());
  setTimeout(() => el.remove(), 7000);
}

/* ---------- year recap ---------- */
function recapSeason() {
  const T = today(), y = +T.slice(0, 4), dob = S().dob;
  if (dob) { const b = `${y}${dob.slice(4)}`; if (T >= b && days(b, T) <= 21) return { key: 'bday-' + y, why: 'Happy birthday! 🎂' }; }
  const md = T.slice(5);
  if (md >= '12-15') return { key: 'ny-' + (y + 1), why: 'Your year in health is ready' };
  if (md <= '01-15') return { key: 'ny-' + y, why: 'Your year in health is ready' };
  return null;
}
function recapCard() {
  const s = recapSeason(); if (!s || S().recapSeen === s.key || !db.results.length) return '';
  return `<section class="card next-step recap-cta" aria-label="Your year in health"><div class="ns-ico" aria-hidden="true">🎁</div><div class="ns-main">
    <div class="ns-kicker">${esc(s.why)}</div><h3>Your year in health</h3><p>What you tracked, what improved and the milestones you hit over the last 12 months.</p>
    <div class="actions"><button class="btn primary" data-enc="recap">See your year</button><button class="btn link" data-enc="recapseen:${s.key}">Hide</button></div></div></section>`;
}
function openRecap() {
  const T = today(), from = addDaysISO(T, -365);
  const rs = db.results.filter(r => r.date > from && r.date <= T);
  const imps = db.tests.filter(t => (t.kind === 'blood' || t.kind === 'metric') && !t.groupWith).map(t => ({ t, imp: improvement(t) }))
    .filter(x => x.imp && x.imp.to.date > from).sort((a, b) => (WEIGHT[b.t.id] || 1) - (WEIGHT[a.t.id] || 1));
  const visits = db.visits.filter(v => v.date > from && v.date <= T && !/Fill in past dates/.test(v.result || '')).length;
  const fa = typeof fitnessAge === 'function' ? fitnessAge() : null, ms = milestones().filter(m => m.earned);
  const stat = (n, l) => `<div class="rc-stat"><b>${n}</b><span>${l}</span></div>`;
  const s = recapSeason(); if (s) { S().recapSeen = s.key; persist(); }
  open(`${head('Your year in health', `${fmt(addDaysISO(from, 1))} – ${fmt(T)}`)}
  <div class="m-b recap">
    <div class="rc-stats">${stat(rs.length, 'results tracked')}${stat(imps.length, `marker${imps.length === 1 ? '' : 's'} improved`)}${stat(imps.filter(x => x.imp.inRange).length, 'now on target')}${stat(visits, `checkup${visits === 1 ? '' : 's'} &amp; scans`)}</div>
    ${fa ? `<p class="rc-line">🏃 Your fitness age is <b>${fa.fa}</b>${fa.diff < 0 ? ` — <b>${Math.abs(fa.diff)} years younger</b> than you.` : '.'}</p>` : ''}
    ${imps.length ? `<h3>What improved</h3><ul class="wins">${imps.slice(0, 6).map(x => `<li class="win"><span class="w-ico" aria-hidden="true">${x.imp.inRange ? '🎉' : '📈'}</span><span class="w-txt">${esc(label(x.t))} ${x.imp.dir} ${x.imp.delta}${x.imp.inRange ? ' — now on target' : ''}</span></li>`).join('')}</ul>` : ''}
    ${ms.length ? `<h3>Milestones</h3><div class="ms">${ms.map(m => `<span class="chip ms-chip"><span aria-hidden="true">${m.icon}</span> ${esc(m.title)}</span>`).join('')}</div>` : ''}
    <p class="rc-line" style="margin-top:16px">${imps.length ? 'That’s real progress. Here’s to the next year. 🥂' : 'Every result you add builds your story. Here’s to the next year. 🥂'}</p>
    <div class="actions"><button class="btn primary" data-close>Close</button></div>
  </div>`);
}

/* ---------- fewer tabs until there's something in them ---------- */
function applyTabVisibility() {
  const all = S().showAllTabs, has = kind => db.results.some(r => testById(r.testId)?.kind === kind);
  const hide = { blood: !all && !has('blood'), body: !all && !has('metric') };
  let hidden = 0;
  document.querySelectorAll('.tabs [data-view]').forEach(b => { const h = !!hide[b.dataset.view] && b.dataset.view !== view; b.hidden = h; if (h) hidden++; });
  const more = document.querySelector('.tabs [data-enc="showtabs"]'); if (more) more.hidden = !hidden;
}

/* ---------- clicks ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-enc]'); if (!b) return;
  e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  const [act, ...rest] = b.dataset.enc.split(':'), arg = rest.join(':');
  if (act === 'goal') addGoal(arg);
  else if (act === 'ungoal') removeGoal(arg);
  else if (act === 'snooze') { (S().snoozed ||= {})[arg] = addDaysISO(today(), 7); save('Okay — we’ll come back to it in a week'); }
  else if (act === 'hidestart') { S().startHidden = true; save('Hidden — you can still do these any time'); }
  else if (act === 'showtabs') { S().showAllTabs = true; save(); }
  else if (act === 'addbyhand') { S().showAllTabs = true; view = 'blood'; save(); scrollTo(0, 0); toast('Tap any test to add a result'); }
  else if (act === 'recap') openRecap();
  else if (act === 'recapseen') { S().recapSeen = arg; save(); }
}, true);
