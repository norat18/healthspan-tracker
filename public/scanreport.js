/* Read scan reports (MRI, coronary calcium, CIMT, CCTA) and suggest values for the scan "Log results" form.
   Uses the same on-device PDF/photo reading as the lab import (labimport.js). Loaded before app.js. */
'use strict';
const MONTHS3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const isoDate = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Scan date: "Exam/Scan/Study/Service Date: 01/20/2026" or "… date: January 20, 2026", else the lab-report date rules. */
function scanReportDate(text) { return usableDate(scanReportDate0(stripBirthDates(text))); }
function scanReportDate0(text) {
  const label = '(?:exam(?:ination)?|scan|study|service|procedure|visit|report|imaging)\\s*date|date\\s*of\\s*(?:exam|service|scan|study)';
  let m = text.match(new RegExp(`(?:${label})\\s*:?\\s*(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{4})`, 'i'));
  if (m) return isoDate(m[3], m[1], m[2]);
  m = text.match(new RegExp(`(?:${label})\\s*:?\\s*([A-Za-z]{3})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  if (m && MONTHS3[m[1].toLowerCase()]) return isoDate(m[3], MONTHS3[m[1].toLowerCase()], m[2]);
  m = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return typeof findDate === 'function' ? findDate(text) : null;
}

/** The report's conclusion: the IMPRESSION / SUMMARY / CONCLUSION section (up to the next heading). */
function reportImpression(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim());
  const start = lines.findIndex(l => /^(?:final\s+)?(?:impression|impressions|summary|conclusion|conclusions|key findings|summary of findings|overall assessment)\s*:?/i.test(l));
  if (start < 0) return '';
  const out = [lines[start].replace(/^[A-Za-z ]+:\s*/, '').replace(/^(?:final\s+)?(?:impression|impressions|summary|conclusions?|key findings|summary of findings|overall assessment)\s*$/i, '')];
  for (const l of lines.slice(start + 1)) {
    if (/^[A-Z][A-Z /&-]{3,}:?$/.test(l) && !/^\d/.test(l)) break;          // next ALL-CAPS heading
    if (/^(?:recommendations?|technique|comparison|history|indication|electronically signed|signed by|dictated by|radiologist)\b/i.test(l)) break;
    out.push(l);
    if (out.join('\n').length > 1500) break;
  }
  return out.join('\n').replace(/\n{2,}/g, '\n').trim();
}
const RECOMMEND = /\b(recommend(?:ed|s|ation)?|suggest(?:ed)?|advise[d]?)\b[^.\n]{0,60}\b(follow[- ]?up|further|additional|evaluation|consult|referral|biopsy|repeat|correlation|ultrasound|ct|mri)\b|\b(?:follow[- ]?up|further|additional|evaluation|consult(?:ation)?|referral|biopsy|repeat|ultrasound|ct|mri)\b[^.\n]{0,40}\b(?:is|are|be)?\s*(?:recommended|advised|suggested|warranted)\b/i;
const NORMAL = /\b(no (?:significant|acute|concerning|suspicious|clinically significant|major|important)\b[^.\n]{0,40}\b(?:abnormalit|finding|pathology|lesion)|unremarkable|within normal limits|normal (?:study|examination|exam|scan|mri))\b/i;
const BRAIN = /\b(brain|intracranial|cerebr\w*|head)\b/i;

/** Suggested form values for a scan report: { date, summary, values: { metricId: value } } */
function parseScanReport(procId, text) {
  const t = String(text || ''), summary = reportImpression(t), values = {};
  const body = summary || t;
  if (procId === 'full-body-mri') {
    values['mri-overall'] = RECOMMEND.test(body) ? 'Follow-up needed' : NORMAL.test(body) && !/\b(cyst|nodule|lesion|mass|hemangioma|enlarg|thicken|herniat|degenerat|stenosis|aneurysm)/i.test(body.replace(NORMAL, ''))
      ? 'No significant findings' : body ? 'Minor findings — monitor' : '';
    const brainLines = t.split(/\r?\n/).filter(l => BRAIN.test(l));
    const brainText = brainLines.join(' ');
    if (brainLines.length) values['mri-brain'] = RECOMMEND.test(brainText) ? 'Follow-up needed'
      : /\b(normal|unremarkable|no acute|no (?:significant|intracranial)|within normal limits)\b/i.test(brainText) ? 'Normal' : 'Minor findings';
    const items = (summary || '').split(/\n/).map(l => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').trim()).filter(l => l.length > 3);
    if (items.length) values['mri-findings'] = items.slice(0, 12).join('\n');
  }
  if (procId === 'coronary-calcium-scan') {
    let m = t.match(/(?:total\s+)?(?:agatston|coronary\s+(?:artery\s+)?calcium|calcium|cac)\s*(?:score)?\s*(?:\(agatston\))?\s*[:=]?\s*(\d{1,4}(?:\.\d)?)\b/i);
    if (m) values['cac-score'] = String(Math.round(+m[1]));
    m = t.match(/(\d{1,3})(?:st|nd|rd|th)?\s*(?:%ile|percentile)/i);
    if (m && +m[1] <= 100) values['cac-percentile'] = m[1];
  }
  if (procId === 'cimt') {
    let m = t.match(/(?:mean|average)[^\n\d]{0,40}?(\d\.\d{1,3})\s*mm/i); if (m) values['cimt-mean'] = m[1];
    m = t.match(/(?:max(?:imum)?|thickest|greatest)[^\n\d]{0,40}?(\d\.\d{1,3})\s*mm/i); if (m) values['cimt-max'] = m[1];
    if (/\bno\s+(?:evidence\s+of\s+)?(?:atherosclerotic\s+)?plaques?\b|\bplaque[s]?\s*:\s*(?:none|no)\b/i.test(t)) values['cimt-plaque'] = 'None';
    else if (/\bplaques?\b[^.\n]{0,30}\b(present|seen|identified|noted|detected)\b|\b(?:small|mild|moderate|calcified|soft)\s+plaques?\b/i.test(t)) values['cimt-plaque'] = 'Present';
    m = t.match(/(?:arterial|vascular|carotid)\s*age[^\d\n]{0,25}(\d{2,3})/i); if (m) values['cimt-arterial-age'] = m[1];
  }
  if (procId === 'coronary-ct-angiogram') {
    let m = t.match(/cad[\s-]*rads\s*(?:score|category)?\s*[:=]?\s*([0-5])/i); if (m) values['ccta-cad-rads'] = m[1];
    const sten = [...t.matchAll(/(\d{1,3})\s*%\s*(?:diameter\s*)?(?:stenosis|narrowing|luminal)/gi)].map(x => +x[1]).filter(n => n <= 100);
    const ranges = [...t.matchAll(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*%\s*(?:stenosis|narrowing)/gi)].map(x => +x[2]);
    const all = [...sten, ...ranges]; if (all.length) values['ccta-stenosis'] = String(Math.max(...all));
    else if (/\bno\s+(?:significant\s+)?(?:coronary\s+)?(?:stenosis|plaque|disease)\b/i.test(t)) values['ccta-stenosis'] = '0';
    if (/\bno\s+(?:coronary\s+)?plaque\b/i.test(t)) values['ccta-plaque'] = 'None';
    else if (/\bmixed\s+plaque/i.test(t)) values['ccta-plaque'] = 'Mixed';
    else if (/\b(non-?calcified|soft)\s+plaque/i.test(t)) values['ccta-plaque'] = 'Non-calcified (soft)';
    else if (/\bcalcified\s+plaque/i.test(t)) values['ccta-plaque'] = 'Calcified';
  }
  return { date: scanReportDate(t), summary, values };
}

/** Read a report file and fill the open scan form. */
async function fillScanForm(procId, file) {
  const form = document.getElementById('scanform'), status = msg => { const el = document.getElementById('scanstatus'); if (el) el.textContent = msg; };
  try {
    status(`Reading ${file.name}…`);
    let text;
    if (/^image\//.test(file.type) || /\.(jpe?g|png|heic|webp|gif|bmp|tiff?)$/i.test(file.name)) text = await ocrImage(file, file.name, status);
    else if (/\.txt$/i.test(file.name)) text = await file.text();
    else text = (await pdfText(file, status)).text;
    if (ocrWorker) { ocrWorker.terminate(); ocrWorker = null; }
    applyScanText(procId, text, form, file.name);
  } catch (e) { console.error(e); status(`Couldn’t read ${file.name}: ${e.message || 'unknown error'}`); }
}
/** Put suggested values into the form; nothing is saved until "Save results". */
function applyScanText(procId, text, form, fileName) {
  const r = parseScanReport(procId, text), filled = [];
  if (r.date) { form.elements.__date.value = r.date; filled.push('date'); }
  for (const [id, v] of Object.entries(r.values)) {
    const el = form.elements[id]; if (!el || v === '' || v == null) continue;
    el.value = v; el.classList.add('filled'); filled.push(SCANS[procId].metrics.find(m => m.id === id)?.name.toLowerCase() || id);
  }
  if (r.summary) { form.elements.__summary.value = r.summary; filled.push('summary'); }
  else if (!form.elements.__summary.value) { form.elements.__summary.value = String(text).trim().slice(0, 1200); filled.push('report text'); }
  const el = document.getElementById('scanstatus');
  if (el) el.innerHTML = filled.length ? `<b>Filled in from ${esc(fileName)}:</b> ${esc(filled.join(', '))}. Check everything, then save.` : `Couldn’t find results in ${esc(fileName)} — enter them by hand.`;
  return r;
}
