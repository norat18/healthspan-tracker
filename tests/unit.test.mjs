// Unit tests for logic inside the browser files (loaded into a sandbox). Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = f => fs.readFileSync(new URL('../public/' + f, import.meta.url), 'utf8');

/* ---- merging two devices' versions (app.js) ---- */
const appSrc = read('app.js');
const mergeSrc = appSrc.slice(appSrc.indexOf('const MERGE_KEYS'), appSrc.indexOf('/** Apply a newer copy saved from another device'));
const m = { db: {} }; vm.createContext(m); vm.runInContext(mergeSrc.replace(/^const /gm, 'var ').replace('function tomb', 'var tomb = function'), m);
const base = () => ({ tests: [{ id: 't' }], procedures: [], visits: [{ id: 'v1' }], events: [], meds: [], family: [], draws: [],
  results: [{ testId: 't', date: '2026-01-01', value: '1' }], settings: { appliedImports: ['a'] } });
const keys = d => d.results.map(r => r.date + '=' + r.value).sort().join(',');

test('merge keeps additions from both devices', () => {
  const A = base(), B = base();
  A.results.push({ testId: 't', date: '2026-02-01', value: '2' }); B.results.push({ testId: 't', date: '2026-03-01', value: '3' });
  assert.equal(keys(m.mergeDb(A, B)), '2026-01-01=1,2026-02-01=2,2026-03-01=3');
});
test('merge honors a deletion made on this device', () => {
  const A = base(), B = base(); A.results.push({ testId: 't', date: '2026-04-01', value: '4' }); B.deleted = { 'results:t|2026-04-01': 1 };
  assert.equal(keys(m.mergeDb(A, B)), '2026-01-01=1');
});
test('merge: this device wins when the same item changed on both', () => {
  const A = base(), B = base(); A.results[0].value = 'remote'; B.results[0].value = 'local';
  assert.equal(keys(m.mergeDb(A, B)), '2026-01-01=local');
});
test('merge: re-adding a deleted item keeps it', () => {
  const A = base(); A.deleted = { 'results:t|2026-05-01': 1 }; const B = base(); B.results.push({ testId: 't', date: '2026-05-01', value: '5' });
  const out = m.mergeDb(A, B); assert.equal(keys(out), '2026-01-01=1,2026-05-01=5'); assert.equal(Object.keys(out.deleted).length, 0);
});

/* ---- lab report reading (labimport.js) with a made-up MyChart-style report ---- */
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(read('catalog.js'), ctx);
vm.runInContext('var db = { tests: HEALTH_SEED.tests }; function testById(id) { return db.tests.find(t => t.id === id); }', ctx);
vm.runInContext(read('labimport.js').replace("'use strict';", ''), ctx);
const SAMPLE = `Name: Test Person | DOB: 1/1/1990
LIPID PANEL
Collected on Mar 05, 2026 8:00 AM
Total Cholesterol
Normal value: <200 mg/dL
Value
185
LDL Cholesterol, Calculated
Normal value: <130 mg/dL
Value
98
Glucose
Normal range: 70 - 99 mg/dL
7070 9999
88
Hemoglobin A1C
Normal range: 4.0 - 5.6 %
44 5.65.6
5.2
Chlam Trachomatis Nucleic Acid
Normal value: NRN
Value
Negative`;

test('lab import reads values, ranges and the collection date', () => {
  const found = Object.fromEntries(ctx.parseLabText(SAMPLE).map(x => [x.testId, x]));
  assert.equal(ctx.findDate(SAMPLE), '2026-03-05');
  assert.equal(found['total-chol'].value, '185'); assert.equal(found['total-chol'].range.text, '<200');
  assert.equal(found['ldl-nih'].value, '98');
  assert.equal(found['glucose'].value, '88'); assert.deepEqual([found['glucose'].range.low, found['glucose'].range.high], [70, 99]);
  assert.equal(found['hemoglobin-a1c'].value, '5.2');
  assert.equal(found['sti-chlamydia'].value, 'Negative');
});

/* ---- units (units.js) ---- */
const u = { console }; u.window = u; vm.createContext(u);
vm.runInContext(read('units.js').replace("'use strict';", '').replace(/^const /gm, 'var '), u);
vm.runInContext('var db = { settings: { units: "si" } };', u);
const T = id => ({ id, unit: 'mg/dL' });

test('shows U.S. values in international units', () => {
  assert.equal(u.showVal(T('ldl-nih'), '111'), '2.87');
  assert.equal(u.showVal(T('glucose'), '90'), '5');
  assert.equal(u.showVal({ id: 'hemoglobin-a1c', unit: '%' }, '5.6'), '38');
  assert.equal(u.showVal(T('creatinine'), '0.68'), '60');
  assert.equal(u.showVal({ id: 'home-weight', unit: 'lbs' }, '150'), '68');
  assert.equal(u.showVal({ id: 'egfr' }, '>60'), '>60');          // no conversion defined
  assert.equal(u.showUnit(T('ldl-nih')), 'mmol/L');
});
test('values typed in international units are stored in U.S. units', () => {
  assert.equal(Math.round(+u.toStored(T('ldl-nih'), '2.87')), 111);
  assert.equal(Math.round(+u.toStored(T('glucose'), '5,0')), 90);   // comma decimals
  assert.equal(+(+u.toStored({ id: 'hemoglobin-a1c' }, '38')).toFixed(1), 5.6);
});
test('targets are shown in the chosen units', () => {
  assert.equal(u.targetText({ id: 'ldl-nih', low: null, high: 100, optimalText: '<100 ideal' }), '<2.59 mmol/L');
  assert.equal(u.targetText({ id: 'glucose', low: 70, high: 90, optimalText: '70–90' }), '3.9–5 mmol/L');
});
test('U.S. setting leaves everything unchanged', () => {
  vm.runInContext('db.settings.units = "us"', u);
  assert.equal(u.showVal(T('ldl-nih'), '111'), '111');
  assert.equal(u.toStored(T('ldl-nih'), '111'), '111');
  vm.runInContext('db.settings.units = "si"', u);
});
test('a lab report in mmol/L is recognized and converted', () => {
  assert.equal(u.reportUnitSystem(T('ldl-nih'), 'Reference range: < 3.4 mmol/L'), 'si');
  assert.equal(u.reportUnitSystem(T('ldl-nih'), 'Normal value: <160 mg/dL'), 'us');
  assert.equal(Math.round(+u.siToStored(T('ldl-nih'), '2.87')), 111);
});

/* ---- scan reports (scanreport.js) with made-up report text ---- */
const sr = { console }; sr.window = sr; vm.createContext(sr);
vm.runInContext(read('labimport.js').replace("'use strict';", ''), sr);   // loaded before scanreport.js in the app too
vm.runInContext(read('scanreport.js').replace("'use strict';", '').replace(/^const /gm, 'var '), sr);

test('MRI: normal report', () => {
  const r = sr.parseScanReport('full-body-mri', `WHOLE BODY MRI\nExam Date: January 20, 2026\nFINDINGS:\nBrain: Normal brain MRI. No acute intracranial abnormality.\nIMPRESSION:\n1. No significant abnormalities identified.\n2. Unremarkable whole-body MRI.\nRECOMMENDATIONS:\nRoutine screening.`);
  assert.equal(r.date, '2026-01-20');
  assert.equal(r.values['mri-overall'], 'No significant findings');
  assert.equal(r.values['mri-brain'], 'Normal');
  assert.match(r.summary, /No significant abnormalities/);
});
test('MRI: findings that need follow-up', () => {
  const r = sr.parseScanReport('full-body-mri', `Date of exam: 03/02/2026\nIMPRESSION:\n1. 1.2 cm left renal cyst, likely benign.\n2. 6 mm thyroid nodule; follow-up ultrasound is recommended.\nBrain: no acute findings.`);
  assert.equal(r.date, '2026-03-02');
  assert.equal(r.values['mri-overall'], 'Follow-up needed');
  assert.match(r.values['mri-findings'], /renal cyst/);
});
test('MRI: minor findings without follow-up', () => {
  const r = sr.parseScanReport('full-body-mri', `Scan date: 2026-04-01\nSUMMARY\nSmall simple liver cyst. Mild degenerative changes of the lumbar spine.`);
  assert.equal(r.values['mri-overall'], 'Minor findings — monitor');
});
test('scan and lab report dates skip the birth date', () => {
  assert.equal(sr.scanReportDate('Patient: Test Person   DOB: 1990-01-15\nWHOLE BODY MRI\nReport generated 2026-04-21'), '2026-04-21');
  assert.equal(sr.scanReportDate('Date of Birth: Jan 15, 1990\nExam Date: 04/21/2026'), '2026-04-21');
  assert.equal(sr.scanReportDate('D.O.B.: 01/15/1990\nIMPRESSION: normal'), sr.findDate('IMPRESSION: normal'));
});

test('coronary calcium score report', () => {
  const r = sr.parseScanReport('coronary-calcium-scan', `Study Date: 05/05/2035\nTotal Agatston calcium score: 0\nThis places the patient in the 0 percentile for age and sex.`);
  assert.deepEqual([r.date, r.values['cac-score'], r.values['cac-percentile']], ['2035-05-05', '0', '0']);
});
test('CIMT report', () => {
  const r = sr.parseScanReport('cimt', `Exam date: 12/09/2027\nMean CIMT: 0.55 mm. Maximum CIMT 0.81 mm.\nNo evidence of plaque. Estimated vascular age: 38 years.`);
  assert.deepEqual([r.values['cimt-mean'], r.values['cimt-max'], r.values['cimt-plaque'], r.values['cimt-arterial-age']], ['0.55', '0.81', 'None', '38']);
});
test('CCTA report', () => {
  const r = sr.parseScanReport('coronary-ct-angiogram', `IMPRESSION:\nCAD-RADS 2. Mixed plaque in the proximal LAD with 25-49% stenosis.`);
  assert.deepEqual([r.values['ccta-cad-rads'], r.values['ccta-stenosis'], r.values['ccta-plaque']], ['2', '49', 'Mixed']);
});
