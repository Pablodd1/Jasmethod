/** Optional real-browser synthetic acceptance. Run beside the disposable guarded
 * local app at :3220 with Playwright resolvable and JMM_QA_BROWSER set to an
 * installed official Chromium. This is separate from API acceptance evidence.
 */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = new URL(process.env[key] || '');
  assert.equal(value.protocol, 'postgresql:'); assert.equal(value.hostname, '127.0.0.1');
  assert.equal(value.port, '55432'); assert.equal(value.pathname, '/jmm_launch_integration_test'); assert.equal(value.search, '');
}
assert.notEqual(process.env.VERCEL_ENV, 'production');
assert.ok(process.env.NODE_OPTIONS?.includes('jmm-test-egress-guard.cjs'));
assert.ok(process.env.JMM_QA_BROWSER);
const db = new PrismaClient(), ids = [], checks = [], blocked = [], errors = [];
const base = 'http://127.0.0.1:3220', root = path.resolve('.local/jmm-adaptive-cycle-browser');
fs.mkdirSync(root, { recursive: true });
for (const file of fs.readdirSync(root)) if (/\.(png|txt|json)$/.test(file)) fs.unlinkSync(path.join(root, file));
const today = new Date().toISOString().slice(0, 10);
const day = n => new Date(Date.parse(today + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
let browser;
async function actor(name) {
  const user = await db.user.create({ data: { email: `adaptive-ui-${name}-${randomUUID()}@example.invalid`, name: `Synthetic adaptive UI ${name}`, passwordHash: bcrypt.hashSync(randomBytes(24).toString('hex'), 4), role: 'athlete', timezone: 'UTC', language: 'en', onboarded: true, profile: { create: {} }, reminder: { create: { emailEnabled: false, telegramEnabled: false } } } });
  ids.push(user.id);
  const token = randomBytes(32).toString('hex');
  await db.authSession.create({ data: { userId: user.id, tokenHash: 'v2:' + createHash('sha256').update('jmm-session:v2:').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
  return { ...user, token, cookie: `jmm_session=${token}` };
}
async function api(who, target, body, method) {
  const response = await fetch(base + target, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { cookie: who.cookie, origin: base, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
}
async function setup(who) {
  const state = await api(who, '/api/profile');
  return api(who, '/api/profile', { expectedRevision: state.revision, expectedSetupRevision: state.setupRevision, birthYear: 1990, sex: 'female', heightCm: 170, weightKg: 64, experience: 'advanced', goal: 'run-only', weeklyHours: 4,
    setup: { adultConfirmed: true, profileConfirmed: true, goalDescription: 'Synthetic comfortable training', baselineWeeklyMinutes: 200, baselineObservedAt: day(-1), interruptions: 'none', restrictions: 'none', qualifiedReview: 'none_needed', trainingDays: [0, 1, 2, 3, 4, 5, 6], maxSessionMinutes: 60, equipmentAccess: 'Familiar track and treadmill', planWeeks: 12 } }, 'PUT');
}
async function pageFor(who, width) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  context.setDefaultTimeout(30000);
  await context.route('**/*', route => { const url = new URL(route.request().url()); if (url.hostname === '127.0.0.1') route.continue(); else { blocked.push(url.hostname); route.abort(); } });
  await context.addCookies([{ name: 'jmm_session', value: who.token, url: base }]);
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); return page;
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(root, name + '.png'), fullPage: true });
  if (name.includes('indoor-session')) await page.getByRole('region', { name: 'Venue and conditions', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(root, name + '-viewport.png'), fullPage: false });
  const size = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(size.width <= size.viewport + 1, `Horizontal overflow: ${JSON.stringify(size)}`);
}
async function scenario(name, work) {
  try { await work(); checks.push({ name, status: 'PASS' }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.stack || String(error) }); console.error(error); let index = 0; for (const context of browser.contexts()) for (const page of context.pages()) { try { await page.screenshot({path:path.join(root, `failure-${checks.length}-${index}.png`),fullPage:true}); fs.writeFileSync(path.join(root, `failure-${checks.length}-${index++}.txt`), await page.locator('body').innerText()); } catch {} } }
}
(async () => {
  browser = await chromium.launch({ executablePath: process.env.JMM_QA_BROWSER, headless: true, args: ['--no-sandbox'] });
  await scenario('390px event review: agreement, cancel, edited preview invalidation, stale event and saved protection', async () => {
    const who = await actor('events'); await setup(who);
    const events = await Promise.all([1, 2, 3].map((priority, index) => db.race.create({ data: { userId: who.id, name: `Synthetic ${['A', 'B', 'C'][index]} event`, priority, distance: '10k', date: new Date(day(8 + index * 3) + 'T00:00:00Z') } })));
    const page = await pageFor(who, 390); await page.goto(base + '/training');
    await page.getByRole('button', { name: 'Preview Plan', exact: true }).click();
    const confirm = page.getByRole('button', { name: 'Confirm and save this plan', exact: true });
    await confirm.waitFor(); assert.equal(await confirm.isDisabled(), true);
    await page.getByRole('link', { name: 'Review events and priorities', exact: true }).waitFor();
    await page.getByLabel('I reviewed my events and accept this conservative plan', { exact: false }).check();
    assert.equal(await confirm.isEnabled(), true); await shot(page, '01-event-review');
    await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
    assert.equal(await confirm.count(), 0); assert.equal(await db.trainingPlan.count({ where: { userId: who.id } }), 0);
    await page.getByRole('button', { name: 'Preview Plan', exact: true }).click(); await confirm.waitFor();
    assert.equal(await page.getByLabel('I reviewed my events and accept this conservative plan', { exact: false }).isChecked(), false);
    await page.locator('#plan-weeks').selectOption('16'); assert.equal(await confirm.count(), 0);
    await page.getByRole('button', { name: 'Preview Plan', exact: true }).click(); await confirm.waitFor();
    await page.getByLabel('I reviewed my events and accept this conservative plan', { exact: false }).check();
    const racesPage = await page.context().newPage(); await racesPage.goto(base + '/races');
    const timing = racesPage.locator('form').filter({ has: racesPage.locator('input[name="date"]') }).nth(1);
    await timing.getByLabel('Event date', { exact: true }).fill(day(13));
    await timing.locator('select[name="priority"]').selectOption('3');
    const edited = racesPage.waitForResponse(response => response.url().endsWith('/api/races') && response.request().method() === 'PUT');
    await timing.getByRole('button', { name: 'Save date and priority', exact: true }).click(); assert.equal((await edited).status(), 200);
    await racesPage.getByRole('link', { name: 'Review updated cycle', exact: true }).waitFor();
    await shot(racesPage, '01b-edit-event-priority'); await racesPage.close();
    const stale = page.waitForResponse(response => response.url().endsWith('/api/plan/generate') && response.request().method() === 'POST');
    await confirm.click(); assert.equal((await stale).status(), 409); assert.equal(await db.trainingPlan.count({ where: { userId: who.id } }), 0);
    await page.getByText('Preview the current plan and confirm it before replacing future training.', { exact: true }).waitFor(); await shot(page, '02-stale-event-preview');
    await page.getByRole('button', { name: 'Cancel preview', exact: true }).click();
    await page.getByRole('button', { name: 'Preview Plan', exact: true }).click(); await confirm.waitFor();
    await page.getByLabel('I reviewed my events and accept this conservative plan', { exact: false }).check();
    await confirm.click(); await page.getByRole('region', { name: 'Saved training cycle', exact: true }).waitFor();
    await page.getByText('Planning basis, assessment and evidence', { exact: true }).click();
    await page.getByText('Protected event dates', { exact: true }).waitFor();
    assert.equal(await db.benchmarkTest.count({ where: { userId: who.id } }), 0);
    await shot(page, '03-saved-event-cycle'); await page.reload();
    await page.getByRole('region', { name: 'Saved training cycle', exact: true }).waitFor();
    assert.equal(await db.trainingPlan.count({ where: { userId: who.id, status: 'active' } }), 1);
  });
  await scenario('412px session environment: honest unknown, indoor persistence, reconfirmation and unchanged check-in', async () => {
    const who = await actor('environment'); await setup(who);
    const workout = await db.workout.create({ data: { userId: who.id, date: new Date(today + 'T00:00:00Z'), startTime: '18:00', sport: 'run', title: 'Synthetic venue review', type: 'endurance', durationMin: 20, intensity: 'z2', planned: true } });
    const page = await pageFor(who, 412); await page.goto(base + '/today');
    const card = page.getByRole('region', { name: 'Venue and conditions', exact: true }); await card.waitFor();
    await card.locator('summary').click(); await card.getByText('Workout venue and conditions are unknown.', { exact: false }).waitFor();
    await card.getByLabel('Where will you train?', { exact: false }).selectOption('indoor');
    await card.getByLabel('Actual workout venue', { exact: true }).fill('Synthetic indoor treadmill');
    await card.getByLabel('Date and time at venue', { exact: true }).fill(today + 'T18:00');
    await card.getByLabel('Venue timezone', { exact: true }).fill('UTC');
    await card.getByLabel('I confirm the actual venue, indoor/outdoor setting, planned time and timezone for this workout.', { exact: true }).check();
    const saved = page.waitForResponse(response => response.url().endsWith('/api/training/environment') && response.request().method() === 'POST');
    await card.getByRole('button', { name: 'Save venue and time', exact: true }).click(); assert.equal((await saved).status(), 200);
    await page.reload(); await card.waitFor(); assert.match(await card.locator('summary').innerText(), /Indoor/); await card.locator('summary').click();
    assert.equal(await card.getByLabel('Actual workout venue', { exact: true }).inputValue(), 'Synthetic indoor treadmill');
    await shot(page, '04-indoor-session-venue');
    await card.getByLabel('Where will you train?', { exact: false }).selectOption('outdoor');
    assert.equal(await card.getByLabel('I confirm the actual venue, indoor/outdoor setting, planned time and timezone for this workout.', { exact: true }).isChecked(), false);
    await card.getByLabel('Latitude', { exact: true }).fill('0'); await card.getByLabel('Longitude', { exact: true }).fill('0');
    await card.getByRole('button', { name: 'Save and forecast venue', exact: true }).click(); await card.getByRole('alert').waitFor();
    assert.equal(await db.auditLog.count({ where: { subjectId: who.id, entityId: workout.id, action: 'workout.environment' } }), 1);
    assert.equal(await db.dailyCheckin.count({ where: { userId: who.id } }), 0);
    await card.getByRole('button', { name: 'Reload saved details', exact: true }).click();
    await card.getByText('Saved details loaded.', { exact: true }).waitFor();
    assert.equal(await card.getByLabel('Where will you train?', { exact: false }).inputValue(), 'indoor');
  });
  await scenario('390px forecast context: edits hide old conditions and repeated saves write once', async () => {
    const who = await actor('forecast'); await setup(who);
    const workout = await db.workout.create({ data: { userId: who.id, date: new Date(today + 'T00:00:00Z'), startTime: '18:00', sport: 'bike', title: 'Synthetic forecast context', type: 'endurance', durationMin: 20, intensity: 'z2' } });
    const stamp = new Date(Date.now() - 60000).toISOString(), target = today + 'T18:00:00.000Z';
    const record = { version: 'daily-environment-v1', athleteId: who.id, sessionId: workout.id, observedOn: today, scheduleTime: '18:00', scheduleTimezone: 'UTC', confirmedAt: stamp, source: 'athlete_reported', plannedAt: target,
      setting: 'outdoor', venueName: 'Synthetic forecast track', latitude: 0, longitude: 0, plannedLocal: today + 'T18:00', timeZone: 'UTC', venueConfirmed: true, requestForecast: true,
      forecast: { status: 'fresh', requestedAt: target, fetchedAt: stamp, sourceUpdatedAt: stamp, coverageStart: today + 'T17:00:00.000Z', coverageEnd: today + 'T19:00:00.000Z', validAt: target, temperatureC: 20, humidityPct: 50, windMs: 2 } };
    await db.auditLog.create({ data: { actorId: who.id, subjectId: who.id, entityId: workout.id, action: 'workout.environment', after: JSON.stringify(record) } });
    const page = await pageFor(who, 390); await page.goto(base + '/today');
    const card = page.getByRole('region', { name: 'Venue and conditions', exact: true }); await card.waitFor();
    assert.match(await card.locator('summary').innerText(), /Forecast.*20 °C/); await card.locator('summary').click();
    await card.getByLabel('Actual workout venue', { exact: true }).fill('Edited synthetic track');
    assert.match(await card.locator('summary').innerText(), /Unknown/); assert.doesNotMatch(await card.locator('summary').innerText(), /20 °C/);
    await card.getByText('Unsaved changes: the previous forecast does not apply to these edited details.', { exact: true }).waitFor();
    assert.equal(await card.getByLabel('I confirm the actual venue, indoor/outdoor setting, planned time and timezone for this workout.', { exact: true }).isChecked(), false);
    await card.getByLabel('I confirm the actual venue, indoor/outdoor setting, planned time and timezone for this workout.', { exact: true }).check();
    let requests = 0; page.on('request', request => { if (request.url().endsWith('/api/training/environment') && request.method() === 'POST') requests++; });
    const saved = page.waitForResponse(response => response.url().endsWith('/api/training/environment') && response.request().method() === 'POST');
    await card.getByRole('button', { name: 'Save venue and time', exact: true }).evaluate(button => { button.click(); button.click(); });
    assert.equal((await saved).status(), 200); await page.reload(); await card.waitFor();
    assert.equal(requests, 1); assert.match(await card.locator('summary').innerText(), /Unknown/);
    assert.equal(await db.auditLog.count({ where: { subjectId: who.id, entityId: workout.id, action: 'workout.environment' } }), 2);
    await shot(page, '05-edited-forecast-unknown');
  });
})().catch(error => { checks.push({ name: 'Browser launch or fixture', status: 'FAIL', detail: String(error) }); console.error(error); }).finally(async () => {
  if (browser) await browser.close();
  await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect();
  const failed = checks.some(check => check.status === 'FAIL') || blocked.length > 0 || errors.length > 0;
  fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify({ status: failed ? 'failed' : 'passed', syntheticOnly: true, checks, blockedRequests: blocked, pageErrors: errors }, null, 2));
  if (failed) process.exitCode = 1;
});
