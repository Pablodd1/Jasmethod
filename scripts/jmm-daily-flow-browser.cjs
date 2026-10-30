/** API-mocked mobile acceptance; disposable browser contexts, no real accounts or API writes.
 * Run a built local app, then: node --import tsx scripts/jmm-daily-flow-browser.cjs
 * JMM_UI_TEST_BASE defaults to CI's loopback port. CHROMIUM_PATH is optional.
 */
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const { canonicalSession } = require('../src/lib/canonical-session.ts');
const { buildUniversalWorkoutCard } = require('../src/lib/universal-workout-card-server.ts');
const { buildDailyInputContext } = require('../src/lib/daily-input-context.ts');
const { buildTrainingWeekReview } = require('../src/lib/training-week-review.ts');

const base = process.env.JMM_UI_TEST_BASE || 'http://127.0.0.1:3220';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, 'Only an isolated loopback app is allowed');
const dir = '.local/jmm-daily-flow-browser'; mkdirSync(dir, { recursive: true });
const results = [], errors = [], unexpected = [];
const now = new Date(), today = now.toISOString().slice(0, 10);
const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
const hold = "Training is on hold until today's safety, recovery and available-time answers are known. Missing: sleep, soreness, motivation, energy, stress. Unknown answers are not evidence of readiness.";

function fixtures(language) {
  const user = { id: 'synthetic-daily-athlete', name: 'Synthetic daily athlete', email: 'daily@example.invalid',
    role: 'athlete', language, timezone: 'UTC', onboarded: true };
  const workout = { id: 'synthetic-daily-session', userId: user.id, title: language === 'es' ? 'Sesión fácil guardada' : 'Saved easy session',
    date: `${today}T00:00:00Z`, sport: 'bike', type: 'endurance', intensity: 'z2', durationMin: 45,
    planned: true, completed: false, approved: false, startTime: null };
  const canonical = canonicalSession({ athleteId: user.id, workout,
    prescription: { sport: 'bike', durationMin: 45, verdict: 'full', steps: [
      { name: language === 'es' ? 'Rodaje fácil' : 'Easy spin', seconds: 2700, zone: 'z2', phase: 'active', target: { type: 'open' } },
    ] }, dateLocal: today, timezone: 'UTC' });
  const blocked = { ...canonical, verdict: 'blocked', reason: hold, durationMin: 0, exactTimeSeconds: null, steps: [],
    capability: { ...canonical.capability, available: false, reason: hold } };
  const preview = { kind: 'saved_plan_preview', sessionId: workout.id, available: true, reason: 'Synthetic saved preview only.',
    session: Object.fromEntries(['title','sport','dateLocal','timezone','durationMin','exactTimeSeconds','steps'].map(key => [key, canonical[key]])) };
  const recent = { id: 'synthetic-known-activity', userId: user.id, title: language === 'es' ? 'Actividad conocida de ayer' : 'Known activity from yesterday',
    date: `${yesterday}T08:00:00Z`, sport: 'bike', source: 'garmin', planned: false, completed: true,
    durationMin: 42, actualDurationMin: 42, actualSport: 'bike', rpe: null, feedbackStatus: 'completed',
    feedbackAt: `${yesterday}T09:00:00Z`, createdAt: `${yesterday}T09:00:00Z`, actualDetails: null, knownActualDurationMin: 42 };
  const inputContext = buildDailyInputContext({ athleteId: user.id, timezone: 'UTC', now,
    observations: [['sleep_hours', 7.5, 'h'], ['resting_hr', 52, 'bpm'], ['hrv_sdnn', 80, 'ms']].map(([metricType,value,unit], index) => ({
      id: `synthetic-reading-${index}`, userId: user.id, metricType, value, unit, source: 'whoop',
      measurementMethod: 'device_sync', qualityFlag: 'ok', observedAt: new Date(`${today}T00:00:00Z`), createdAt: now,
    })), completedWorkouts: [recent], connectors: [{ provider: 'whoop', status: 'connected', lastSyncAt: now }] });
  const candidate = { eligible: true, reason: 'Review only this unchanged easy session.', sessionId: workout.id,
    minutes: 45, remainingPlanMinutes: 45, contextRevision: 'b'.repeat(64), workoutRevision: 'c'.repeat(64) };
  function rich(reviewed = false) {
    const current = reviewed ? canonical : blocked;
    return { date: today, timezone: 'UTC', language, units: 'metric', inputContext, recovery: {mode:reviewed?'training':'checkin-needed',safetyStatus:'unknown',reviewedSessionId:reviewed?workout.id:null},
      weekReview: buildTrainingWeekReview([recent,{...workout,id:'synthetic-next',source:'plan',date:new Date(now.getTime()+86400000).toISOString(),durationMin:30,planDay:{planId:'synthetic-cycle'}}],user.id,today,'UTC','synthetic-cycle'),
      cycle: { start: today, end: today, status: 'active', weeks: 1, currentWeek: 1 },
      connectors: [{ provider: 'whoop', status: 'connected', lastSyncAt: now.toISOString() }],
      sessions: [{ ...workout, durationMin: current.durationMin, plannedDurationMin: 45, verdict: current.verdict,
        revision: reviewed ? 'd'.repeat(64) : canonical.revision, resolutionReason: current.reason,
        capability: current.capability, existingReview: candidate, fuel: null, fuelCurve: [],
        prescription: { sport: 'bike', durationMin: current.durationMin, verdict: reviewed ? 'full' : 'rest',
          steps: current.steps, targets: {}, detail: {} } }] };
  }
  return { user, workout, canonical, blocked, preview, candidate, inputContext, rich,
    card: reviewed => buildUniversalWorkoutCard(reviewed ? { ...canonical, revision: 'd'.repeat(64) } : blocked, null, language),
    fast: { kind: 'saved_today_plan', readOnly: true, date: today, timezone: 'UTC', sessions: [workout] },
    checkin: { inputContext, checkin: { answers: JSON.stringify({ rhr: 52, hrv: 80, sleepHours: 7.5,
      inputMetadata: { source: 'imported-observations', rhrSource: 'whoop', hrvSource: 'whoop', hrvType: 'sdnn',
        sleepHoursSource: 'whoop', observedOn: today } }) },
      readiness: null, previousSessions: [recent], feedbackDate: yesterday, localToday: today } };
}

async function assertMobile(page, stage, language, width, focus) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth,
    main: document.querySelector('main')?.getBoundingClientRect().width ?? null }));
  assert.ok(geometry.scroll <= geometry.viewport + 1, `${stage}: horizontal overflow ${JSON.stringify(geometry)}`);
  await page.screenshot({ path: `${dir}/${stage}-${language}-${width}.png`, fullPage: true });
  if (focus) await focus.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 72, behavior: 'instant' }));
  await page.screenshot({ path: `${dir}/${stage}-${language}-${width}-viewport.png`, fullPage: false });
  return geometry;
}

async function journey(browser, language, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 1, locale: language === 'es' ? 'es-ES' : 'en-US', serviceWorkers: 'block' });
  const page = await context.newPage(), f = fixtures(language);
  page.setDefaultTimeout(15000);
  const mutations = [], reads = [];
  let releaseRich, richReleased = false, reviewed = false, failReview = true, withMeasurements=true, cognitiveReject=true, cognitiveWrites=0;
  let feedbackSaved = { feedbackRevision: 'e'.repeat(64), feedbackNote: 'Synthetic saved note', preWeightKg: 70, postWeightKg: 69 }, failFeedback = true, recordMode = 'none', forceOffline = false, preWorkoutSaved = null, failPreWeight = true;
  const richGate = new Promise(resolve => { releaseRich = () => { richReleased = true; resolve(); }; });
  page.on('pageerror', error => errors.push({ language, width, error: String(error) }));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { unexpected.push(`${request.method()} external request`); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    if (request.method() !== 'GET') {
      if (path === '/api/workout/pre-weight' && request.method() === 'PUT') {
        const body = request.postDataJSON(); assert.equal(body.sessionId, f.workout.id); assert.equal(body.expectedMeasurementRevision, null); assert.equal(body.weightKg, 70);
        if (failPreWeight) return route.fulfill({ status: 503, json: { error: 'Synthetic weight not saved' } });
        preWorkoutSaved = { weightKg: 70, observedAt: now.toISOString(), revision: now.toISOString(), source: 'athlete_reported' };
        return route.fulfill({ json: { ok: true, sessionId: f.workout.id, measurement: preWorkoutSaved } });
      }
      if (path === '/api/plan' && request.method() === 'PUT') {
        const body = request.postDataJSON();
        assert.equal(body.sessionId, f.workout.id);
        assert.equal(body.expectedRevision, feedbackSaved.feedbackRevision);
        assert.equal(body.feedbackNote, 'Synthetic updated note');
        assert.equal(body.preWeightKg, 70);
        assert.equal(body.postWeightKg, 69);
        assert.equal(body.actualDurationMin, '37');
        if (failFeedback) return route.fulfill({ status: 503, json: { error: 'Synthetic result not saved' } });
        feedbackSaved = { ...feedbackSaved, feedbackRevision: 'f'.repeat(64), feedbackNote: body.feedbackNote, actualDurationMin: 37, feedbackStatus: body.feedbackStatus };
        recordMode = 'saved';
        return route.fulfill({ json: { ok: true, workout: { id: f.workout.id } } });
      }
      if(path==='/api/cognitive' && request.method()==='POST'){const body=request.postDataJSON();assert.equal(body.test,'stroop');assert.ok(Number.isFinite(body.score));cognitiveWrites++;return route.fulfill(cognitiveReject?{status:503,json:{error:'Synthetic save rejected'}}:{json:{ok:true,id:'synthetic-cognitive-receipt'}});}
      if (path === '/api/checkin' && request.method() === 'POST') {
        const body = request.postDataJSON(); mutations.push({ path, body });
        assert.deepEqual(Object.keys(body).sort(), ['mode','sessionId','expectedRevision','contextRevision','noSymptoms','recoveryUnchanged','timeConfirmed','confirmed'].sort());
        assert.equal(body.mode, 'review_existing'); assert.equal(body.sessionId, f.workout.id);
        assert.equal(body.expectedRevision, f.canonical.revision); assert.equal(body.contextRevision, f.candidate.contextRevision);
        for (const key of ['noSymptoms','recoveryUnchanged','timeConfirmed','confirmed']) assert.equal(body[key], true);
        if (failReview) return route.fulfill({ status: 503, json: { error: 'Synthetic review not saved' } });
        reviewed = true;
        return route.fulfill({ json: { ok: true, duplicate: false, sessionId: f.workout.id, revision: 'd'.repeat(64) } });
      }
      unexpected.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 500, json: { error: 'Unexpected synthetic mutation' } });
    }
    reads.push(`${path}${url.search}`);
    if (path === '/api/auth/me') return route.fulfill({ json: { user: f.user } });
    if (path === '/api/today' && url.searchParams.get('view') === 'plan') return route.fulfill({ json: f.fast });
    if (path === '/api/today') {
      if (forceOffline) return route.fulfill({ status: 503, json: { error: 'Synthetic offline' } });
      await richGate; const rich = f.rich(reviewed); rich.units = language === 'en' ? 'imperial' : 'metric'; rich.sessions[0] = { ...rich.sessions[0], ...feedbackSaved, preWorkoutWeight: preWorkoutSaved };
      if (recordMode !== 'none') {
        const record = recordMode === 'saved'
          ? { ...feedbackSaved, id: f.workout.id, title: f.workout.title, sport: 'bike', source: 'plan', minutes: 37 }
          : { id: 'synthetic-imported', title: 'Synthetic imported activity', sport: 'bike', source: 'whoop', minutes: 35, feedbackRevision: 'a'.repeat(64) };
        rich.athleteReview = { rawRecordCount: 1, possibleCopies: 0, records: [record] };
        if (recordMode === 'matched') rich.sessions[0].matchedPlanId = record.id;
        if (recordMode === 'choose') rich.sessions.push({ ...rich.sessions[0], id: 'synthetic-second-session', title: 'Synthetic second planned workout', matchedPlanId: null });
      }
      return route.fulfill({ json: {...rich,...(!withMeasurements?{inputContext:null,connectors:[]}:{} )} });
    }
    if (path === '/api/plan/preview') { const id = url.searchParams.get('sessionId'); assert.ok([f.workout.id,'synthetic-second-session'].includes(id)); return route.fulfill({ json: { ...f.preview, sessionId: id } }); }
    if (path === '/api/workout/card') { assert.ok([f.workout.id,'synthetic-second-session'].includes(url.searchParams.get('id'))); return route.fulfill({ json: f.card(reviewed) }); }
    if (path === '/api/checkin') return route.fulfill({ json: withMeasurements?f.checkin:{...f.checkin,inputContext:null,checkin:null,previousSessions:[]} });
    if (path === '/api/connectors') return route.fulfill({ json: { providers: withMeasurements?[{ provider: 'whoop', status: 'connected', lastSyncAt: now.toISOString() }]:[] } });
    if (path === '/api/connectors/native') return route.fulfill({ json: { apple: { exportEnabled: false },
      coros: { configured: false, authorizationAvailable: false, connectionStatus: 'disconnected' } } });
    if (path === '/api/training/locations') return route.fulfill({ json: { locations: [] } });
    if (path === '/api/assistant') return route.fulfill({ json: { ok: true, conversation: { id: 'synthetic-chat', messages: [] }, proposal: null,
      sessions: [], capabilities: { externalAi: false, imageUnderstanding: false, textProvider: null, imageProvider: null } } });
    if (path === '/api/coaching/messages') return route.fulfill({ json: { messages: [] } });
    if (path === '/api/coaching/assignments') return route.fulfill({ json: { assignments: [] } });
    if (path === '/api/fitness') return route.fulfill({ json: { jMetrics: null } });
    unexpected.push(`GET ${path}`); return route.fulfill({ status: 500, json: { error: 'Unexpected synthetic read' } });
  });
  try {
    await page.goto(`${base}/today`, { waitUntil: 'domcontentloaded' });
    const fast = page.getByRole('region', { name: language === 'es' ? 'Plan guardado mientras cargan los datos' : 'Saved plan while context loads', exact: true });
    await fast.locator('.saved-workout-preview').waitFor({ state: 'visible' });
    assert.equal(richReleased, false, 'Saved preview renders before rich context is released');
    assert.ok(reads.includes('/api/today?view=plan')); assert.ok(reads.includes('/api/today'));
    assert.match(await fast.innerText(), /45 min/); assert.match(await fast.innerText(), language === 'es' ? /no autoriza|no confirma/i : /does not authorize|does not confirm/i);
    assert.equal(mutations.length, 0, 'Fast saved view never posts or approves');
    const fastGeometry = await assertMobile(page, 'saved-fast', language, width, fast);
    releaseRich();
    const pathCard=page.getByRole('region',{name:language==='es'?'Tu semana y preparación':'Your week and readiness',exact:true});
    await pathCard.waitFor();
    assert.match(await pathCard.innerText(),language==='es'?/3 mediciones actuales/:/3 current measurements/);

    assert.match(await pathCard.innerText(),language==='es'?/Mostrando la sesión prevista/:/Showing the planned workout/);
    await page.locator('#today-workout').getByText(language==='es'?'SESIÓN PREVISTA · SIN ADAPTAR':'PLANNED WORKOUT · NOT ADAPTED',{exact:true}).waitFor();
    assert.equal(mutations.length,0,'Current health readings choose the planned view without auto answers or approval');
    assert.equal(await page.locator('#daily-recovery').count(),0,'Planned view has no repeated check-in demand below the workout');
    await assertMobile(page,'synced-health-plan',language,width,page.locator('#today-workout'));
    await page.getByRole('button',{name:language==='es'?'Volver a la revisión diaria':'Return to daily review',exact:true}).click();
    assert.match(await pathCard.innerText(),language==='es'?/Adaptación diaria sin revisar/:/Daily adaptation not reviewed/);
    await assertMobile(page,'week-readiness',language,width,pathCard);
    assert.equal(await pathCard.getByText(language==='es'?'Dispositivo o prueba opcional':'Device or optional app test',{exact:true}).count(),0);
    const beforeSkip=mutations.length;
    await pathCard.getByRole('button',{name:language==='es'?'Omitir por ahora':'Skip for now',exact:true}).click();
    await page.locator('#today-workout').getByText(language==='es'?'SESIÓN PREVISTA · SIN ADAPTAR':'PLANNED WORKOUT · NOT ADAPTED',{exact:true}).waitFor();
    assert.equal(await page.locator('#today-workout').getByRole('link',{name:language==='es'?'Revisar check-in de hoy':"Review today's check-in",exact:true}).count(),0);
    assert.equal(mutations.length,beforeSkip,'Skipping only changes presentation; it cannot save answers or approve/export');
    assert.equal(await page.locator('#daily-recovery').count(),0);
    await assertMobile(page,'planned-after-skip',language,width,page.locator('#today-workout'));
    await page.getByRole('button',{name:language==='es'?'Volver a la revisión diaria':'Return to daily review',exact:true}).click();
    const review = page.getByTestId('existing-workout-review'); await review.waitFor({ state: 'visible' });
    await review.locator('summary').click();
    const checks = review.locator('input[type="checkbox"]'); assert.equal(await checks.count(), 3);
    for (let i = 0; i < 3; i++) assert.equal(await checks.nth(i).isChecked(), false, 'Personal confirmations are never preselected');
    const text = await review.innerText();
    assert.match(text, language === 'es' ? /enfermedad.*dolor nuevo.*síntomas urgentes/s : /illness symptoms.*new or worsening pain.*urgent symptoms/s);
    assert.match(text, language === 'es' ? /recuperación.*esfuerzo fácil/s : /recovery problems.*easy effort/s);
    assert.match(text, /45 min/); assert.equal(mutations.length, 0, 'Opening the review never submits');
    const confirm = review.getByRole('button', { name: language === 'es' ? 'Confirmar sesión sin cambios' : 'Confirm unchanged session', exact: true });
    await confirm.click(); assert.equal(mutations.length, 0, 'Unchecked required confirmations block submit');
    for (let i = 0; i < 3; i++) await checks.nth(i).check();
    assert.equal(mutations.length, 0, 'Checking all boxes still does not submit');
    const reviewGeometry = await assertMobile(page, 'explicit-review', language, width, review);
    await confirm.click(); await review.getByRole('alert').filter({ hasText: 'Synthetic review not saved' }).waitFor();
    assert.equal(mutations.length, 1); for (let i = 0; i < 3; i++) assert.equal(await checks.nth(i).isChecked(), true, 'A failed save retains the reviewed draft');
    failReview = false; await confirm.click();
    await page.locator('#today-workout .uwc-header').getByText(language === 'es' ? 'LISTO' : 'READY', { exact: false }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('#today-workout > .uwc').length === 1, null, { timeout: 10000 });
    assert.equal(await page.locator('#today-workout > .uwc').count(), 1, 'A refreshed selected card replaces the prior held card');
    assert.equal(mutations.length, 2, 'Only two explicit submit clicks created the two mocked review requests');
    assert.equal(unexpected.length, 0, 'Review never automatically approves or delivers');
    await page.goto(`${base}/checkin`, { waitUntil: 'domcontentloaded' });
    const summary = page.getByTestId('daily-input-context'); await summary.waitFor(); await summary.locator('summary').click();
    assert.match(await summary.innerText(), /7\.5 h.*whoop/s); assert.match(await summary.innerText(), /52 bpm.*whoop/s); assert.match(await summary.innerText(), /80 ms.*whoop/s);
    assert.match(await summary.innerText(), language === 'es' ? /VFC rMSSD: No disponible/ : /HRV rMSSD: Unavailable/);
    assert.match(await summary.innerText(), language === 'es' ? /no sustituyen|no responde/i : /do not answer/i);
    const skip = page.getByRole('link', { name: language === 'es' ? 'Omitir cuestionario y ver mi sesión' : 'Skip questionnaire and view my session', exact: true });
    assert.equal(await skip.getAttribute('href'), '/today');
    const imported = ['e.g. 48', 'e.g. 62', 'e.g. 7.5'].map(placeholder => page.getByPlaceholder(placeholder, { exact: true }));
    for (const input of imported) assert.equal(await input.count(), 0, 'Usable imported numeric fields are not repeated');
    for (const key of ['sleep','soreness','motivation','energy','stress','sick','newPain','urgentSymptoms'])
      assert.equal(await page.locator(`#answer-${key}`).inputValue(), '', `${key} remains unanswered despite imported measurements`);
    assert.equal(await page.locator('#answer-availableMinutes').inputValue(), '');
    const correction = page.getByRole('button', { name: language === 'es' ? 'Corregir una observación importada' : 'Correct an imported observation', exact: true });
    await correction.click();
    for (let i = 0; i < imported.length; i++) { await imported[i].waitFor({ state: 'visible' }); assert.equal(await imported[i].inputValue(), '', 'Saved imported values, including SDNN, never prefill manual corrections'); }
    await imported[0].fill('51'); await imported[1].fill('43'); await imported[2].fill('7');
    assert.equal(mutations.length, 2, 'Correction remains a draft until explicitly submitted');
    await assertMobile(page, 'checkin-correction', language, width, imported[0].locator('..'));
    await page.getByRole('button', { name: language === 'es' ? 'Usar observaciones importadas' : 'Use imported observations', exact: true }).click();
    for (const input of imported) assert.equal(await input.count(), 0);
    const recent = page.locator('form').filter({ has: page.getByRole('heading', { name: language === 'es' ? 'Actividad conocida de ayer' : 'Known activity from yesterday', exact: true }) });
    await recent.waitFor(); assert.match(await recent.innerText(), /42 min/);
    const actual = recent.locator('input[name="actualDurationMin"]');
    assert.equal(await actual.count(), 0, 'Known actual duration is not copied into a manual-entry field');
    const actualCorrection = recent.getByRole('button', { name: language === 'es' ? 'Corregir' : 'Correct', exact: true });
    assert.equal(await actualCorrection.count(), 1, 'Known duration has an explicit correction action');
    await actualCorrection.click(); await actual.waitFor({ state: 'visible' });
    assert.equal(await actual.inputValue(), '42');
    assert.equal(await recent.locator('input[name="rpe"]').inputValue(), '', 'Missing effort remains unanswered');
    assert.equal(mutations.length, 2, 'Full check-in and correction actions never auto-submit');
    const checkinGeometry = await assertMobile(page, 'checkin-context', language, width, recent);
    await page.goto(`${base}/today?sessionId=missing-synthetic-session`, { waitUntil: 'domcontentloaded' });
    const selected = page.getByRole('combobox', { name: language === 'es' ? /^Sesión de hoy/ : /^Today's session/ });
    await selected.waitFor({ state: 'visible' });
    assert.equal(await selected.inputValue(), '', 'A missing saved link asks for an explicit current-session choice');
    assert.equal(await selected.getByRole('option').count(), 2, 'The one current session remains reachable alongside the placeholder');
    await selected.selectOption(f.workout.id);
    await page.locator('#today-workout .uwc-header').getByText(language === 'es' ? 'LISTO' : 'READY', { exact: false }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('sessionId'), f.workout.id);
    assert.equal(mutations.length, 2, 'Recovering a stale session link never posts or approves');
    await assertMobile(page, 'stale-link-recovered', language, width, page.locator('#today-workout'));
    withMeasurements=false;reviewed=false;
    await page.goto(`${base}/today`);
    const manualPath=page.getByRole('region',{name:language==='es'?'Tu semana y preparación':'Your week and readiness',exact:true});await manualPath.waitFor();
    assert.match(await manualPath.innerText(),language==='es'?/Sin mediciones válidas/:/No usable measurements for today/);
    await manualPath.getByRole('button',{name:language==='es'?'Omitir por ahora':'Skip for now',exact:true}).click();
    await page.locator('#today-workout').getByText(language==='es'?'SESIÓN PREVISTA · SIN ADAPTAR':'PLANNED WORKOUT · NOT ADAPTED',{exact:true}).waitFor();
    assert.equal(mutations.length,2,'Skipping readiness creates no answer, approval or workout write');
    await assertMobile(page,'no-device-skipped',language,width,manualPath);
    await manualPath.getByRole('link',{name:language==='es'?'Actualizar check-in':'Update check-in',exact:true}).click();
    await page.locator('#answer-sleep').waitFor();
    for(const key of ['sleep','soreness','energy','stress','motivation'])assert.equal(await page.locator(`#answer-${key}`).inputValue(),'');
    assert.equal(await page.getByTestId('daily-input-context').count(),0);
    for(const placeholder of ['e.g. 48','e.g. 62','e.g. 7.5'])await page.getByPlaceholder(placeholder,{exact:true}).waitFor();
    await assertMobile(page,'no-device-questions',language,width,page.locator('#daily-questions'));

    await page.goto(`${base}/checkin#optional-focus-check`);
    const focus=page.locator('#optional-focus-check');if(!(await focus.getByRole('button',{name:language==='es'?'Empezar':'Start',exact:true}).isVisible()))await focus.locator('summary').click();
    await assertMobile(page,'optional-focus',language,width,focus);
    await focus.getByRole('button',{name:language==='es'?'Empezar':'Start',exact:true}).click();
    for(let i=0;i<10;i++)await focus.getByRole('button',{name:'red',exact:true}).click();
    await focus.getByRole('alert').waitFor();
    assert.equal(await focus.getByText(language==='es'?'✓ Guardado en tu historial cognitivo':'✓ Saved to your cognitive history',{exact:true}).count(),0);
    await assertMobile(page,'focus-save-error',language,width,focus);
    cognitiveReject=false;
    await focus.getByRole('button',{name:language==='es'?'Repetir':'Retest',exact:true}).click();
    for(let i=0;i<10;i++)await focus.getByRole('button',{name:'red',exact:true}).click();
    await focus.getByText(language==='es'?'✓ Guardado en tu historial cognitivo':'✓ Saved to your cognitive history',{exact:true}).waitFor();
    assert.equal(cognitiveWrites,2);assert.equal(mutations.length,2);
    await page.goto(`${base}/today`);
    const logResult = page.getByRole('button', { name: language === 'es' ? 'Registrar resultado y notas' : 'Log results & notes', exact: true });
    await logResult.waitFor({ state: 'visible' });
    await logResult.click();
    const feedback = page.locator('#workout-feedback'); await feedback.waitFor();
    assert.equal(await feedback.locator('[name=feedbackNote]').inputValue(), 'Synthetic saved note');
    assert.equal(await feedback.locator('[name=actualDurationMin]').inputValue(), '', 'Planned time is never copied into actual minutes');
    assert.equal(await feedback.locator('[name=preWeightKg]').inputValue(), language === 'en' ? '154.3234' : '70');
    assert.equal(await feedback.locator('[name=postWeightKg]').inputValue(), language === 'en' ? '152.1188' : '69');
    await feedback.locator('[name=feedbackStatus]').selectOption('partial');
    await feedback.locator('[name=actualDurationMin]').fill('37');
    await feedback.locator('[name=feedbackNote]').fill('Synthetic updated note');
    await assertMobile(page, 'workout-results', language, width, feedback);
    const saveResult = feedback.getByRole('button', { name: language === 'es' ? 'Guardar resultado' : 'Save result', exact: true });
    await saveResult.click(); await feedback.getByRole('alert').filter({ hasText: 'Synthetic result not saved' }).waitFor();
    assert.equal(await feedback.locator('[name=feedbackNote]').inputValue(), 'Synthetic updated note', 'A failed save retains the note');
    failFeedback = false; await saveResult.click(); await feedback.waitFor({ state: 'hidden' });
    await logResult.click();
    await page.getByRole('button', { name: language === 'es' ? 'Registrar esfuerzo y recuperación' : 'Log effort & recovery', exact: true }).click(); await feedback.waitFor();
    assert.equal(await feedback.locator('[name=feedbackNote]').inputValue(), 'Synthetic updated note', 'Saved note reloads');
    assert.equal(await feedback.locator('[name=actualDurationMin]').inputValue(), '37');
    recordMode = 'matched'; await page.goto(`${base}/today`); await logResult.click(); await feedback.waitFor();
    assert.match(await feedback.innerText(), /Synthetic imported activity/, 'A linked plan opens its exact imported activity');
    recordMode = 'choose'; await page.goto(`${base}/today`);
    await page.getByRole('combobox', { name: language === 'es' ? /^Sesión de hoy/ : /^Today's session/ }).selectOption('synthetic-second-session');
    await logResult.click();
    await page.getByRole('button', { name: /Synthetic second planned workout/ }).click(); await feedback.waitFor();
    assert.match(await feedback.innerText(), /Synthetic second planned workout/, 'Another planned workout remains an explicit choice');
    recordMode = 'none'; feedbackSaved = { feedbackRevision: 'e'.repeat(64), feedbackNote: null, preWeightKg: null, postWeightKg: null };
    await page.goto(`${base}/today`);
    const preWeight = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: language === 'es' ? 'Peso antes del entrenamiento' : 'Weight before training' }) });
    await preWeight.locator('summary').click();
    await preWeight.locator('input').fill(language === 'en' ? '154.3234' : '70');
    await assertMobile(page, 'pre-weight', language, width, preWeight);
    await preWeight.getByRole('button', { name: language === 'es' ? 'Guardar peso' : 'Save weight', exact: true }).click();
    await preWeight.getByRole('alert').filter({ hasText: 'Synthetic weight not saved' }).waitFor();
    failPreWeight = false; await preWeight.getByRole('button', { name: language === 'es' ? 'Guardar peso' : 'Save weight', exact: true }).click();
    await page.getByText(language === 'es' ? /70 kg guardado/ : /154\.3234 lb saved/).waitFor();
    await logResult.click(); await feedback.waitFor();
    assert.equal(await feedback.locator('[name=preWeightKg]').inputValue(), language === 'en' ? '154.3234' : '70', 'The exact session weigh-in is available for the later result');
    const legacy = f.rich(false); legacy.sessions[0].feedbackNote = 'legacy private note';
    legacy.athleteReview = { rawRecordCount: 1, possibleCopies: 0, records: [{ id: 'legacy', title: 'Legacy activity', sport: 'bike', source: 'manual', feedbackNote: 'legacy private result' }] };
    await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `jmm_today_${f.user.id}`, value: legacy });
    forceOffline = true; await page.goto(`${base}/today`);
    await page.locator('div[role="status"]').filter({ hasText: language === 'es' ? 'Copia sin conexión' : 'Offline copy' }).waitFor();
    const migrated = await page.evaluate(key => localStorage.getItem(key), `jmm_today_${f.user.id}`);
    assert.doesNotMatch(migrated, /legacy private note|legacy private result/, 'Offline upgrade removes legacy notes from persistent cache');
    results.push({ language, width, fastSavedPlanBeforeRichContext: 'pass', explicitUncheckedReview: 'pass', failedSaveKeepsDraft: 'pass',
      noAutomaticPostOrApproval: 'pass', importedNumericCorrection: 'pass', knownActualCorrection: 'pass',
      staleSelectedLinkRecovery: 'pass', resultsSaveFailureAndReload: 'pass', weightUnits: 'pass', geometries: { fast: fastGeometry, review: reviewGeometry, checkin: checkinGeometry }, mockedReviewRequests: mutations.length });
  } catch (error) {
    const selectedCards = await page.locator('#today-workout').evaluateAll(nodes => nodes.map(node => ({
      children: Array.from(node.children).map(child => ({ tag: child.tagName, className: child.className,
        revision: child.getAttribute('data-revision'), heading: child.querySelector('h1')?.textContent,
        status: child.querySelector('.uwc-stats')?.textContent, height: child.getBoundingClientRect().height,
        display: getComputedStyle(child).display })),
    }))).catch(() => []);
    results.push({ language, width, status: 'FAIL', detail: String(error), selectedCards });
    await page.screenshot({ path: `${dir}/failure-${language}-${width}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { releaseRich(); await context.close(); }
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  try {
    for (const language of ['en', 'es']) for (const width of [390, 412]) await journey(browser, language, width);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  } finally {
    await browser.close();
    writeFileSync(`${dir}/report.json`, JSON.stringify({ generatedAt: new Date().toISOString(), base, browser: `Chromium ${browser.version()}`, results, errors, unexpected,
      scope: 'Synthetic API-mocked Chromium mobile UI only. All browser contexts disposable; no real user, database/provider writes, readiness validation, delivery or device-execution claim.' }, null, 2));
  }
  console.log(`${results.length} EN/ES Today/check-in mobile journeys passed; only explicitly submitted mocked reviews, no automatic approval or page errors.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
