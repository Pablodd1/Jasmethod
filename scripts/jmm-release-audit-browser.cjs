// API-mocked mobile UI acceptance only. Persistence and authorization are covered separately over real HTTP.
const assert = require('node:assert/strict');
const { readFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const { universalWorkoutExample } = require('../src/lib/universal-workout-example.ts');
const { parseIntervalRequest, applyIntervalPatch, toEditableSteps } = require('../src/lib/workout-interval-edit.ts');
const base = process.env.JMM_UI_TEST_BASE || 'http://127.0.0.1:3220';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const dir = '.local/jmm-release-audit-browser'; mkdirSync(dir, { recursive: true });
const results = [];
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const lang of ['en', 'es']) for (const width of [390, 412]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, locale: lang });
      const page = await context.newPage(), errors = [], unexpected = [];
      const card = universalWorkoutExample(lang);
      const daily = JSON.parse(readFileSync('src/components/daily-training/sample-session.json', 'utf8'));
      daily.language = lang; daily.workoutCard = card;
      daily.session = { ...daily.session, id: card.session.id, sourceRevision: card.session.revision, verdict: 'ready', totalMinutes: card.session.durationMin };
      let saves = 0, refreshGate = null;
      const feedbackHeading = lang === 'es' ? 'Cuéntanos cómo fue' : 'Close the loop';
      // Hold each authoritative refetch until React has removed the old screen.
      // Preview disappearance alone can precede that unmount, leaving a stale,
      // visible outcome control that is replaced by a newly collapsed <details>.
      async function saveAndRefresh(save) {
        let release;
        const requestSeen = page.waitForRequest(request => request.method() === 'GET' && new URL(request.url()).pathname === '/api/v1/training/today');
        const responseAllowed = new Promise(resolve => { release = resolve; });
        assert.equal(refreshGate, null);
        refreshGate = { responseAllowed };
        try {
          await save();
          await requestSeen;
          await page.getByRole('status').filter({ hasText: /Loading your plan|Cargando tu plan/ }).waitFor();
        } finally { release(); }
        await page.getByText(feedbackHeading, { exact: true }).waitFor();
        assert.equal(refreshGate, null, 'Authoritative refetch completed before feedback is reopened');
      }
      const feedbackWrites = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/me') return route.fulfill({ json: { user: { id: card.session.athleteId, name: 'Synthetic athlete', email: 'fixture@example.invalid', role: 'athlete', timezone: 'UTC', language: lang, onboarded: true, profile: { goal: 'run-only' } } } });
        if (path === '/api/v1/training/today') {
          if (refreshGate) {
            const gate = refreshGate;
            await gate.responseAllowed;
            refreshGate = null;
          }
          return route.fulfill({ json: daily });
        }
        if (path.endsWith('/completion')) {
          const body = route.request().postDataJSON();
          assert.equal(body.expectedRevision, daily.session.sourceRevision, 'Corrections use the refreshed revision');
          feedbackWrites.push(body);
          daily.completion = { ...daily.completion, submittedAt: new Date().toISOString(), actual: { ...body.actual, actualFueling: body.actual.actualFueling ? { schemaVersion: 1, ...body.actual.actualFueling } : null } };
          const revision = (feedbackWrites.length === 1 ? 'a' : 'b').repeat(64);
          daily.session = { ...daily.session, revision: daily.session.revision + 1, sourceRevision: revision };
          daily.workoutCard.session = { ...daily.workoutCard.session, revision };
          return route.fulfill({ json: { ok: true } });
        }
        if (path === '/api/workout/history') return route.fulfill({ json: { history: [], approval: { approved: false, reason: 'never_approved' }, canRestoreLatestStepEdit: false } });
        if (path === '/api/workout/next-suggestion') return route.fulfill({ json: { suggestion: null, reason: 'pilot_disabled' } });
        if (path === '/api/workout/interval-edit') {
          const body = route.request().postDataJSON();
          assert.equal(body.expectedRevision, card.session.revision);
          if (body.mode === 'apply') { saves++; return route.fulfill({ json: { ok: true, approvalCleared: true } }); }
          const parsed = parseIntervalRequest(body.text); assert.equal(parsed.ok, true);
          const edit = applyIntervalPatch(toEditableSteps(card.session.steps), parsed.patch, { budgetSeconds: card.session.durationMin * 60, intensityCapZone: 5 }); assert.equal(edit.ok, true);
          return route.fulfill({ json: { ok: true, patch: parsed.patch, preview: { before: edit.before, after: edit.after, changes: edit.changes[lang], requiresConfirmation: edit.requiresConfirmation, confirmationReasons: edit.confirmationReasons[lang] } } });
        }
        if (path === '/api/connectors') return route.fulfill({ json: { providers: [{ id: 'garmin', name: 'Garmin', method: 'upload', configured: true, status: 'disconnected' }], capabilities: { intervalsConnector: false } } });
        if (path === '/api/activity-streams') return route.fulfill({ json: { enabled: false, retentionDays: null, workoutIds: [] } });
        if (path === '/api/onboard/import-review') return route.fulfill({ json: { history: { bySource: [] }, connectors: [] } });
        if (path === '/api/import') { unexpected.push('oversized upload sent'); return route.fulfill({ status: 413, body: 'FUNCTION_PAYLOAD_TOO_LARGE' }); }
        if (route.request().method() !== 'GET') unexpected.push(`${route.request().method()} ${path}`);
        return route.fulfill({ json: { ok: true, configured: false, enabled: false, available: false } });
      });
      await page.goto(`${base}/daily`);
      await page.getByText(lang === 'es' ? 'Cuéntanos cómo fue' : 'Close the loop', { exact: true }).click();
      assert.equal(await page.getByLabel(lang === 'es' ? /^¿Qué ocurrió/ : /^What happened/).inputValue(), '', 'Reporting starts unknown, never completed');
      await page.getByText(lang === 'es' ? 'Compartir, dispositivo y editar' : 'Share, device & edit', { exact: true }).click();
      const editor = page.getByTestId('interval-coach-editor');
      await editor.locator('summary').click();
      await editor.getByRole('textbox').fill(lang === 'es' ? 'un intervalo menos' : 'one less interval');
      await editor.getByRole('button', { name: lang === 'es' ? /^Vista previa$/ : /^Preview$/ }).click();
      await editor.getByRole('region', { name: lang === 'es' ? 'Vista previa del cambio' : 'Change preview' }).waitFor();
      assert.equal(saves, 0, 'Preview never writes');
      await saveAndRefresh(() => editor.getByRole('button', { name: lang === 'es' ? 'Guardar cambio' : 'Save change' }).click());
      await page.waitForFunction(() => !document.querySelector('[aria-label="Change preview"], [aria-label="Vista previa del cambio"]'));
      assert.equal(saves, 1);
      const outcomeLabel = lang === 'es' ? /^¿Qué ocurrió/ : /^What happened/;
      const effortLabel = lang === 'es' ? /^Esfuerzo/ : /^Session effort/;
      const saveFeedback = lang === 'es' ? 'Guardar comentario del entrenamiento' : 'Save workout feedback';
      for (const rating of ['0', '3']) {
        const outcome = page.getByLabel(outcomeLabel);
        if (!await outcome.isVisible()) await page.getByText(feedbackHeading, { exact: true }).click();
        await outcome.waitFor({ state: 'visible' });
        await outcome.selectOption('completed');
        await page.getByLabel(effortLabel).fill(rating);
        await saveAndRefresh(() => page.getByRole('button', { name: saveFeedback, exact: true }).click());
        await page.getByRole('button', { name: saveFeedback, exact: true }).waitFor({ state: 'hidden' });
        await page.getByText(feedbackHeading, { exact: true }).waitFor();
        if (!await page.getByLabel(outcomeLabel).isVisible()) await page.getByText(feedbackHeading, { exact: true }).click();
        assert.equal(await page.getByLabel(effortLabel).inputValue(), rating, 'Saved effort survives authoritative refresh');
      }
      assert.equal(feedbackWrites.length, 2);
      assert.equal(feedbackWrites[0].actual.sessionRpe, 0);
      assert.equal(feedbackWrites[1].expectedRevision, 'a'.repeat(64));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
      await page.screenshot({ path: `${dir}/training-${lang}-${width}.png` });
      await page.goto(`${base}/connectors`);
      const file = page.locator('#file-garmin'); await file.waitFor();
      await file.setInputFiles({ name: 'too-large.csv', mimeType: 'text/csv', buffer: Buffer.alloc(4_000_001, 65) });
      await file.locator('..').locator('button').click();
      try { await page.getByText(lang === 'es' ? 'El archivo supera 4 MB. Exporta un intervalo menor.' : 'The file exceeds 4 MB. Export a smaller date range.').waitFor(); }
      catch (error) { writeFileSync(`${dir}/failure-text.txt`, await page.locator('body').innerText()); await page.screenshot({ path: `${dir}/failure.png` }); throw error; }
      assert.equal(saves, 1); assert.deepEqual(unexpected, [], 'Oversized file never reaches server');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Connections fit on mobile');
      assert.equal(await page.locator('#csv-units-garmin').inputValue(), '', 'No guessed CSV units');
      await page.screenshot({ path: `${dir}/connectors-${lang}-${width}.png` });
      assert.deepEqual(errors, []);
      results.push({ lang, width, status: 'PASS' }); await context.close();
    }
  } finally { await browser.close(); writeFileSync(`${dir}/report.json`, JSON.stringify({ results, kind: 'API-mocked UI; no provider or device acceptance' }, null, 2)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
