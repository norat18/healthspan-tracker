/* Import lab results from a PDF (text-based, e.g. MyChart "Test Details") or pasted text.
   Values are always shown for review before saving. Scanned/image PDFs have no text and can't be read. */
'use strict';
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
// Extra names labs use for tests already in the tracker (matched after removing anything in parentheses).
const LAB_ALIASES = {
  'total-chol': ['Total Cholesterol', 'Cholesterol, Total', 'Cholesterol'], 'triglycerides': ['Triglyceride', 'Triglycerides'],
  'hdl': ['HDL Cholesterol', 'HDL-C'], 'non-hdl': ['Non-HDL Cholesterol'], 'ldl-nih': ['LDL Cholesterol, Calculated', 'LDL Cholesterol', 'LDL-C', 'LDL Calculated'],
  'chol-hdl': ['Cholesterol/HDL Ratio', 'Chol/HDLC Ratio', 'Total Cholesterol/HDL Ratio'],
  'co2-bicarbonate': ['Carbon Dioxide, Total', 'Carbon Dioxide', 'CO2', 'Bicarbonate'], 'bun': ['Urea Nitrogen', 'BUN', 'Blood Urea Nitrogen'],
  'egfr': ['eGFR by CKD-EPI 2021', 'eGFR', 'Estimated GFR'], 'bilirubin': ['Total Bilirubin', 'Bilirubin, Total', 'Bilirubin'],
  'alkaline-phosphatase': ['Alkaline Phosphatase', 'ALP'], 'ast': ['AST', 'AST (SGOT)'], 'alt': ['ALT', 'ALT (SGPT)'],
  'hemoglobin-a1c': ['Hemoglobin A1C', 'HbA1c', 'A1C'], 'lp-a': ['Lipoprotein(a)', 'Lipoprotein (a)', 'Lp(a)'],
  'hs-crp': ['C-Reactive Protein', 'hs-CRP', 'CRP, High Sensitivity', 'High Sensitivity CRP'], 'fasting-insulin': ['Insulin', 'Insulin, Fasting'],
  'total-protein': ['Total Protein', 'Protein, Total'], 'vitamin-d-total': ['Vitamin D, 25-Hydroxy', '25-Hydroxy Vitamin D', 'Vitamin D 25-OH', 'Vitamin D Total'],
  'vitamin-b12': ['Vitamin B12', 'Cobalamin'], 'folate': ['Folate', 'Folic Acid'], 'tsh': ['TSH', 'Thyroid Stimulating Hormone'],
  'sti-chlamydia': ['Chlam Trachomatis Nucleic Acid', 'Chlamydia trachomatis'], 'sti-gc': ['N.Gonorrhoeae(GC) Nucleic Acid', 'N. gonorrhoeae', 'Neisseria gonorrhoeae'],
  'sti-rpr': ['RPR Screen, Qualitative', 'RPR'], 'hiv': ['HIV-1/2 Antigen/Antibody', 'HIV Screen', 'HIV 1/2 Ab/Ag'], 'hep-c': ['Hepatitis C Antibody', 'HCV Antibody'],
};
const normName = s => String(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function aliasIndex() {
  const m = new Map();
  db.tests.filter(t => t.kind === 'blood').forEach(t => [t.name, ...(LAB_ALIASES[t.id] || [])].forEach(a => { const k = normName(a); if (k && !m.has(k)) m.set(k, t.id); }));
  Object.entries(LAB_ALIASES).forEach(([id, as]) => as.forEach(a => { const k = normName(a); if (k) m.set(k, id); }));
  return m;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function findDate(text) {
  const g = text.match(/(?:measurement|test|scan|exam|collection|report)\s*date\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i) || text.match(/(?:scan|test)\s*(?:performed|done)\s*on\s*([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s*(\d{4})/i)
    || text.match(/test\s*date\s*:?\s*([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s*(\d{4})/i);
  if (g) return isNaN(g[1]) ? `${g[3]}-${String(MONTHS[g[1].toLowerCase().slice(0, 3)]).padStart(2, '0')}-${g[2].padStart(2, '0')}` : `${g[3]}-${g[1].padStart(2, '0')}-${g[2].padStart(2, '0')}`;
  const m = text.match(/(?:Collected on|Collection date:?)\s+([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s+(\d{4})/) || text.match(/(?:Collected|Collection Date)[^0-9]{0,20}(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  if (isNaN(m[1])) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
const SKIP = /^(normal|value|please|prediabetes|diabetes|\(note\)|testing methodology|reference|note:|units?|flag|range|result)/i;
const isMarkerLine = l => { const toks = l.trim().split(/\s+/); return toks.length >= 2 && toks.every(t => t.length % 2 === 0 && t.slice(0, t.length / 2) === t.slice(t.length / 2)); };
const VALUE = /^([<>]=?\s*)?-?\d+(\.\d+)?$/;
const QUAL = /^(negative|positive|non-?reactive|reactive|detected|not detected|normal|abnormal)$/i;
/** "Normal range: 3.6 - 5.2 meq/L" or "Normal value: <75 nmol/L" → { low, high, text } */
function parseRange(line) {
  const m = line.match(/^(?:normal|reference)\s*(?:range|value|interval)s?\s*:?\s*(.+)$/i); if (!m) return null;
  const t = m[1].trim(), unitless = t.replace(/\s*[a-zµ%\[\]\/._0-9]*[a-zµ%][a-zµ%\[\]\/._0-9]*$/i, '').trim();
  let r = unitless.match(/^(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?)$/);
  if (r) return { low: +r[1], high: +r[2], text: `${r[1]}–${r[2]}` };
  r = unitless.match(/^([<>]=?|≤|≥)\s*(-?\d+(?:\.\d+)?)$/);
  if (r) return r[1].startsWith('<') || r[1] === '≤' ? { low: null, high: +r[2], text: `<${r[2]}` } : { low: +r[2], high: null, text: `>${r[2]}` };
  if (/^[a-z ]+$/i.test(t)) return { low: null, high: null, text: t };     // e.g. "NREAC", "Negative"
  return null;
}
/** Parse plain text into [{testId, value, line, range}]. */
function parseLabText(text) {
  const idx = aliasIndex(), lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean), out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const id = idx.get(normName(lines[i])); if (!id || out.has(id)) continue;
    let range = null;
    for (let j = i + 1; j < Math.min(lines.length, i + 26); j++) {
      const l = lines[j];
      if (idx.has(normName(l))) break;
      if (!range) { range = parseRange(l); if (range) range.line = l; }
      if (SKIP.test(l) || isMarkerLine(l)) continue;
      const v = l.replace(/\s*(mg\/dl|g\/dl|meq\/l|u\/l|ng\/ml|pg\/ml|nmol\/l|mg\/l|%|u\[iu\]\/ml|uiu\/ml|ml\/min.*)$/i, '').trim();
      if (VALUE.test(v) || QUAL.test(v)) { out.set(id, { testId: id, value: v.replace(/\s+/g, ''), source: lines[i], range }); break; }
    }
  }
  return [...out.values()];
}
/* ---------- DEXA, VO2 max and metabolism reports ---------- */
// Each entry: test id, label pattern, value pattern, plausible range (in stored units), unit handling.
const WEIGHT_UNIT = '(lbs?|ibs|1bs|kg|g)\\b';
const METRIC_PATTERNS = [
  ['dexa-total-mass', 'total\\s*(?:body\\s*)?mass', '\\d{2,3}(?:\\.\\d)?', [60, 600], WEIGHT_UNIT],
  ['dexa-lean-mass', 'lean\\s*(?:body\\s*)?mass(?!\\s*(?:index|-))', '\\d{2,3}(?:\\.\\d)?', [30, 400], WEIGHT_UNIT],
  ['dexa-fat-mass', '(?<!lean\\s)fat\\s*mass(?!\\s*(?:index|-))', '\\d{1,3}(?:\\.\\d)?', [3, 400], WEIGHT_UNIT],
  ['dexa-body-fat-pct', '(?:total\\s*)?body\\s*fat(?:\\s*%|\\s*percent(?:age)?)?(?!\\s*-)', '\\d{1,2}(?:\\.\\d)?', [3, 70], '(%)'],
  ['dexa-visceral-fat', 'visceral\\s*(?:adipose\\s*tissue|fat)(?:\\s*\\(vat\\))?(?:\\s*mass)?', '\\d{1,4}(?:\\.\\d{1,2})?', [0.01, 15], WEIGHT_UNIT],
  ['dexa-ag-ratio', '(?:a\\s*\\/\\s*g|android\\s*\\/?\\s*(?:to\\s*)?gynoid)\\s*ratio', '\\d\\.\\d{1,2}', [0.3, 2]],
  ['dexa-almi', '\\balmi\\b', '\\d{1,2}\\.\\d{1,2}', [3, 15]],
  ['dexa-ffmi', '\\bffmi\\b', '\\d{1,2}\\.\\d{1,2}', [9, 40]],
  ['dexa-fmi', '(?<![a-z])fmi\\b', '\\d{1,2}\\.\\d{1,2}', [1, 30]],
  ['dexa-t-score', 't\\s*-?\\s*score', '-?\\d\\.\\d{1,2}', [-6, 6]],
  ['dexa-z-score', 'z\\s*-?\\s*score', '-?\\d\\.\\d{1,2}', [-6, 6]],
  ['dexa-bmc', '(?:bone\\s*mineral\\s*content|\\bbmc\\b)', '\\d{1,2}(?:\\.\\d{1,2})?', [1, 20], WEIGHT_UNIT],
  ['dexa-bmd-total', 'total\\s*body\\s*(?:bmd)?', '[0-2]\\.?\\d{3}', [0.5, 2]],
  ['vo2-max', 'vo\\s*[,;:.]?\\s*[2₂]?\\s*[,;:.]?\\s*max(?!\\s*(?:heart|hr|development))(?:\\s*is)?', '\\d{2}(?:\\.\\d)?', [8, 95], '(m[li]\\s*\\/\\s*kg)'],
  ['resting-hr', '(?:resting\\s*heart\\s*rate|\\brhr\\b)', '\\d{2,3}', [30, 130], '(bpm)'],
  ['rmr', '(?:resting\\s*metabolic\\s*rate|\\brmr\\b)', '\\d,?\\d{3}', [700, 4500], '(kcal|cal)?'],
  ['rer', '\\brer\\b', '[01]\\.\\d{2}', [0.6, 1.3]],
  ['vo2-max-hr', 'max(?:imum)?\\s*(?:heart\\s*rate|hr)', '\\d{3}', [120, 230], '(bpm)?'],
  ['vo2-vt1', '\\bvt\\s*[1l]\\b', '\\d{3}', [80, 220], '(bpm)'],
  ['vo2-vt2', '\\bvt\\s*2\\b', '\\d{3}', [80, 230], '(bpm)'],
  ['bio-age', 'biological\\s*age', '\\d{2}', [10, 110], '(years|yrs)?'],
];
/** Convert a matched value to stored units, fixing dropped decimal points (e.g. "332%" → 33.2). */
function metricValue(raw, unit, [lo, hi]) {
  let v = parseFloat(String(raw).replace(',', ''));
  const u = (unit || '').toLowerCase();
  if (u === 'kg') v = v / 0.45359237; else if (u === 'g') v = v / 453.59237;
  if (!(v >= lo && v <= hi) && !/[.,]/.test(raw)) for (const d of [10, 100, 1000]) if (v / d >= lo && v / d <= hi) { v = v / d; break; }
  if (!(v >= lo && v <= hi)) return null;
  return String(+v.toFixed(u === 'kg' || u === 'g' ? 1 : 3));
}
/** Find DEXA / fitness results in report text: "Label: value unit" on a line, or a "Label Change Target" row
 *  followed by a row of values (DexaFit style). The most common reading wins. */
function parseMetricText(text) {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean), votes = {};
  const vote = (id, v, src, w = 1) => { if (v == null) return; (votes[id] ||= []).push({ v, src, w }); };
  // Between a label and its value only punctuation or a few linking words are allowed (skips explanatory prose).
  const FILLER = /^[\s:=,.()%*\-–]*(?:(?:is|was|at|of\s+your|total|=)\s*)?[\s:=,.()\-–]*$/i;
  const LOOK_BELOW = new Set(['dexa-ag-ratio', 'dexa-bmc']);
  // Words that mean a number is an example, goal or comparison rather than the person's result.
  const PROSE = /\b(if|lose|gain|than|between|ideal|average|target|peers?|goal|should|aim|above|below|under|over|up to|example|e\.g)\b/i;
  const NOT_WEIGHT = '(?!\\s*(?:lbs?|ibs|kg|%))';
  for (const [id, label, val, range, unit] of METRIC_PATTERNS) {
    const re = new RegExp(`(${label})([^\\d\\n]{0,18}?)(${val})\\s*${unit || ''}`, 'gi');
    lines.forEach((l, i) => {
      let hit = false;
      for (const m of l.matchAll(re)) {
        if (!FILLER.test(m[2]) || (/^[.,]/.test(m[2]) && !/\s$/.test(m[1]))) continue;   // "lean mass. 92" = end of a sentence
        const colon = /[:=]/.test(m[2]);
        if (!colon && PROSE.test(l.slice(Math.max(0, m.index - 30), m.index))) continue;
        hit = true; vote(id, metricValue(m[3], unit ? m[4] : '', range), l, colon ? 3 : 1);
      }
      // Heading with the value on one of the next lines (e.g. "A/G RATIO" … "0.98")
      if (!hit && LOOK_BELOW.has(id) && new RegExp(label, 'i').test(l)) {
        for (const n of lines.slice(i + 1, i + 5)) {
          if (PROSE.test(n)) continue;
          const m = n.match(new RegExp(`(?:^|\\s)(${val})${unit ? '\\s*' + unit : NOT_WEIGHT}(?:\\s|$)`, 'i'));
          if (m) { vote(id, metricValue(m[1], unit ? m[2] : '', range), `${l} … ${n}`); break; }
        }
      }
    });
    // "<Label> Change Target" header → values on the next line (DexaFit style)
    lines.forEach((l, i) => {
      if (!/change\s+target/i.test(l) || !lines[i + 1]) return;
      const heads = l.split(/change\s+target/i).map(x => x.trim()).filter(Boolean);
      const k = heads.findIndex(h => new RegExp(`${label}\\s*$`, 'i').test(h));
      if (k < 0) return;
      const nums = [...lines[i + 1].matchAll(new RegExp(`(${val})\\s*${unit || ''}`, 'gi'))];
      const m = nums[heads.length > 1 ? Math.floor(k * nums.length / heads.length) : 0];
      if (m) vote(id, metricValue(m[1], unit ? m[2] : '', range), `${heads[k]}: ${lines[i + 1]}`, 2);
    });
  }
  return Object.entries(votes).map(([testId, vs]) => {
    const score = {}; vs.forEach(x => score[x.v] = (score[x.v] || 0) + x.w);
    const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
    return { testId, value: best, source: vs.find(x => x.v === best).src.slice(0, 80), metric: true };
  });
}
/* ---------- reading files (text PDFs directly; scanned PDFs and photos with on-device text recognition) ---------- */
const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/';
const TESS_CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
const TESS_LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
let ocrWorker = null, ocrProgress = null;
const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the reader (needs an internet connection)')); document.head.appendChild(s); });
async function getOcr() {
  if (!window.Tesseract) await loadScript(TESS + 'tesseract.min.js');
  if (!ocrWorker) ocrWorker = await window.Tesseract.createWorker('eng', 1, { workerPath: TESS + 'worker.min.js', corePath: TESS_CORE, langPath: TESS_LANG,
    logger: m => { if (ocrProgress && m.status === 'recognizing text') ocrProgress(m.progress); } });
  return ocrWorker;
}
/** Recognize text in an image or canvas. Runs entirely in this browser — the picture is never uploaded. */
async function ocrImage(img, label, status) {
  const w = await getOcr();
  ocrProgress = p => status(`${label} — recognizing text ${Math.round(p * 100)}%`);
  const { data } = await w.recognize(img); ocrProgress = null;
  return data.text;
}
async function pdfText(file, status) {
  if (!window.pdfjsLib) {
    await loadScript(PDFJS + 'pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise; const lines = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    // Keep the PDF's own reading order (works for two-column layouts like MyChart), breaking lines where the PDF does.
    let cur = '';
    (await (await pdf.getPage(n)).getTextContent()).items.forEach(it => {
      cur += it.str;
      if (it.hasEOL) { lines.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; }
    });
    if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim());
  }
  const text = lines.join('\n');
  if (text.replace(/\s/g, '').length >= 60 * pdf.numPages) return { text, ocr: false };
  // Little or no text: it's a scanned or image-only PDF. Render each page and recognize the text.
  const out = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    status(`${file.name}: page ${n} of ${pdf.numPages} — preparing`);
    const page = await pdf.getPage(n), base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 2600 / Math.max(base.width, base.height) * 1.0) });
    const canvas = document.createElement('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    out.push(await ocrImage(canvas, `${file.name}: page ${n} of ${pdf.numPages}`, status));
  }
  return { text: out.join('\n'), ocr: true };
}

let labFound = [];
function openLabImport() {
  labFound = [];
  open(`${head('Import results', 'Lab, DEXA or fitness reports — you review everything before it’s saved')}
  <div class="m-b">
    <label class="drop" id="dropzone"><input type="file" id="labfiles" accept="application/pdf,.pdf,.txt,image/*" multiple hidden>
      <b>Drop PDFs or photos of reports here</b> or click to choose<br><span class="small muted">Text PDFs (like MyChart) are read exactly. Scanned PDFs and photos are read with text recognition that runs on your device — nothing is uploaded — so double-check those values.</span></label>
    <div id="labstatus" class="small muted" role="status" style="margin-top:8px"></div>
    <details class="report" style="margin-top:12px"><summary>Or paste text from a report</summary>
      <textarea id="labpaste" placeholder="Copy the results page from MyChart and paste it here"></textarea>
      <button class="btn" id="labparse" type="button" style="margin-top:8px">Read pasted text</button></details>
    <div id="labreview"></div>
  </div>`);
  const dz = $('#dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('over'); readLabFiles([...e.dataTransfer.files]); });
  $('#labfiles').addEventListener('change', e => readLabFiles([...e.target.files]));
  $('#labparse').addEventListener('click', () => addLabText($('#labpaste').value, 'Pasted text'));
}
async function readLabFiles(files) {
  const status = msg => { const el = document.getElementById('labstatus'); if (el) el.textContent = msg; };
  for (const f of files) {
    try {
      status(`Reading ${f.name}…`);
      let r;
      if (/\.txt$/i.test(f.name)) r = { text: await f.text(), ocr: false };
      else if (/^image\//.test(f.type) || /\.(jpe?g|png|heic|webp|gif|bmp|tiff?)$/i.test(f.name)) r = { text: await ocrImage(f, f.name, status), ocr: true };
      else r = await pdfText(f, status);
      addLabText(r.text, f.name, r.ocr);
    } catch (e) { console.error(e); labFound.push({ file: f.name, error: e.message || 'Could not read this file' }); renderLabReview(); }
  }
  status('');
  if (ocrWorker) { ocrWorker.terminate(); ocrWorker = null; }
}
function addLabText(text, file, ocr = false) {
  const date = findDate(text), found = [...parseLabText(text), ...parseMetricText(text)];
  if (!found.length) labFound.push({ file, error: text.trim().length < 40 ? 'No text found in this file.' : 'No recognizable results found — you can add values by hand below.' });
  found.forEach(f => { labFound = labFound.filter(x => !(x.testId === f.testId && x.date === date)); labFound.push({ ...f, file, date, ocr }); });
  renderLabReview();
}
function renderLabReview() {
  const ok = labFound.filter(x => !x.error), bad = labFound.filter(x => x.error);
  const dateGuess = ok.find(x => x.date)?.date || today();
  const addable = db.tests.filter(t => (t.kind === 'blood' || t.kind === 'metric') && !ok.some(x => x.testId === t.id)).sort((a, b) => a.name.localeCompare(b.name));
  $('#labreview').innerHTML = `${bad.map(b => `<div class="verdict ${b.error.startsWith('No recognizable') ? 'none' : 'bad'}" style="margin-top:10px"><b>${esc(b.file)}:</b> ${esc(b.error)}</div>`).join('')}
  ${ok.length || bad.length ? `<h3>${ok.length ? `Found ${ok.length} result${ok.length === 1 ? '' : 's'} — check them` : 'Add results'}</h3>
  <form id="labsave"><div class="tablewrap"><table><thead><tr><th></th><th>Test</th><th>Value</th><th>Date</th><th>Lab normal range</th><th>Last on file</th></tr></thead><tbody>
  ${ok.map((x, i) => { const t = testById(x.testId), last = resultsFor(x.testId).at(-1), dup = last && last.date === x.date && last.value === x.value;
    return `<tr><td><input type="checkbox" name="use${i}" ${dup ? '' : 'checked'} aria-label="Save ${esc(t.name)}"></td><td><b>${esc(t.name)}</b>${x.ocr ? ' <span class="labtag high" title="Read from an image — please double-check">check</span>' : ''}<div class="small muted">read as “${esc(x.source)}” · ${esc(x.file)}</div></td>
      <td><input name="val${i}" value="${esc(x.value)}" style="width:90px" aria-label="Value"> <span class="small muted">${esc(t.unit)}</span></td>
      <td><input type="date" name="date${i}" value="${x.date || ''}" required aria-label="Date"></td>
      <td class="small">${x.range ? `<label class="check"><input type="checkbox" name="rng${i}" checked> ${esc(x.range.text)}</label>` : '<span class="muted">—</span>'}</td>
      <td class="small muted">${last ? `${esc(last.value)} (${fmtShort(last.date)})${dup ? ' · already saved' : ''}` : '—'}</td></tr>`; }).join('')}
  </tbody></table></div>
  <div class="toolbar" style="margin:10px 0 0"><span class="small"><b>Add a value it missed:</b></span>
    <select id="addmiss" aria-label="Test to add"><option value="">Choose a test…</option>${addable.map(t => `<option value="${t.id}">${esc(t.name)}${t.unit ? ` (${esc(t.unit)})` : ''}</option>`).join('')}</select>
    <input id="addmissval" placeholder="Value" style="width:90px" aria-label="Value"><input id="addmissdate" type="date" value="${dateGuess}" aria-label="Date"><button type="button" class="btn" id="addmissbtn">Add</button></div>
  <div class="actions" style="margin-top:12px"><button class="btn primary" ${ok.length ? '' : 'disabled'}>Save checked results</button><span class="small muted">Results already on file are unchecked.</span></div></form>` : ''}`;
  $('#addmissbtn')?.addEventListener('click', () => {
    const id = $('#addmiss').value, v = $('#addmissval').value.trim(), d = $('#addmissdate').value;
    if (!id || !v) { toast('Choose a test and enter a value'); return; }
    labFound.push({ testId: id, value: v, date: d, source: 'added by you', file: 'manual', metric: testById(id)?.kind === 'metric' }); renderLabReview();
  });
  $('#labsave')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target); let n = 0; const bloodDates = new Set();
    ok.forEach((x, i) => {
      if (!f.get('use' + i)) return; const v = (f.get('val' + i) || '').trim(), d = f.get('date' + i); if (!v || !d) return;
      const t0 = testById(x.testId), si = x.range && reportUnitSystem(t0, x.range.line) === 'si';
      upsertResult(x.testId, d, si ? siToStored(t0, v) : v); const t = t0; if (t) t.nextDue = null; n++;
      if (t && t.kind === 'blood') bloodDates.add(d);
      if (t && x.range && f.get('rng' + i) && (x.range.low != null || x.range.high != null)) {
        const cv = n => n == null ? null : (si ? +siToStored(t, String(n)) : n);
        const lo = cv(x.range.low), hi = cv(x.range.high);
        Object.assign(t, { labLow: lo, labHigh: hi, labText: si ? (lo != null && hi != null ? `${lo}–${hi}` : hi != null ? `<${hi}` : `>${lo}`) : x.range.text });
      }
    });
    db.draws ||= []; bloodDates.forEach(d => { if (!db.draws.some(x => x.date === d)) db.draws.push({ id: 'draw-' + d, date: d, note: 'Imported from lab report.' }); });
    close(); save(`Saved ${n} result${n === 1 ? '' : 's'}`);
  });
}
