/** Real browser -> HTTP -> disposable PostgreSQL -> reload. No provider traffic. */
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
const dir = '.local/jmm-commander-persistence-browser'; mkdirSync(dir, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
async function actor(language) {
  const user = await db.user.create({ data: { email: `commander-browser-${randomUUID()}@example.invalid`, name: 'Synthetic commander',
    passwordHash: bcrypt.hashSync(randomBytes(24).toString('hex'), 4), language, timezone: 'UTC', onboarded: true,
    profile: { create: { experience: 'beginner', goal: 'run-only', weeklyHours: 3 } },
    reminder: { create: { emailEnabled: false, telegramEnabled: false } } } });
  ids.push(user.id);
  const token = randomBytes(32).toString('hex');
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { user, token };
}
async function api(who, path, body) {
  const response = await fetch(base + path, { method: body ? 'PUT' : 'GET', headers: { cookie: `jmm_session=${who.token}`, origin: base, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data;
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const language of ['en', 'es']) {
      const who = await actor(language), other = await actor(language), es = language === 'es';
      const current = await api(who, '/api/profile');
      await api(who, '/api/profile', { expectedRevision: current.revision, expectedSetupRevision: current.setupRevision,
        setup: { adultConfirmed: true, profileConfirmed: true, goalDescription: 'Familiar controlled running practice', baselineWeeklyMinutes: 90,
          baselineObservedAt: today, interruptions: 'none', restrictions: 'none', qualifiedReview: 'none_needed', trainingDays: [0, 2, 4],
          maxSessionMinutes: 45, equipmentAccess: 'Running shoes and familiar route', planWeeks: 8 } });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: 'jmm_session', value: who.token, url: base, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage(), errors = [], external = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        if (new URL(route.request().url()).origin !== base) { external.push('external request'); return route.abort(); }
        return route.continue();
      });
      await page.goto(base + '/coach');
      const composer = page.getByRole('textbox', { name: es ? 'Tu mensaje' : 'Your message', exact: true });
      await composer.fill(`Build my 8 week plan starting ${today}`);
      await page.getByRole('button', { name: es ? 'Enviar mensaje' : 'Send message', exact: true }).first().click();
      const panel = page.getByRole('region', { name: es ? 'Comandos y revisión del coach' : 'Coach commands and review', exact: true });
      await panel.getByRole('button', { name: es ? 'Preparar vista previa aquí' : 'Prepare plan preview here', exact: true }).click();
      const confirm = panel.getByRole('button', { name: es ? 'Confirmar y guardar este plan' : 'Confirm and save this plan', exact: true });
      await confirm.waitFor();
      assert.equal(await db.trainingPlan.count({ where: { userId: who.user.id } }), 0, 'Preview must not save');
      await confirm.click();
      await panel.getByText(es ? 'Comprobante de plan guardado' : 'Saved plan receipt', { exact: true }).waitFor();
      const saved = await api(who, '/api/assistant/plan');
      assert.ok(saved.receipt.id); assert.equal(saved.receipt.planId, saved.activePlans[0].id);
      const plan = await db.trainingPlan.findUniqueOrThrow({ where: { id: saved.receipt.planId } });
      assert.equal(plan.userId, who.user.id);
      assert.equal(await db.trainingPlan.count({ where: { userId: who.user.id } }), 1);
      assert.equal((await api(other, '/api/assistant/plan')).receipt, null);
      await page.reload();
      await page.getByRole('button', { name: es ? 'Vista previa del plan' : 'Plan preview', exact: true }).click();
      await panel.getByText(saved.receipt.id, { exact: false }).waitFor();
      assert.ok(await composer.isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []); assert.deepEqual(external, []);
      await page.screenshot({ path: `${dir}/saved-${language}-390.png`, fullPage: true });
      checks.push({ language, status: 'PASS', cases: ['real chat intent', 'preview makes no write', 'explicit save persists owned plan', 'one saved cycle', 'foreign athlete isolated', 'reload restores audit receipt and conversation', 'mobile geometry'] });
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { checks.push({ status: 'FAIL', error: String(error) }); console.error(error); process.exitCode = 1; })
  .finally(async () => {
    try { await db.user.deleteMany({ where: { id: { in: ids } } }); } finally { await db.$disconnect(); }
    writeFileSync(`${dir}/report.json`, JSON.stringify({ syntheticOnly: true, checks }, null, 2));
  });
