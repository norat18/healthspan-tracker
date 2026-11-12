// Browser smoke test: opens the app like a new visitor, sets it up, adds sample data, and visits every screen.
// Fails on any JavaScript error. Run: npx playwright test
import { test, expect } from '@playwright/test';

const TABS = ['summary', 'reminders', 'blood', 'body', 'procs', 'myinfo', 'data'];

test('a new visitor can set up and use every screen without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('page error: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/firebase|googleapis|gstatic|recaptcha|google\.com|net::ERR/i.test(m.text())) errors.push('console: ' + m.text()); });

  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Healthspan Tracker');
  await expect(page.locator('.welcome')).toBeVisible();

  // First-run setup: birth date and sex
  await page.locator('.welcome #dob').fill('1985-04-12');
  await expect(page.locator('.welcome')).toBeVisible();          // still asks for sex
  await page.locator('.welcome #sex').selectOption('female');
  await expect(page.locator('.welcome')).toHaveCount(0);

  // Sample data: two lipid draws, a DEXA value, a VO2 max, a visit and a home reading
  await page.evaluate(() => {
    for (const [d, ldl, hdl] of [['2025-06-01', '128', '52'], ['2026-06-01', '104', '61']]) {
      upsertResult('ldl-nih', d, ldl); upsertResult('hdl', d, hdl); upsertResult('glucose', d, '88');
    }
    upsertResult('dexa-body-fat-pct', '2026-03-01', '29.5'); upsertResult('vo2-max', '2026-03-01', '38');
    upsertResult('home-weight', '2026-11-01', '140');
    db.visits.push({ id: 'dentist-test', procId: 'dentist', date: '2026-05-01', result: 'Cleaning' });
    save();
  });

  // Every tab renders
  for (const v of TABS) {
    await page.locator(`.tabs [data-view="${v}"]`).click();
    await expect(page.locator('#view')).not.toBeEmpty();
  }

  // Fitness age card appears with a VO2 max on file
  await page.locator('.tabs [data-view="body"]').click();
  await expect(page.locator('.fitage')).toBeVisible();

  // A test's detail window with its chart
  await page.locator('.tabs [data-view="blood"]').click();
  await page.locator('[data-test="ldl-nih"]').first().click();
  await expect(page.locator('#modal .chart')).toBeVisible();
  await page.locator('#modal [data-close]').first().click();

  // Visit prep sheet, past dates and lab import windows open
  await page.evaluate(() => openVisitSheet('wellness-exam'));
  await expect(page.locator('#modal .sheet')).toBeVisible();
  await page.evaluate(() => { document.getElementById('modal').close(); openPastDates(); });
  await expect(page.locator('#pdform')).toBeVisible();
  await page.evaluate(() => { document.getElementById('modal').close(); openLabImport(); });
  await expect(page.locator('#dropzone')).toBeVisible();
  await page.evaluate(() => document.getElementById('modal').close());

  // Women's screenings shown for a female profile; men's hidden
  await page.locator('.tabs [data-view="procs"]').click();
  await expect(page.getByRole('heading', { name: 'Women’s health', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Men’s health', exact: true })).toHaveCount(0);

  // Keyboard: clickable cards are reachable and open with Enter
  await page.locator('.tabs [data-view="summary"]').click();
  // Summary: score, what's going well, what needs work, coming up, areas; details folded away
  await expect(page.locator('.sum-hero h2')).toBeVisible();
  for (const h of ['✨ Going well', '🌱 Next wins', '📅 Coming up']) await expect(page.getByRole('heading', { name: h })).toBeVisible();
  await expect(page.locator('.area').first()).toBeVisible();
  await expect(page.locator('.sum-more .tiles').first()).toBeHidden();
  // An area card opens its own panel on the Summary (no tab switch); clicking again closes it
  await page.locator('[data-area="heart"]').click();
  await expect(page.locator('#area-heart')).toBeVisible();
  await expect(page.locator('.tabs [data-view="summary"]')).toHaveClass(/active/);
  await page.locator('[data-area="heart"]').click();
  await expect(page.locator('#area-heart')).toBeHidden();
  // "+N more" in Needs work expands in place
  const more = page.locator('[data-wkmore]');
  if (await more.count()) { await more.click(); await expect(more).toHaveText('Show less'); await expect(page.locator('#works .work').nth(3)).toBeVisible(); await more.click(); }
  const card = page.locator('[role="button"][data-test]').first();
  await card.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#modal')).toBeVisible();
  await page.keyboard.press('Escape');

  // International units: switch, see mmol/L, enter a result in mmol/L, stored in mg/dL
  await page.locator('.tabs [data-view="data"]').click();
  await expect(page.getByText('KB of the')).toBeVisible();                 // storage meter
  await page.locator('#units').selectOption('si');
  await page.locator('.tabs [data-view="blood"]').click();
  await expect(page.locator('[data-test="ldl-nih"] .rc-val')).toContainText('2.69');   // 104 mg/dL
  await expect(page.locator('[data-test="ldl-nih"] .rc-val small')).toHaveText('mmol/L');
  await page.locator('[data-test="ldl-nih"]').first().click();
  await page.locator('#addone [name="date"]').fill('2026-10-01');
  await page.locator('#addone [name="value"]').fill('2.5');
  await page.locator('#addone button').click();
  expect(Math.round(await page.evaluate(() => +resultsFor('ldl-nih').find(r => r.date === '2026-10-01').value))).toBe(97);
  await page.locator('#modal [data-close]').first().click();
  await page.evaluate(() => { db.settings.units = 'us'; save(); });

  // Data survives a reload (saved in the browser)
  await page.reload();
  expect(await page.evaluate(() => db.results.length)).toBeGreaterThanOrEqual(8);

  // No sideways scrolling on any screen
  for (const v of TABS) {
    await page.locator(`.tabs [data-view="${v}"]`).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `overflow on ${v}`).toBe(true);
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

test('privacy page loads', async ({ page }) => {
  await page.goto('/privacy.html');
  await expect(page.getByRole('heading', { name: 'Privacy & Terms' })).toBeVisible();
});

test('scanned PDFs and photos of reports are read with on-device text recognition', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'same code path as desktop; run once to keep CI fast');
  test.setTimeout(240_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => { db.settings.dob = '1985-04-12'; db.settings.sex = 'female'; save(); });
  const expected = { 'dexa-total-mass': '150.5', 'dexa-lean-mass': '98.2', 'dexa-fat-mass': '45.1', 'dexa-body-fat-pct': '28.4', 'dexa-visceral-fat': '0.85',
    'dexa-ag-ratio': '0.82', 'dexa-t-score': '1.2', 'vo2-max': '41', 'resting-hr': '62', 'vo2-max-hr': '188' };

  for (const file of ['tests/fixtures/scanned-report-sample.pdf', 'tests/fixtures/report-photo-sample.jpg']) {
    await page.evaluate(() => openLabImport());
    await page.locator('#labfiles').setInputFiles(file);
    await expect(page.locator('#labsave')).toBeVisible({ timeout: 200_000 });
    const found = await page.evaluate(() => Object.fromEntries(labFound.filter(x => !x.error).map(x => [x.testId, [x.value, x.date, x.ocr]])));
    for (const [id, v] of Object.entries(expected)) expect(found[id]?.[0], `${file}: ${id}`).toBe(v);
    expect(found['dexa-body-fat-pct'][1]).toBe('2026-05-14');
    expect(found['dexa-body-fat-pct'][2]).toBe(true);                         // flagged "check" (read from an image)
    await page.locator('#labsave button.primary').click();
    expect(await page.evaluate(() => resultsFor('dexa-body-fat-pct').at(-1).value)).toBe('28.4');
  }
  expect(errors).toEqual([]);
});

test('a scanned MRI report fills the MRI card', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'same code path as desktop');
  test.setTimeout(180_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => { db.settings.dob = '1985-04-12'; db.settings.sex = 'female'; save(); openScanLog('full-body-mri'); });
  await page.locator('#scanfile').setInputFiles('tests/fixtures/mri-report-sample.pdf');
  await expect(page.locator('#scanstatus')).toContainText('Filled in from', { timeout: 150_000 });
  const form = page.locator('#scanform');
  await expect(form.locator('[name="__date"]')).toHaveValue('2026-01-20');
  await expect(form.locator('[name="mri-overall"]')).toHaveValue('Minor findings — monitor');
  await expect(form.locator('[name="mri-brain"]')).toHaveValue('Normal');
  await expect(form.locator('[name="mri-findings"]')).toHaveValue(/renal cyst/i);
  await expect(form.locator('[name="__summary"]')).toHaveValue(/renal cyst/i);
  await form.locator('button.primary').click();
  await page.locator('.tabs [data-view="procs"]').click();
  await expect(page.locator('.scan', { hasText: 'Full-body MRI' })).toContainText('Mild');
  expect(errors).toEqual([]);
});

test('new results update the Summary score, areas and what needs work', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('.welcome #dob').fill('1990-05-01');
  await page.locator('.welcome #sex').selectOption('female');
  const addResult = async (id, date, value) => {
    await page.evaluate(id => openTest(id), id);
    await page.locator('#addone [name="date"]').fill(date);
    await page.locator('#addone [name="value"]').fill(value);
    await page.locator('#addone button').click();
    await page.evaluate(() => document.getElementById('modal').open && document.getElementById('modal').close());
    await page.locator('.tabs [data-view="summary"]').click();
  };
  const area = key => page.locator(`[data-area="${key}"]`);

  // High LDL, then a newer one on target
  await addResult('ldl-nih', '2026-01-10', '150');
  await expect(area('heart')).toContainText('1 to improve');
  await expect(page.locator('#works')).toContainText('LDL');
  await addResult('ldl-nih', '2026-06-10', '90');
  await expect(area('heart')).toContainText('Looking good');
  await expect(page.locator('#works')).toHaveCount(0);
  await expect(page.locator('.sum-cols .wins')).toContainText('now on target');

  // Resting heart rate: a newer home reading replaces an older fitness-test value
  await addResult('resting-hr', '2026-03-01', '78');
  await expect(area('fit')).toContainText('1 to improve');
  await addResult('home-rhr', '2026-06-01', '60');
  await expect(area('fit')).toContainText('Looking good');

  // Any tracked test counts, not just the headline ones (potassium isn't in the headline list)
  await addResult('potassium', '2026-06-10', '6.5');
  await expect(area('organs')).toContainText('1 to improve');
  await expect(page.locator('.sum-hero')).toContainText('2 of 3');
  expect(errors).toEqual([]);
});

test('encouragement: getting started, fewer tabs, focus goals and celebrations', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  // New person: a getting-started checklist, and only tabs that have something in them
  await expect(page.locator('.next-step.start')).toContainText('0 of 4 done');
  await expect(page.locator('.tabs [data-view="blood"]')).toBeHidden();
  await expect(page.locator('.tabs [data-enc="showtabs"]')).toBeVisible();
  await page.locator('.welcome #dob').fill('1990-05-01');
  await page.locator('.welcome #sex').selectOption('female');
  await expect(page.locator('.next-step.start')).toContainText('1 of 4 done');
  // "Type them in" opens Bloodwork and shows all tabs
  await page.locator('[data-enc="addbyhand"]').click();
  await expect(page.locator('.tabs [data-view="blood"]')).toHaveClass(/active/);
  await expect(page.locator('.tabs [data-enc="showtabs"]')).toBeHidden();

  const add = async (id, date, value) => {
    await page.evaluate(id => openTest(id), id);
    await page.locator('#addone [name="date"]').fill(date);
    await page.locator('#addone [name="value"]').fill(value);
    await page.locator('#addone button').click();
    await page.evaluate(() => document.getElementById('modal').open && document.getElementById('modal').close());
    await page.locator('.tabs [data-view="summary"]').click();
  };
  await add('ldl-nih', '2026-01-10', '150');
  await expect(page.locator('.celebrate')).toContainText('First results tracked');   // milestone
  // Make LDL a focus goal from the idea chips
  await page.locator('.goals [data-enc="goal:ldl-nih"]').click();
  await expect(page.locator('.goal[data-test="ldl-nih"]')).toContainText('50 mg/dL to go');
  // Improve it: progress bar moves, then reaching the target is celebrated
  await add('ldl-nih', '2026-04-10', '120');
  await expect(page.locator('.goal[data-test="ldl-nih"] .g-bar')).toHaveAttribute('aria-valuenow', '60');
  await add('ldl-nih', '2026-07-10', '95');
  await expect(page.locator('.goal[data-test="ldl-nih"]')).toContainText('On target');
  await expect(page.locator('.celebrate')).toContainText(/Goal reached|on target/);
  // Year recap opens
  await page.locator('a[data-enc="recap"]').click();
  await expect(page.locator('.rc-stats')).toContainText('results tracked');
  expect(errors).toEqual([]);
});

test('a celebration stays until it is closed', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { db.settings.dob = '1990-05-01'; db.settings.sex = 'female'; db.settings.celebrated = {}; upsertResult('hdl', '2026-01-01', '40'); save(); });
  await page.evaluate(() => { upsertResult('hdl', '2026-11-01', '60'); save(); });
  const cel = page.locator('.celebrate');
  await expect(cel).toContainText('HDL');
  await page.waitForTimeout(8000);
  await expect(cel).toBeVisible();
  await cel.locator('.cel-x').click();
  await expect(cel).toHaveCount(0);
});

test('weekly habits under a focus goal, and the Connections section', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => { db.settings.dob = '1990-05-01'; db.settings.sex = 'female'; db.settings.celebrated = {};
    upsertResult('ldl-nih', '2026-06-01', '130'); upsertResult('home-rhr', '2026-06-01', '78'); save(); addGoal('ldl-nih'); addGoal('home-rhr'); });
  const ldl = page.locator('.goal[data-test="ldl-nih"]'), vo2 = page.locator('.goal[data-test="home-rhr"]');
  await expect(ldl.locator('.habit')).toHaveCount(2);                   // fiber + saturated fat
  await ldl.locator('[data-habitset="fiber:5"]').click();
  await expect(page.locator('#modal')).not.toBeVisible();               // tapping a habit doesn't open the test
  await expect(page.locator('.goal[data-test="ldl-nih"] .habit').first()).toContainText('5 / 5 ✓');
  await expect(page.locator('.celebrate')).toContainText('weekly target met');
  await page.locator('.celebrate .cel-x').click();
  await vo2.locator('[data-habit="cardio"]').fill('90'); await vo2.locator('[data-habit="cardio"]').press('Tab');
  await expect(page.locator('.goal[data-test="home-rhr"] .habit').first()).toContainText('90 / 150 min');
  await expect(page.locator('.goal[data-test="home-rhr"]')).toContainText('Connect Strava');
  await page.locator('.tabs [data-view="data"]').click();
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(page.locator('[data-enc="strava"]')).toBeVisible();
  expect(errors).toEqual([]);
});
