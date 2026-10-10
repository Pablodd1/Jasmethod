/** Mobile acceptance against the guarded production server, synthetic users only.
 * Browser/page errors and remote requests are collected, never ignored as success.
 */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  const u = new URL(process.env[key] || '');
  assert.equal(u.protocol, 'postgresql:'); assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.port, '55432'); assert.equal(u.pathname, '/jmm_launch_integration_test'); assert.equal(u.search, '');
}
assert.notEqual(process.env.VERCEL_ENV, 'production');
assert.ok(process.env.NODE_OPTIONS?.includes('jmm-test-egress-guard.cjs'));
assert.ok(process.env.JMM_QA_BROWSER);
const db = new PrismaClient(), ids = [], results = [], blockedRequests = [], pageErrors = [];
const base = 'http://127.0.0.1:3220', root = path.resolve('.local/jmm-garmin-import/browser');
fs.mkdirSync(root, { recursive: true });
for (const entry of fs.readdirSync(root)) if (/\.(png|txt|json)$/.test(entry)) fs.unlinkSync(path.join(root, entry));
const en = { region: 'Import Garmin activities', file: 'Activity file', units: 'File units (required)', zone: 'File time zone (required)', preview: 'Preview activities', heading: 'Preview: nothing saved yet', confirm: 'Confirm and save', cancel: 'Cancel import', back: 'Back and review', sample: 'Review activity sample', saved: 'Save confirmed' };
const es = { region: 'Importar actividades de Garmin', file: 'Archivo de actividades', units: 'Unidades del archivo (obligatorio)', zone: 'Zona horaria del archivo (obligatorio)', preview: 'Previsualizar actividades', heading: 'Vista previa: todavía no se ha guardado', confirm: 'Confirmar y guardar', cancel: 'Cancelar importación', back: 'Volver y revisar', sample: 'Revisar muestra de actividades', saved: 'Guardado confirmado' };
const csv = (title = 'Synthetic mobile run', id = '876543201', distance = '5') => `Activity Type,Date,Title,Distance,Time,Avg HR,Max HR,Calories,Activity ID\nRunning,2026-01-15 06:30:00,${title},${distance},00:30:00,140,170,300,${id}\n`;
let browser;
async function actor(name, language = 'en') {
  const user = await db.user.create({ data: { email: `garmin-ui-${name}-${randomUUID()}@example.invalid`, name: `Synthetic Garmin UI ${name}`, passwordHash: bcrypt.hashSync(randomBytes(24).toString('hex'), 10), role: 'athlete', timezone: 'America/New_York', language, onboarded: true, profile: { create: { weightKg: 64, heightCm: 170 } }, reminder: { create: { emailEnabled: false, telegramEnabled: false } } } });
  ids.push(user.id);
  const token = randomBytes(32).toString('hex'); await db.authSession.create({ data: { userId: user.id, tokenHash: 'v2:' + createHash('sha256').update('jmm-session:v2:').update(token).digest('hex'), expiresAt: new Date(Date.now() + 7200000) } });
  return { ...user, token };
}
async function pageFor(a, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  context.setDefaultTimeout(30000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') route.continue();
    else { blockedRequests.push(url.hostname); route.abort(); }
  });
  await context.addCookies([{ name: 'jmm_session', value: a.token, url: base }]);
  const p = await context.newPage(); p.on('pageerror', error => pageErrors.push(error.message));
  await p.goto(base + '/connectors'); return p;
}
const panel = (p, labels = en) => p.getByRole('region', { name: labels.region, exact: true });
async function file(p, labels = en, text = csv(), name = 'Activities.csv', options = {}) {
  const r = panel(p, labels);
  await r.getByLabel(labels.file, { exact: true }).setInputFiles({ name, mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream', buffer: Buffer.from(text) });
  if (name.endsWith('.csv')) {
    await r.getByLabel(labels.units, { exact: true }).selectOption(options.units || 'metric');
    await r.getByLabel(labels.zone, { exact: true }).fill(options.zone || 'America/New_York');
    const numeric = r.locator('select').filter({ has: p.locator('option[value="decimal-dot"]') });
    if (await numeric.count()) await numeric.selectOption(options.numberFormat || 'decimal-dot');
  }
  return r;
}
async function preview(p, labels = en) {
  const r = panel(p, labels); await r.getByRole('button', { name: labels.preview, exact: true }).click();
  await r.getByRole('heading', { name: labels.heading, exact: true }).waitFor(); return r;
}
async function shot(p, name) {
  const labels = name.includes('spanish') ? es : en, r = panel(p, labels);
  await p.screenshot({ path: path.join(root, `${name}.png`), fullPage: true });
  const previewTitle = r.getByRole('heading', { name: labels.heading, exact: true });
  const savedTitle = r.getByText(labels.saved, { exact: true });
  const focus = await previewTitle.count() ? previewTitle : await savedTitle.count() ? savedTitle : r.getByRole('heading', { name: labels.region, exact: true });
  await focus.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: path.join(root, `${name}-viewport.png`), fullPage: false });
  const confirm = r.getByRole('button', { name: labels.confirm, exact: true });
  if (await confirm.count()) { await confirm.evaluate(element => element.scrollIntoView({ block: 'center' })); await p.screenshot({ path: path.join(root, `${name}-confirm-viewport.png`), fullPage: false }); }
  const sizing = await p.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(sizing.width <= sizing.viewport + 1, `${name}: horizontal overflow ${JSON.stringify(sizing)}`);
}
async function scenario(name, work) {
  try { await work(); results.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
  catch (error) {
    results.push({ name, status: 'FAIL', detail: error.message }); console.error(`FAIL ${name}: ${error.stack}`);
    let n = 0; for (const c of browser.contexts()) for (const p of c.pages()) {
      try { await p.screenshot({ path: path.join(root, `failure-${results.length}-${n}.png`), fullPage: true }); fs.writeFileSync(path.join(root, `failure-${results.length}-${n++}.txt`), await p.locator('body').innerText()); } catch { /* Original failure remains authoritative. */ }
    }
  }
}
const count = a => db.workout.count({ where: { userId: a.id } });

(async () => {
  browser = await chromium.launch({ executablePath: process.env.JMM_QA_BROWSER, headless: true, args: ['--no-sandbox'] });
  const a = await actor('english'), p = await pageFor(a, 390);
  await scenario('390px English: preview is read-only, file title is escaped, cancel resets options and persists no file', async () => {
    const title = '<img src=x onerror=globalThis.__garminXss=1>';
    const r = await file(p, en, csv(title)); await preview(p);
    assert.equal(await count(a), 0); assert.equal(await p.evaluate(() => document.activeElement.textContent), en.heading);
    const target = await r.getByRole('button', { name: en.confirm, exact: true }).boundingBox(); assert.ok(target.height >= 44);
    await r.getByText(en.sample, { exact: true }).click();
    assert.equal(await r.getByText(title, { exact: true }).count(), 1);
    assert.equal(await p.evaluate(() => globalThis.__garminXss), undefined);
    assert.ok(!(await p.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))).includes(title));
    await shot(p, '01-english-preview');
    await r.getByRole('button', { name: en.cancel, exact: true }).click();
    assert.equal(await r.getByRole('heading', { name: en.heading, exact: true }).count(), 0);
    assert.equal(await r.getByLabel(en.file, { exact: true }).inputValue(), ''); assert.equal(await count(a), 0);
    assert.match(await r.innerText(), /File and preview discarded/);
  });
  await scenario('390px English: option edits, Back and review, reload and history navigation discard prior confirmations', async () => {
    let r = await file(p); await preview(p);
    await r.getByLabel(en.units, { exact: true }).selectOption('imperial');
    assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).count(), 0);
    await preview(p); await r.getByRole('button', { name: en.back, exact: true }).click();
    assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).count(), 0);
    await preview(p); await p.reload(); r = panel(p); await r.getByLabel(en.file, { exact: true }).waitFor();
    assert.equal(await r.getByLabel(en.file, { exact: true }).inputValue(), ''); assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).count(), 0);
    await file(p); await preview(p); await p.goto(base + '/settings'); await p.goBack();
    r = panel(p); await r.getByLabel(en.file, { exact: true }).waitFor(); assert.equal(await r.getByLabel(en.file, { exact: true }).inputValue(), '');
    assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).count(), 0); assert.equal(await count(a), 0);
  });
  await scenario('390px English: an in-flight preview cannot restore confirmation after cancellation or newer options', async () => {
    let release; const held = new Promise(resolve => { release = resolve; }); let arrived;
    const arrival = new Promise(resolve => { arrived = resolve; });
    await p.route('**/api/import/garmin/preview', async route => { const response = await route.fetch(); arrived(); await held; try { await route.fulfill({ response }); } catch { /* Preview was intentionally aborted. */ } });
    const r = await file(p); await r.getByRole('button', { name: en.preview, exact: true }).click(); await arrival;
    await r.getByRole('button', { name: en.cancel, exact: true }).click(); release();
    await p.unroute('**/api/import/garmin/preview');
    await r.getByText(/File and preview discarded/).waitFor(); assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).count(), 0);
    assert.equal(await count(a), 0); assert.equal(await r.getByLabel(en.file, { exact: true }).inputValue(), '');
    let releaseOptions, optionsArrived, finished;
    const heldOptions = new Promise(resolve => { releaseOptions = resolve; });
    const optionsArrival = new Promise(resolve => { optionsArrived = resolve; });
    const complete = new Promise(resolve => { finished = resolve; });
    await p.route('**/api/import/garmin/preview', async route => { const response = await route.fetch(); optionsArrived(); await heldOptions; try { await route.fulfill({ response }); } catch { /* Superseded preview was aborted. */ } finally { finished(); } });
    await file(p); await r.getByRole('button', { name: en.preview, exact: true }).click(); await optionsArrival;
    await r.getByLabel(en.units, { exact: true }).selectOption('imperial'); releaseOptions(); await complete; await p.unroute('**/api/import/garmin/preview');
    assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).count(), 0);
    assert.equal(await r.getByLabel(en.units, { exact: true }).inputValue(), 'imperial'); assert.equal(await count(a), 0);
    await preview(p); await r.getByRole('button', { name: en.cancel, exact: true }).click();
  });
  await scenario('390px English: confirm saves once, reimport is duplicate-only, reload retains the imported history', async () => {
    const r = await file(p); await preview(p); await shot(p, '02-english-ready');
    await r.getByRole('button', { name: en.confirm, exact: true }).dblclick(); await r.getByText(en.saved, { exact: true }).waitFor();
    assert.equal(await count(a), 1); await shot(p, '03-english-saved');
    await p.reload(); await file(p); await preview(p);
    assert.equal(await panel(p).getByRole('button', { name: en.confirm, exact: true }).isDisabled(), true);
    assert.match(await panel(p).innerText(), /already saved/); assert.equal(await count(a), 1);
  });
  await scenario('390px English: Reports/FIT/ZIP are actionable unsupported cases and cannot save', async () => {
    for (const [name, text] of [['Reports.csv', 'Month,Distance,Time\nJanuary,50,04:00:00'], ['archive.zip', 'PK\u0003\u0004synthetic'], ['activity.fit', '\u000e\u0010\u0000\u0000\u0000\u0000\u0000\u0000.FIT']]) {
      const r = await file(p, en, text, name); await r.getByRole('button', { name: en.preview, exact: true }).click();
      if (name.endsWith('.csv')) { await r.getByRole('heading', { name: en.heading, exact: true }).waitFor(); assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).isDisabled(), true); assert.match(await r.innerText(), /Reports|summary/); }
      else { await r.getByRole('alert').waitFor(); assert.match(await r.getByRole('alert').innerText(), /FIT|ZIP/); assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).count(), 0); }
    }
    assert.equal(await count(a), 1);
  });
  await scenario('390px English: a lost commit response reports uncertainty and safe repreview discovers the saved duplicate', async () => {
    const lost = await actor('lost-response'), page = await pageFor(lost, 390); const r = await file(page); await preview(page);
    await page.route('**/api/import/garmin/commit', async route => { await route.fetch(); await route.abort('failed'); });
    await r.getByRole('button', { name: en.confirm, exact: true }).click(); await r.getByRole('alert').waitFor();
    assert.match(await r.getByRole('alert').innerText(), /could not be confirmed/); assert.equal(await r.getByText(en.saved, { exact: true }).count(), 0);
    assert.equal(await count(lost), 1); await page.unroute('**/api/import/garmin/commit'); await preview(page);
    assert.equal(await r.getByRole('button', { name: en.confirm, exact: true }).isDisabled(), true); assert.equal(await count(lost), 1);
    await shot(page, '04-english-lost-response');
  });
  await scenario('412px Spanish: explicit decimal-comma miles preview, cancel and confirmed save preserve profile and consent', async () => {
    const spanish = await actor('spanish', 'es'), page = await pageFor(spanish, 412);
    const before = await db.athleteProfile.findUnique({ where: { userId: spanish.id } });
    const text = 'Tipo de actividad,Fecha,Título,Distancia,Tiempo,FC media,FC máxima,Calorías,ID de actividad\nCarrera,2026-02-03 07:00:00,Carrera sintética,"3,1",00:30:00,140,170,300,876543299\n';
    let r = await file(page, es, text, 'Actividades.csv', { units: 'imperial', numberFormat: 'decimal-comma' }); await preview(page, es);
    await r.getByText(es.sample, { exact: true }).click(); assert.match(await r.innerText(), /4,989 km/);
    await shot(page, '05-spanish-preview'); assert.equal(await count(spanish), 0);
    await r.getByRole('button', { name: es.cancel, exact: true }).click();
    r = await file(page, es, text, 'Actividades.csv', { units: 'imperial', numberFormat: 'decimal-comma' }); await preview(page, es);
    await r.getByRole('button', { name: es.confirm, exact: true }).click(); await r.getByText(es.saved, { exact: true }).waitFor();
    assert.equal(await count(spanish), 1); assert.deepEqual(await db.athleteProfile.findUnique({ where: { userId: spanish.id } }), before);
    assert.equal(await db.manualWorkoutEmailPreference.count({ where: { userId: spanish.id } }), 0); assert.equal(await db.sentEmail.count({ where: { userId: spanish.id } }), 0);
    await page.reload(); assert.equal(await count(spanish), 1); await shot(page, '06-spanish-reloaded');
  });
  await scenario('Mobile import flow has no uncaught page errors or remote browser requests', async () => { assert.deepEqual(pageErrors, []); assert.deepEqual(blockedRequests, []); });
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close(); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify({ results, pageErrors, blockedRequests }, null, 2) + '\n');
  console.log(`${results.filter(r => r.status === 'PASS').length}/${results.length} Garmin mobile browser scenarios passed`);
  if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
});
