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
  const m = text.match(/(?:Collected on|Collection date:?)\s+([A-Z][a-z]{2})\w*\s+(\d{1,2}),\s+(\d{4})/) || text.match(/(?:Collected|Collection Date)[^0-9]{0,20}(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  if (isNaN(m[1])) return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}
const SKIP = /^(normal|value|please|prediabetes|diabetes|\(note\)|testing methodology|reference|note:|units?|flag|range|result)/i;
const isMarkerLine = l => { const toks = l.trim().split(/\s+/); return toks.length >= 2 && toks.every(t => t.length % 2 === 0 && t.slice(0, t.length / 2) === t.slice(t.length / 2)); };
const VALUE = /^([<>]=?\s*)?-?\d+(\.\d+)?$/;
const QUAL = /^(negative|positive|non-?reactive|reactive|detected|not detected|normal|abnormal)$/i;
/** Parse plain text into [{testId, value, line}]. */
function parseLabText(text) {
  const idx = aliasIndex(), lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean), out = new Map();
  for (let i = 0; i < lines.length; i++) {
    const id = idx.get(normName(lines[i])); if (!id || out.has(id)) continue;
    // a result name can be followed by the value on the same line ("LDL Cholesterol 111 mg/dL")
    for (let j = i + 1; j < Math.min(lines.length, i + 26); j++) {
      const l = lines[j];
      if (idx.has(normName(l))) break;
      if (SKIP.test(l) || isMarkerLine(l)) continue;
      const v = l.replace(/\s*(mg\/dl|g\/dl|meq\/l|u\/l|ng\/ml|pg\/ml|nmol\/l|mg\/l|%|u\[iu\]\/ml|uiu\/ml|ml\/min.*)$/i, '').trim();
      if (VALUE.test(v) || QUAL.test(v)) { out.set(id, { testId: id, value: v.replace(/\s+/g, ''), source: lines[i] }); break; }
    }
  }
  return [...out.values()];
}
async function pdfText(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF reader (needs internet)')); document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; const lines = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    // Keep the PDF's own reading order (works for two-column layouts like MyChart), breaking lines where the PDF does.
    let cur = '';
    (await (await pdf.getPage(n)).getTextContent()).items.forEach(it => {
      cur += it.str;
      if (it.hasEOL) { lines.push(cur.replace(/\s+/g, ' ').trim()); cur = ''; }
    });
    if (cur.trim()) lines.push(cur.replace(/\s+/g, ' ').trim());
  }
  return lines.join('\n');
}

let labFound = [];
function openLabImport() {
  labFound = [];
  open(`${head('Import lab report', 'PDF from MyChart or pasted text — you review everything before it’s saved')}
  <div class="m-b">
    <label class="drop" id="dropzone"><input type="file" id="labfiles" accept="application/pdf,.pdf,.txt" multiple hidden>
      <b>Drop lab PDFs here</b> or click to choose<br><span class="small muted">Works with text PDFs like MyChart “Test Details”. Scanned (image-only) reports can’t be read — enter those by hand.</span></label>
    <details class="report" style="margin-top:12px"><summary>Or paste text from a lab report</summary>
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
  for (const f of files) {
    try { const text = /\.txt$/i.test(f.name) ? await f.text() : await pdfText(f); addLabText(text, f.name); }
    catch (e) { labFound.push({ file: f.name, error: e.message || 'Could not read this file' }); renderLabReview(); }
  }
}
function addLabText(text, file) {
  const date = findDate(text), found = parseLabText(text);
  if (!found.length) labFound.push({ file, error: text.trim().length < 40 ? 'No text found — this looks like a scanned report.' : 'No recognizable results found.' });
  found.forEach(f => { labFound = labFound.filter(x => !(x.testId === f.testId && x.date === date)); labFound.push({ ...f, file, date }); });
  renderLabReview();
}
function renderLabReview() {
  const ok = labFound.filter(x => !x.error), bad = labFound.filter(x => x.error);
  $('#labreview').innerHTML = `${bad.map(b => `<div class="verdict bad" style="margin-top:10px"><b>${esc(b.file)}:</b> ${esc(b.error)}</div>`).join('')}
  ${ok.length ? `<h3>Found ${ok.length} result${ok.length === 1 ? '' : 's'} — check them</h3>
  <form id="labsave"><div class="tablewrap"><table><thead><tr><th></th><th>Test</th><th>Value</th><th>Date</th><th>Last on file</th></tr></thead><tbody>
  ${ok.map((x, i) => { const t = testById(x.testId), last = resultsFor(x.testId).at(-1), dup = last && last.date === x.date && last.value === x.value;
    return `<tr><td><input type="checkbox" name="use${i}" ${dup ? '' : 'checked'}></td><td><b>${esc(t.name)}</b><div class="small muted">read as “${esc(x.source)}” · ${esc(x.file)}</div></td>
      <td><input name="val${i}" value="${esc(x.value)}" style="width:90px"> <span class="small muted">${esc(t.unit)}</span></td>
      <td><input type="date" name="date${i}" value="${x.date || ''}" required></td>
      <td class="small muted">${last ? `${esc(last.value)} (${fmtShort(last.date)})${dup ? ' · already saved' : ''}` : '—'}</td></tr>`; }).join('')}
  </tbody></table></div>
  <div class="actions" style="margin-top:12px"><button class="btn primary">Save checked results</button><span class="small muted">Results already on file are unchecked.</span></div></form>` : ''}`;
  $('#labsave')?.addEventListener('submit', e => {
    e.preventDefault(); const f = new FormData(e.target); let n = 0; const dates = new Set();
    ok.forEach((x, i) => {
      if (!f.get('use' + i)) return; const v = (f.get('val' + i) || '').trim(), d = f.get('date' + i); if (!v || !d) return;
      upsertResult(x.testId, d, v); const t = testById(x.testId); if (t) t.nextDue = null; dates.add(d); n++;
    });
    db.draws ||= []; dates.forEach(d => { if (!db.draws.some(x => x.date === d)) db.draws.push({ id: 'draw-' + d, date: d, note: 'Imported from lab report.' }); });
    close(); save(`Saved ${n} result${n === 1 ? '' : 's'}`);
  });
}
