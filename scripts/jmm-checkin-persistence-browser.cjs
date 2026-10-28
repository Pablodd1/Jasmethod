/** Real mobile browser -> HTTP -> disposable PostgreSQL. Never runs against production. */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { hashToken } = require('../src/lib/auth.ts');
const { chromium } = require('playwright');
for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = new URL(process.env[key] || '');
  assert.equal(value.protocol, 'postgresql:'); assert.equal(value.hostname, '127.0.0.1');
  assert.equal(value.port, '55432'); assert.equal(value.pathname, '/jmm_launch_integration_test'); assert.equal(value.search, '');
}
assert.notEqual(process.env.VERCEL_ENV, 'production');
assert.ok(process.env.NODE_OPTIONS?.includes('jmm-test-egress-guard.cjs'));
const base = 'http://127.0.0.1:3220', db = new PrismaClient(), ids = [], checks = [];
const dir = '.local/jmm-checkin-persistence-browser'; mkdirSync(dir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
async function actor(language) {
  const user = await db.user.create({ data: { email: `checkin-browser-${randomUUID()}@example.invalid`, name: 'Synthetic check-in athlete',
    passwordHash: bcrypt.hashSync(randomBytes(24).toString('hex'), 4), language, timezone: 'UTC', onboarded: true,
    profile: { create: { experience: 'amateur', goal: 'run-only', sex: 'female', weeklyHours: 3, birthYear: 1990 } },
    reminder: { create: { emailEnabled: false, telegramEnabled: false } } } });
  ids.push(user.id);
  const token = randomBytes(32).toString('hex');
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  const headers = { cookie: `jmm_session=${token}`, origin: base, 'Content-Type': 'application/json' };
  const current = await (await fetch(base + '/api/profile', { headers })).json();
  const saved = await fetch(base + '/api/profile', { method: 'PUT', headers, body: JSON.stringify({
    expectedRevision: current.revision, expectedSetupRevision: current.setupRevision, experience: 'amateur', weeklyHours: 3,
    setup: { adultConfirmed: true, profileConfirmed: true, goalDescription: 'Familiar controlled running practice', baselineWeeklyMinutes: 90,
      baselineObservedAt: today, interruptions: 'none', restrictions: 'none', qualifiedReview: 'none_needed', trainingDays: [0,1,2,3,4,5,6],
      maxSessionMinutes: 45, equipmentAccess: 'Running shoes and familiar route', planWeeks: 8 }
  }) });
  assert.equal(saved.status, 200, await saved.text());
  return { user, token };
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const language of ['en', 'es']) for (const width of [390, 412]) {
      const who = await actor(language), es = language === 'es';
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: es ? 'es-ES' : 'en-US' });
      await context.addCookies([{ name: 'jmm_session', value: who.token, url: base, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage(), errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      let rejectSave = false, legacyResponse = false;
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin !== base) { external.push('external request'); return route.abort(); }
        if (url.pathname === '/api/checkin' && request.method() === 'POST') {
          if (rejectSave) return route.fulfill({ status: 503, json: { error: 'Synthetic check-in not saved' } });
          if (legacyResponse) {
            const response = await route.fetch(), body = await response.json();
            assert.equal(body.fuelBrands, null, 'Current server represents unavailable suggestions as null');
            return route.fulfill({ response, json: { ...body, fuelBrands: [] } });
          }
        }
        return route.continue();
      });
      const submit = () => page.getByRole('button', { name: es ? 'Revisar mi plan guardado' : 'Review my saved plan', exact: true });
      const send = async () => {
        const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/checkin' && r.request().method() === 'POST');
        await submit().click(); const saved = await response;
        assert.equal(saved.status(), 200); return saved.json();
      };
      const healthy = async minutes => {
        for (const key of ['sleep','soreness','motivation','energy','stress']) await page.locator(`#answer-${key}`).selectOption('3');
        for (const key of ['sick','newPain','urgentSymptoms']) await page.locator(`#answer-${key}`).selectOption('false');
        await page.locator('#answer-availableMinutes').fill(String(minutes));
      };
      try {
        await page.goto(base + '/checkin'); await submit().waitFor();
        const missing = await send();
        assert.equal(missing.adaptation.safetyStatus, 'unknown'); assert.equal(missing.fuelBrands, null);
        await page.getByRole('heading', { name: es ? 'Completa el check-in de hoy' : "Complete today's check-in", exact: true }).waitFor();
        await page.screenshot({ path: `${dir}/missing-${language}-${width}.png`, fullPage: true });
        await healthy(0);
        const noTime = await send(); assert.equal(noTime.fuelBrands, null); assert.equal(noTime.adaptation.durationFactor, 0);
        await page.getByText(es ? 'Hoy no tienes tiempo para entrenar' : 'No training time today', { exact: false }).waitFor();
        await page.screenshot({ path: `${dir}/no-time-${language}-${width}.png`, fullPage: true });
        await page.getByRole('heading', { name: es ? 'Revisión de hoy' : "Today's Adaptation", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${dir}/no-time-${language}-${width}-viewport.png`, fullPage: false });
        const record = await db.dailyCheckin.findFirstOrThrow({ where: { userId: who.user.id } });
        assert.equal(JSON.parse(record.answers).availableMin, 0);
        await page.reload(); await submit().waitFor();
        await page.waitForFunction(() => document.querySelector('#answer-availableMinutes')?.value === '0');
        assert.equal(await page.locator('#answer-availableMinutes').inputValue(), '0');
        await page.getByText(es ? 'Hoy no tienes tiempo para entrenar' : 'No training time today', { exact: false }).waitFor();
        legacyResponse = true; await send();
        await page.getByText(es ? 'Hoy no tienes tiempo para entrenar' : 'No training time today', { exact: false }).waitFor();
        const beforeFailure = await db.dailyCheckin.findUniqueOrThrow({ where: { id: record.id } });
        legacyResponse = false; rejectSave = true; await healthy(30); await submit().click();
        await page.getByRole('alert').filter({ hasText: 'Synthetic check-in not saved' }).waitFor();
        assert.equal((await db.dailyCheckin.findUniqueOrThrow({ where: { id: record.id } })).answers, beforeFailure.answers);
        rejectSave = false;
        const ready = await send(); assert.equal(ready.ok, true);
        await submit().waitFor({ state: 'visible' });
        assert.equal(await page.locator('#answer-availableMinutes').inputValue(), '30');
        assert.ok(ready.prescriptions.length > 0, 'Real saved starter session supports the positive-time path');
        assert.ok(ready.fuelBrands?.brands.length > 0);
        await page.getByRole('heading', { name: es ? 'Mejores marcas de combustible' : 'Best Fuel Brands', exact: true }).waitFor();
        await page.reload(); await submit().waitFor();
        await page.waitForFunction(() => document.querySelector('#answer-availableMinutes')?.value === '30');
        assert.equal(await page.locator('#answer-availableMinutes').inputValue(), '30');
        assert.equal(await db.dailyCheckin.count({ where: { userId: who.user.id } }), 1, 'Repeated saves update the same daily check-in');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(errors, []); assert.deepEqual(external, []);
        await page.screenshot({ path: `${dir}/saved-${language}-${width}.png`, fullPage: true });
        checks.push({ language, width, status: 'PASS', cases: ['missing essentials', 'zero minutes', 'female profile', 'legacy empty-list response', 'failed save preserves record', 'positive-time saved session', 'save/reload', 'one daily record', 'mobile geometry', 'no external traffic'] });
      } catch (error) {
        await page.screenshot({ path: `${dir}/failure-${language}-${width}.png`, fullPage: true }).catch(() => {});
        checks.push({ language, width, status: 'FAIL', error: String(error), errors, external }); throw error;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  try { await db.user.deleteMany({ where: { id: { in: ids } } }); } finally { await db.$disconnect(); }
  writeFileSync(`${dir}/report.json`, JSON.stringify({ syntheticOnly: true, scope: 'Isolated Chromium mobile -> real HTTP -> disposable PostgreSQL; no provider delivery claim', checks }, null, 2));
});
