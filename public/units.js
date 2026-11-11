/* Units: values are always stored in U.S. units (mg/dL, lbs…). With "International" chosen in Data → Units,
   they are shown and entered in SI units (mmol/L, kg…) and converted automatically. Loaded before app.js. */
'use strict';
const lin = (k, unit, dp) => ({ unit, dp, to: v => v * k, from: v => v / k });
const CHOL = lin(1 / 38.67, 'mmol/L', 2), LB = lin(0.45359237, 'kg', 1);
const UNIT_CONV = {
  'total-chol': CHOL, 'hdl': CHOL, 'ldl-nih': CHOL, 'non-hdl': CHOL,
  'triglycerides': lin(1 / 88.57, 'mmol/L', 2),
  'glucose': lin(1 / 18.016, 'mmol/L', 1),
  'creatinine': lin(88.42, 'µmol/L', 0),
  'bun': lin(0.357, 'mmol/L urea', 1),
  'calcium': lin(1 / 4.008, 'mmol/L', 2),
  'bilirubin': lin(17.1, 'µmol/L', 0),
  'total-protein': lin(10, 'g/L', 0), 'albumin': lin(10, 'g/L', 0),
  'hemoglobin-a1c': { unit: 'mmol/mol', dp: 0, to: v => (v - 2.15) * 10.929, from: v => v / 10.929 + 2.15 },
  'vitamin-d-total': lin(2.496, 'nmol/L', 0), 'vitamin-d3': lin(2.496, 'nmol/L', 0), 'vitamin-d2': lin(2.496, 'nmol/L', 0),
  'vitamin-b12': lin(0.738, 'pmol/L', 0), 'folate': lin(2.266, 'nmol/L', 0),
  'vitamin-b1-thiamine': lin(1, 'nmol/L', 0), 'ferritin': lin(1, 'µg/L', 0),
  'fasting-insulin': lin(6, 'pmol/L', 0), 'uric-acid': lin(59.48, 'µmol/L', 0),
  'apob': lin(0.01, 'g/L', 2), 'apoa1': lin(0.01, 'g/L', 2), 'fibrinogen': lin(0.01, 'g/L', 2),
  'dexa-total-mass': LB, 'dexa-fat-mass': LB, 'dexa-lean-mass': LB, 'dexa-bmc': LB, 'dexa-arms-lean': LB, 'dexa-trunk-lean': LB,
  'dexa-legs-lean': LB, 'dexa-visceral-fat': lin(0.45359237, 'kg', 2), 'home-weight': LB,
};
const useSI = () => typeof db !== 'undefined' && db.settings && db.settings.units === 'si';
const conv = t => (useSI() && t && UNIT_CONV[t.id]) || null;
const round = (v, dp) => String(+v.toFixed(dp));
/** Unit to show for a test. */
function showUnit(t) { const c = conv(t); return c ? c.unit : (t.unit || ''); }
/** A number (already parsed) in the display unit. */
function showNum(t, n) { const c = conv(t); return c && n != null ? c.to(n) : n; }
/** A stored value (e.g. "111", ">60", "Negative") in the display unit. */
function showVal(t, raw) {
  const c = conv(t); if (!c || raw == null) return raw;
  const m = String(raw).trim().match(/^([<>]=?)?\s*(-?\d+(?:\.\d+)?)$/); if (!m) return raw;
  return (m[1] || '') + round(c.to(parseFloat(m[2])), c.dp);
}
/** A value typed in the display unit, converted to the stored (U.S.) unit. */
function toStored(t, input) {
  const c = conv(t), s = String(input || '').trim(); if (!c || !s) return s;
  const m = s.match(/^([<>]=?)?\s*(-?\d+(?:[.,]\d+)?)$/); if (!m) return s;
  return (m[1] || '') + String(+c.from(parseFloat(m[2].replace(',', '.'))).toFixed(c.dp + 2));
}
function rangeText(t, lo, hi, fallback) {
  const c = conv(t); if (!c) return fallback || '';
  if (lo == null && hi == null) return fallback ? `${fallback} (U.S. units)` : '';
  const f = v => round(c.to(v), c.dp);
  return lo != null && hi != null ? `${f(lo)}–${f(hi)} ${c.unit}` : hi != null ? `<${f(hi)} ${c.unit}` : `>${f(lo)} ${c.unit}`;
}
/** Your target, as text in the display unit. */
const targetText = t => rangeText(t, t.low, t.high, t.optimalText);
/** The lab's normal range, as text in the display unit. */
const labRangeText = t => rangeText(t, t.labLow, t.labHigh, t.labText);
/** A value from a report in SI units, converted to the stored (U.S.) unit regardless of the display setting. */
function siToStored(t, raw) {
  const c = UNIT_CONV[t.id], s = String(raw || '').trim(); if (!c) return s;
  const m = s.match(/^([<>]=?)?\s*(-?\d+(?:[.,]\d+)?)$/); if (!m) return s;
  return (m[1] || '') + String(+c.from(parseFloat(m[2].replace(',', '.'))).toFixed(c.dp + 2));
}
/** The unit a lab report used, from its range line or value line: 'si', 'us' or null. */
function reportUnitSystem(t, text) {
  const c = UNIT_CONV[t.id]; if (!c || !text) return null;
  const s = String(text).toLowerCase();
  if (s.includes(c.unit.toLowerCase().split(' ')[0])) return 'si';
  if (t.unit && s.includes(String(t.unit).toLowerCase())) return 'us';
  return null;
}
