/* Card view for Bloodwork and Body & Fitness results, plus the fitness-age calculation. Loaded before app.js. */
'use strict';

/* ---------- range bar ---------- */
function rangeDomain(t, vals) {
  const lo = t.low, hi = t.high, mn = vals.length ? Math.min(...vals) : null, mx = vals.length ? Math.max(...vals) : null;
  let a, b;
  if (lo != null && hi != null) { const s = hi - lo || 1; a = lo - s * 0.6; b = hi + s * 0.6; if (mn != null) { a = Math.min(a, mn - s * 0.1); b = Math.max(b, mx + s * 0.1); } if (lo >= 0) a = Math.max(0, a); }
  else if (hi != null) { const w = Math.max(Math.abs(hi), 1); a = hi >= 0 ? 0 : hi - w; b = hi + w * 0.6; if (mn != null) { a = Math.min(a, mn - w * 0.1); b = Math.max(b, mx + w * 0.15); } if (hi >= 0) a = Math.max(0, a); }
  else { const w = Math.max(Math.abs(lo), mx != null ? mx - lo : 0, 1); a = lo - w * 0.6; b = lo + w; if (mn != null) { a = Math.min(a, mn - w * 0.1); b = Math.max(b, mx + w * 0.15); } if (lo >= 0) a = Math.max(0, a); }
  return [a, b];
}
const fmtNum = v => Math.abs(v) >= 100 ? String(Math.round(v)) : String(+v.toFixed(Math.abs(v) >= 10 ? 0 : 2));
function rangeBar(t, rs) {
  if (t.low == null && t.high == null) return '';
  const vals = rs.map(r => num(r.value)).filter(v => v != null);
  const [a, b] = rangeDomain(t, vals), pct = v => Math.min(100, Math.max(0, (v - a) / (b - a) * 100));
  const L = t.low != null ? pct(t.low) : 0, H = t.high != null ? pct(t.high) : 100;
  const last = rs.at(-1) && num(rs.at(-1).value), prev = rs.at(-2) && num(rs.at(-2).value);
  return `<div class="rbar">
    <div class="rb-track">
      ${L > 0 ? `<div class="rb-z bad" style="left:0;width:${L}%"></div>` : ''}
      <div class="rb-z ok" style="left:${L}%;width:${H - L}%"></div>
      ${H < 100 ? `<div class="rb-z bad" style="left:${H}%;width:${100 - H}%"></div>` : ''}
      ${prev != null ? `<div class="rb-prev" style="left:${pct(prev)}%" title="Previous: ${esc(rs.at(-2).value)}"></div>` : ''}
      ${last != null ? `<div class="rb-mark ${FLAG_TONE[flag(t, rs.at(-1).value)]}" style="left:${pct(last)}%"></div>` : ''}
    </div>
    <div class="rb-ticks">${t.low != null ? `<span style="left:${L}%">${fmtNum(t.low)}</span>` : ''}${t.high != null ? `<span style="left:${H}%">${fmtNum(t.high)}</span>` : ''}</div>
  </div>`;
}

/* ---------- trend chart ---------- */
function miniTrend(t, rs) {
  const pts = rs.map(r => ({ v: num(r.value), r })).filter(p => p.v != null);
  if (pts.length < 2) return '';
  const W = 132, H = 44, P = 5, vs = pts.map(p => p.v).concat([t.low, t.high].filter(x => x != null && Math.abs(x) < Math.max(...pts.map(p => Math.abs(p.v))) * 3));
  const mn = Math.min(...vs), mx = Math.max(...vs), sp = mx - mn || 1;
  const X = i => P + i / (pts.length - 1) * (W - 2 * P), Y = v => H - P - (v - mn) / sp * (H - 2 * P);
  const band = (t.low != null || t.high != null) ? (() => { const y1 = Y(t.high != null ? Math.min(t.high, mx) : mx), y2 = Y(t.low != null ? Math.max(t.low, mn) : mn); return y2 > y1 ? `<rect x="0" width="${W}" y="${y1}" height="${y2 - y1}" fill="var(--band)" rx="3"/>` : ''; })() : '';
  return `<svg class="mtrend" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="Trend">${band}
    <polyline points="${pts.map((p, i) => `${X(i)},${Y(p.v)}`).join(' ')}" fill="none" stroke="var(--muted)" stroke-width="1.5"/>
    ${pts.map((p, i) => { const f = FLAG_TONE[flag(t, p.r.value)]; return `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${i === pts.length - 1 ? 3.6 : 2.6}" fill="${f === 'ok' ? 'var(--ok)' : f === 'bad' ? 'var(--bad)' : 'var(--accent)'}"><title>${fmt(p.r.date)}: ${esc(p.r.value)}</title></circle>`; }).join('')}</svg>`;
}

/* ---------- cards ---------- */
function resultCard(t) {
  const rs = resultsFor(t.id), r = rs.at(-1), p = rs.at(-2);
  const why = showPurpose() && t.description ? `<div class="rc-why">${esc(t.description)}</div>` : '';
  if (!r) return `<button class="rcard none" data-test="${t.id}"><div class="rc-h"><div><div class="rc-name">${esc(t.name)}</div>${why}</div><span class="pill none">Not tested</span></div>
    <div class="rc-foot">${t.optimalText ? 'Target ' + esc(t.optimalText) : ''}</div></button>`;
  const f = flag(t, r.value), tone = FLAG_TONE[f], v = num(r.value), pv = p ? num(p.value) : null;
  const change = v != null && pv != null ? (v === pv ? 'No change' : `${v > pv ? '▲' : '▼'} ${fmtNum(Math.abs(v - pv))} since ${fmtShort(p.date)}`) : '';
  const isNum = v != null && /^[<>]?\s*-?\d/.test(String(r.value).trim());
  return `<button class="rcard ${tone}" data-test="${t.id}">
    <div class="rc-h"><div><div class="rc-name">${esc(t.name)}</div>${why}</div><span class="pill ${tone}">${f === 'none' ? (isNum ? 'Recorded' : esc(r.value)) : FLAG_WORD[f]}</span></div>
    <div class="rc-main">${isNum ? `<div class="rc-val">${esc(r.value)}<small>${esc(t.unit)}</small></div>` : `<div class="rc-val text">${esc(r.value)}</div>`}${miniTrend(t, rs)}</div>
    ${rangeBar(t, rs)}
    <div class="rc-foot">${fmt(r.date)}${change ? ` · <span class="rc-chg">${change}</span>` : ''}${r.note ? ` · ${esc(r.note)}` : ''}${(() => { const c = typeof changesFor === 'function' ? changesFor(t).filter(x => x.date <= r.date).at(-1) : null; return c ? `<br><span class="chg-note">◆ ${esc(c.title)} (${fmtShort(c.date)})</span>` : ''; })()}${t.optimalText ? `<br>Your target: ${esc(t.optimalText)}` : ''}
      ${t.labText ? `<br>Lab normal: ${esc(t.labText)} ${(() => { const lf = labFlag(t, r.value); return lf ? `<span class="labtag ${lf}">${LAB_WORD[lf]}</span>` : ''; })()}` : ''}</div>
  </button>`;
}
function resultCards(kind, panels, tests) {
  return panels.map(p => {
    const ts = tests.filter(t => t.panel === p); if (!ts.length) return '';
    const latest = ts.map(t => ({ t, r: resultsFor(t.id).at(-1) })).filter(x => x.r);
    const ok = latest.filter(x => flag(x.t, x.r.value) === 'ok').length, off = latest.filter(x => ['high', 'low'].includes(flag(x.t, x.r.value))).length;
    const dots = latest.map(x => `<i class="dot ${FLAG_TONE[flag(x.t, x.r.value)]}"></i>`).join('');
    return `<section class="rpanel"><div class="rp-h"><div><h3>${esc(p)}</h3>${PANEL_INFO[p] ? `<p>${esc(PANEL_INFO[p])}</p>` : ''}</div>
      <div class="rp-score"><div class="rp-dots">${dots}</div><span>${off ? `<b class="v-high">${off}</b> outside target · ` : ''}${ok} in range${ts.length - latest.length ? ` · ${ts.length - latest.length} not tested` : ''}</span></div></div>
      <div class="rgrid">${ts.map(resultCard).join('')}</div></section>`;
  }).join('');
}

/* ---------- fitness age ---------- */
// Median (50th percentile) treadmill VO2 max by age, FRIEND registry (Kaminsky et al., Mayo Clin Proc 2015), US adults without heart disease.
const VO2_NORMS = {
  female: [[25, 37.6], [35, 30.2], [45, 26.7], [55, 23.4], [65, 20.0], [75, 18.3]],
  male: [[25, 48.0], [35, 42.4], [45, 37.8], [55, 32.6], [65, 28.2], [75, 24.4]],
};
// Norwegian HUNT study women (Loe et al., PLoS One 2013) — a much fitter reference group, used by NTNU's fitness-age calculator.
const VO2_NORMS_HUNT_F = [[25, 43.0], [35, 40.0], [45, 38.4], [55, 34.4], [65, 31.1], [75, 27.9]];
/** Age at which the median person of your sex has your VO2 max. */
function fitnessAgeFrom(vo2, norms) {
  if (vo2 == null) return null;
  for (let i = 0; i < norms.length - 1; i++) {
    const [a1, v1] = norms[i], [a2, v2] = norms[i + 1];
    if (vo2 <= v1 && vo2 >= v2) return a1 + (v1 - vo2) / (v1 - v2) * (a2 - a1);
  }
  const [[a1, v1], [a2, v2]] = vo2 > norms[0][1] ? [norms[0], norms[1]] : [norms.at(-2), norms.at(-1)];
  const age = a1 + (v1 - vo2) / (v1 - v2) * (a2 - a1);
  return Math.min(90, Math.max(18, age));
}
function medianVo2At(age, norms) {
  if (age <= norms[0][0]) { const [[a1, v1], [a2, v2]] = [norms[0], norms[1]]; return v1 + (age - a1) * (v2 - v1) / (a2 - a1); }
  for (let i = 0; i < norms.length - 1; i++) { const [a1, v1] = norms[i], [a2, v2] = norms[i + 1]; if (age <= a2) return v1 + (age - a1) * (v2 - v1) / (a2 - a1); }
  const [[a1, v1], [a2, v2]] = [norms.at(-2), norms.at(-1)]; return v1 + (age - a1) * (v2 - v1) / (a2 - a1);
}
function fitnessAge() {
  const r = resultsFor('vo2-max').at(-1), dob = db.settings.dob;
  if (!r || !dob) return null;
  const sex = db.settings.sex === 'male' ? 'male' : 'female', norms = VO2_NORMS[sex], vo2 = num(r.value);
  const fa = fitnessAgeFrom(vo2, norms), age = ageOn(dob, today()), ageAtTest = ageOn(dob, r.date);
  return { vo2, date: r.date, sex, norms, fa: Math.round(fa), faExact: fa, age, ageAtTest, diff: Math.round(fa) - age,
    hunt: sex === 'female' ? Math.round(fitnessAgeFrom(vo2, VO2_NORMS_HUNT_F)) : null,
    bio: resultsFor('bio-age').at(-1)?.value };
}
function fitnessAgeCard() {
  const F = fitnessAge();
  if (!F) return '';
  const younger = F.diff < 0, W = 560, H = 200, L = 40, R = 14, T = 14, B = 30;
  const x = a => L + (a - 20) / 60 * (W - L - R), vmax = Math.max(F.norms[0][1], F.vo2) + 14, vmin = 10;
  const y = v => T + (vmax - v) / (vmax - vmin) * (H - T - B);
  const curve = []; for (let a = 20; a <= 80; a += 1) curve.push(`${x(a)},${y(medianVo2At(a, F.norms))}`);
  const fa = Math.min(80, Math.max(20, F.faExact));
  return `<div class="card fitage"><div class="fa-grid">
    <div class="fa-nums">
      <div class="fa-label">Your fitness age</div>
      <div class="fa-big">${F.fa}</div>
      <div class="fa-vs">vs. actual age <b>${F.age}</b></div>
      <div class="pill ${younger ? 'ok' : F.diff > 0 ? 'bad' : 'none'} fa-pill">${F.diff === 0 ? 'Same as your age' : `${Math.abs(F.diff)} year${Math.abs(F.diff) === 1 ? '' : 's'} ${younger ? 'younger' : 'older'}`}</div>
      <p class="small muted" style="margin:12px 0 0">Your VO₂ max of <b>${F.vo2}</b> (${fmt(F.date)}) matches the typical ${F.sex === 'female' ? 'woman' : 'man'} aged ${F.fa}.${F.sex === 'female' && F.age !== F.ageAtTest ? ` You were ${F.ageAtTest} at the test, when it rated <b>${vo2RatingFor(F.vo2, F.ageAtTest)}</b>; now that you’re ${F.age} it rates <b>${vo2RatingFor(F.vo2, F.age)}</b> for women ${vo2Band(F.age)[0]}–${vo2Band(F.age)[1]}.` : ''}${F.bio ? ` Your logged biological-age estimate is ${esc(F.bio)}.` : ''}</p>
    </div>
    <svg class="fa-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="VO2 max by age">
      ${[20, 30, 40, 50, 60, 70, 80].map(a => `<line class="grid" x1="${x(a)}" x2="${x(a)}" y1="${T}" y2="${H - B}"/><text x="${x(a)}" y="${H - 10}" text-anchor="middle">${a}</text>`).join('')}
      ${[20, 30, 40, 50, 60].filter(v => v <= vmax - 2).map(v => `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('')}
      <polyline points="${curve.join(' ')}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/>
      <text x="${x(68)}" y="${y(medianVo2At(68, F.norms)) - 8}" text-anchor="middle">typical ${F.sex === 'female' ? 'woman' : 'man'}</text>
      <line x1="${x(Math.min(F.age, fa))}" x2="${x(Math.max(F.age, fa))}" y1="${y(F.vo2)}" y2="${y(F.vo2)}" stroke="var(--ok)" stroke-width="2"/>
      <circle cx="${x(fa)}" cy="${y(F.vo2)}" r="5" fill="var(--surface)" stroke="var(--ok)" stroke-width="2"/>
      <text x="${x(fa) - 6}" y="${y(F.vo2) - 12}" text-anchor="start" class="em" fill="var(--ok)">fitness age ${F.fa}</text>
      <circle cx="${x(F.age)}" cy="${y(F.vo2)}" r="6" fill="var(--accent)"/>
      <text x="${x(F.age) + 11}" y="${y(F.vo2) + 4}" text-anchor="start" class="em">you, age ${F.age} · VO₂ ${F.vo2}</text>
    </svg>
  </div>
  <details class="report"><summary>How this is calculated</summary><p class="small">Fitness age is the age at which a typical person of your sex has the same VO₂ max as you. It compares your measured VO₂ max with the median for each age in the FRIEND registry, a large U.S. database of treadmill tests in adults without heart disease (Kaminsky et al., 2015). The dashed line is that median; the green line shows how far your result sits from your age.</p>
  ${F.hunt != null ? `<p class="small">Results depend on the comparison group. Against Norway’s HUNT study — a much fitter population, used by NTNU’s online fitness-age calculator — your fitness age would be about <b>${F.hunt}</b>. Treat fitness age as a motivating guide, not a precise number; raising VO₂ max lowers it under either comparison.</p>` : ''}
  <p class="small muted">Retest your VO₂ max to update this. Change your birth date or sex in the Data tab.</p></details></div>`;
}

/* ---------- age helpers ---------- */
/** Exact age in whole years on a given date (birthday-aware). */
function ageOn(dob, date) {
  const [y, m, d] = dob.split('-').map(Number), [Y, M, D] = date.split('-').map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}
function nextBirthday(dob) {
  const [, m, d] = dob.split('-'), T = today(), y = Number(T.slice(0, 4));
  const b = `${y}-${m}-${d}`; return b >= T ? b : `${y + 1}-${m}-${d}`;
}
// VO2 max ratings for women by age group (Mandsager et al., JAMA Netw Open 2018).
const VO2_RATING_F = [
  [20, 29, { good: 36, excellent: 41, elite: 51, fair: 28 }], [30, 39, { good: 34, excellent: 39, elite: 49, fair: 27 }],
  [40, 49, { good: 32, excellent: 37, elite: 47, fair: 26 }], [50, 59, { good: 29, excellent: 36, elite: 46, fair: 25 }],
  [60, 69, { good: 25, excellent: 30, elite: 40, fair: 21 }], [70, 79, { good: 22, excellent: 25, elite: 36, fair: 18 }],
  [80, 89, { good: 20, excellent: 23, elite: 30, fair: 15 }],
];
function vo2Band(age) { return VO2_RATING_F.find(([a, b]) => age >= a && age <= b) || (age < 20 ? VO2_RATING_F[0] : VO2_RATING_F.at(-1)); }
function vo2RatingFor(v, age) {
  const [, , r] = vo2Band(age);
  return v >= r.elite ? 'Elite' : v >= r.excellent ? 'Excellent' : v >= r.good ? 'Good' : v >= r.fair ? 'Fair' : 'Needs focus';
}
/** Keep the VO2 max target matched to your current age group (runs on every load and when birth date changes). */
function applyAgeNorms(d) {
  const t = d.tests.find(x => x.id === 'vo2-max'); if (!t || !d.settings.dob || d.settings.sex === 'male') return;
  const age = ageOn(d.settings.dob, today()), [a, b, r] = vo2Band(age);
  t.low = r.good;
  t.optimalText = `Good ${r.good}–${r.excellent - 1} · Excellent ${r.excellent}–${r.elite - 1} (women ${a}–${b})`;
}
