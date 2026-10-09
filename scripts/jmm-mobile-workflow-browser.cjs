/** Real-browser synthetic acceptance. Requires Playwright on NODE_PATH and
 * JMM_QA_BROWSER pointing to an installed Chromium/headless-shell executable.
 * Run only beside the guarded disposable app and PostgreSQL in the same shell.
 * No real credentials, athlete data, provider authorization or remote app access used.
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
    assert.equal(u.hostname, '127.0.0.1');
    assert.equal(u.port, '55432');
    assert.equal(u.pathname, '/jmm_launch_integration_test');
    assert.equal(u.protocol, 'postgresql:');
    assert.equal(u.search, '');
}
assert.notEqual(process.env.VERCEL_ENV, 'production');
assert.ok(process.env.NODE_OPTIONS?.includes('jmm-test-egress-guard.cjs'));
assert.ok(process.env.JMM_QA_BROWSER, 'Set JMM_QA_BROWSER to the installed official test browser');
const db = new PrismaClient(), ids = [], results = [], blockedRequests = [], pageErrors = [];
const base = 'http://127.0.0.1:3220', root = path.resolve('.local/jmm-mobile-workflow/browser');
fs.mkdirSync(root, { recursive: true });
for (const file of fs.readdirSync(root))
    if (/\.(png|txt|json)$/.test(file))
        fs.unlinkSync(path.join(root, file));
let browser;
const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
async function actor(name, { onboarded = false, language = 'en', profile = {} } = {}) {
    const a = await db.user.create({ data: {
            email: `mobile-ui-${name}-${randomUUID()}@example.invalid`,
            name: `Synthetic UI ${name}`,
            passwordHash: bcrypt.hashSync(randomBytes(24).toString('hex'), 10),
            role: 'athlete',
            timezone: 'UTC',
            language,
            onboarded,
            profile: { create: profile },
            reminder: { create: { emailEnabled: false, telegramEnabled: false } }
        } });
    ids.push(a.id);
    const token = randomBytes(32).toString('hex');
    await db.authSession.create({ data: { userId: a.id, tokenHash: 'v2:' + createHash('sha256').update('jmm-session:v2:').update(token).digest('hex'), expiresAt: new Date(Date.now() + 2 * 3600000) } });
    return { ...a, token, cookie: `jmm_session=${token}` };
}
async function api(a, url, body, method) {
    const r = await fetch(base + url, {
        headers: { cookie: a.cookie, 'Content-Type': 'application/json' },
        method: method || (body ? 'POST' : 'GET'),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(120000)
    });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    return d;
}
async function pageFor(a, width = 390) {
    const context = await browser.newContext({
        viewport: { width, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1,
        userAgent: width === 390 ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' : 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
    });
    context.setDefaultTimeout(30000);
    await context.route('**/*', r => {
        const u = new URL(r.request().url());
        if (u.hostname === '127.0.0.1')
            r.continue();
        else {
            blockedRequests.push(u.hostname);
            r.abort();
        }
    });
    await context.addCookies([{ name: 'jmm_session', value: a.token, url: base }]);
    const p = await context.newPage();
    p.on('pageerror', e => pageErrors.push(e.message));
    return p;
}
async function shot(p, name) {
    await p.screenshot({ path: path.join(root, name + '.png'), fullPage: true });
    if (name.includes('saved-cycle')) {
        const cycle = p.getByRole('region', { name: 'Saved training cycle', exact: true });
        if (await cycle.isVisible()) await cycle.scrollIntoViewIfNeeded();
    }
    await p.screenshot({ path: path.join(root, name + '-viewport.png'), fullPage: false });
    const size = await p.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    assert.ok(size.width <= size.viewport + 1, `${name}: horizontal overflow ${JSON.stringify(size)}`);
}
async function scenario(name, work) {
    try {
        await work();
        results.push({ name, status: 'PASS' });
        console.log('PASS ' + name);
    }
    catch (e) {
        results.push({ name, status: 'FAIL', detail: e.message });
        console.error('FAIL ' + name + ': ' + e.stack);
        let n = 0;
        for (const c of browser.contexts())
            for (const p of c.pages()) {
                try {
                    await p.screenshot({ path: path.join(root, `failure-${results.length}-${n}.png`), fullPage: true });
                    fs.writeFileSync(path.join(root, `failure-${results.length}-${n}.txt`), await p.locator('body').innerText());
                    n++;
                }
                catch {
                }
            }
    }
}
async function fillGoals(p, { hours = '3', weeks = '12', maximum = '60' } = {}) {
    await p.getByLabel('Experience', { exact: true }).selectOption('amateur');
    await p.getByLabel('Weekly hours', { exact: true }).fill(hours);
    await p.getByLabel('Goal', { exact: true }).selectOption('run-only');
    await p.getByLabel('I confirm I am 18 or older', { exact: true }).check();
    await p.getByLabel('I confirm my experience and available weekly time above', { exact: true }).check();
    await p.getByLabel('Goal in your words: fitness, completion or performance').fill('Run comfortably for general fitness');
    await p.getByLabel('Recently tolerated training, total minutes per week', { exact: true }).fill('120');
    await p.getByLabel('Date this training history was observed', { exact: true }).fill(date);
    await p.getByLabel('Recent interruption or return after time off?').selectOption('none');
    await p.getByLabel('Current symptoms, injury or restrictions?').selectOption('none');
    await p.getByLabel('Pregnancy/postpartum, significant medical restrictions or another circumstance needing professional guidance?').selectOption('none_needed');
    for (const label of ['Mon', 'Wed', 'Fri'])
        await p.getByLabel(label, { exact: true }).check();
    await p.getByLabel('Maximum total training minutes per day', { exact: true }).fill(maximum);
    await p.getByLabel('Equipment and venue access (including none)').fill('Running shoes and outdoor path');
    await p.getByLabel('Planning horizon in weeks (no event date is invented)', { exact: true }).fill(weeks);
}
(async () => {
    browser = await chromium.launch({ executablePath: process.env.JMM_QA_BROWSER, headless: true, args: ['--no-sandbox'] });
    let athlete, p, originalPlan, completed, feedbackRecord;
    await scenario('390px iPhone-like new athlete: connections first, draft reload, profile save, goals evaluation, preview and confirmed saved cycle', async () => {
        athlete = await actor('new');
        p = await pageFor(athlete);
        await p.goto(base + '/onboard');
        await p.getByRole('button', { name: 'Skip connections and continue manually', exact: true }).waitFor();
        assert.equal(await p.getByRole('button', { name: '1. Connections', exact: true }).getAttribute('aria-current'), 'step');
        await shot(p, '01-new-connections');
        await p.getByRole('button', { name: 'Skip connections and continue manually', exact: true }).click();
        await p.getByLabel('Birth year', { exact: true }).fill('1990');
        await p.getByLabel('Sex', { exact: true }).selectOption('female');
        await p.getByLabel('Height (cm)', { exact: true }).fill('170');
        await p.getByLabel('Weight (kg)', { exact: true }).fill('64');
        await p.getByRole('button', { name: '3. Goals & schedule', exact: true }).click();
        await p.reload();
        await p.getByRole('button', { name: '2. Profile', exact: true }).click();
        assert.equal(await p.getByLabel('Birth year', { exact: true }).inputValue(), '1990');
        assert.equal(await p.getByLabel('Weight (kg)', { exact: true }).inputValue(), '64');
        await p.getByRole('button', { name: 'Save profile', exact: true }).click();
        await p.getByLabel('Experience', { exact: true }).waitFor();
        let profile = await api(athlete, '/api/profile');
        assert.equal(profile.profile.weightKg, 64);
        assert.equal(profile.profile.heightCm, 170);
        await fillGoals(p);
        await shot(p, '02-new-goals');
        await p.getByRole('button', { name: 'Save goals and race', exact: true }).click();
        await p.getByRole('button', { name: 'Review and build my plan', exact: true }).waitFor();
        profile = await api(athlete, '/api/profile');
        assert.equal(profile.planningReadiness.ready, true);
        assert.equal(profile.setup.planWeeks, 12);
        await p.reload();
        await p.getByRole('button', { name: 'Review and build my plan', exact: true }).click();
        await p.waitForURL('**/training');
        await p.getByRole('button', { name: 'Preview Plan', exact: true }).waitFor();
        await p.getByRole('button', { name: 'Preview Plan', exact: true }).click();
        await p.getByRole('button', { name: 'Confirm and save this plan', exact: true }).waitFor();
        assert.equal(await db.trainingPlan.count({ where: { userId: athlete.id } }), 0);
        await shot(p, '03-plan-preview');
        await p.getByRole('button', { name: 'Confirm and save this plan', exact: true }).click();
        await p.getByRole('region', { name: 'Saved training cycle', exact: true }).waitFor();
        originalPlan = (await api(athlete, '/api/plan')).plans[0].id;
        await shot(p, '04-saved-cycle');
        const months = await p.getByLabel('View saved month', { exact: true }).locator('option').evaluateAll(o => o.map(x => x.value));
        assert.ok(months.length >= 3);
        await p.getByLabel('View saved month', { exact: true }).selectOption(months[1]);
        await p.reload();
        await p.getByRole('region', { name: 'Saved training cycle', exact: true }).waitFor();
        assert.equal((await api(athlete, '/api/plan')).plans[0].id, originalPlan);
        await p.getByRole('region', { name: 'Saved training cycle', exact: true }).getByRole('link', { name: 'Calendar', exact: true }).click();
        await p.waitForURL('**/calendar');
        await p.getByText('Use Apple Calendar or another calendar app', { exact: true }).click();
        await p.getByRole('link', { name: 'Download calendar (.ics)', exact: true }).waitFor();
        const [downloaded] = await Promise.all([
            p.waitForEvent('download'),
            p.getByRole('link', { name: 'Download calendar (.ics)', exact: true }).click(),
        ]);
        const downloadedPath = await downloaded.path();
        assert.ok(downloadedPath);
        assert.ok(fs.readFileSync(downloadedPath, 'utf8').startsWith('BEGIN:VCALENDAR'));
        await p.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Training plan', exact: true }).click();
        await p.waitForURL('**/training');
        await p.getByRole('region', { name: 'Saved training cycle', exact: true }).waitFor();
        await p.getByRole('link', { name: 'Today’s workout', exact: true }).click();
        await p.waitForURL('**/today');
        await p.getByRole('heading', { name: "Today's training", exact: true }).waitFor();
        await shot(p, '05-today-saved-cycle');
    });
    await scenario('390px Today feedback: reported partial completion persists across reload', async () => {
        assert.ok(originalPlan, 'Requires the confirmed new-athlete plan');
        await api(athlete, '/api/checkin', {
            sleep: 4,
            soreness: 2,
            motivation: 4,
            energy: 4,
            stress: 2,
            sick: false,
            newPain: false,
            urgentSymptoms: false,
            availableMinutes: 60
        });
        await p.reload();
        await p.getByRole('button', { name: 'Log how it felt', exact: true }).waitFor();
        await p.getByRole('button', { name: 'Log how it felt', exact: true }).click();
        await p.getByLabel('Outcome').selectOption('partial');
        await p.getByLabel('Actual minutes', { exact: true }).fill('15');
        await p.getByLabel('Effort 0–10', { exact: true }).fill('3');
        await p.getByLabel('Workout feedback', { exact: true }).fill('Synthetic QA: easy partial session, test data only.');
        const response = p.waitForResponse(r => r.url().endsWith('/api/plan') && r.request().method() === 'PUT');
        await p.getByRole('button', { name: 'Save result', exact: true }).click();
        assert.equal((await response).status(), 200);
        await p.reload();
        await p.getByRole('button', { name: 'Log how it felt', exact: true }).click();
        assert.equal(await p.getByLabel('Actual minutes', { exact: true }).inputValue(), '15');
        assert.equal(await p.getByLabel('Effort 0–10', { exact: true }).inputValue(), '3');
        feedbackRecord = await db.workout.findFirst({ where: { userId: athlete.id, feedbackStatus: 'partial', actualDurationMin: 15 } });
        assert.ok(feedbackRecord);
        await shot(p, '05b-feedback-reloaded');
    });
    await scenario('390px returning athlete: saved profile edits preserve existing cycle; changed availability re-preview retains completed history', async () => {
        assert.ok(originalPlan, 'Requires the confirmed new-athlete plan');
        completed = await db.workout.create({ data: {
                userId: athlete.id,
                date: new Date(date + 'T12:00:00Z'),
                sport: 'run',
                title: 'Synthetic completed browser history',
                type: 'endurance',
                durationMin: 30,
                intensity: 'z2',
                completed: true,
                planned: false,
                source: 'manual',
                actualDurationMin: 28,
                rpe: 3,
                feedbackStatus: 'completed',
                feedbackAt: new Date()
            } });
        await p.goto(base + '/onboard?redo=1&step=profile');
        await p.getByLabel('Weight (kg)', { exact: true }).waitFor();
        assert.equal(await p.getByLabel('Weight (kg)', { exact: true }).inputValue(), '64');
        await p.getByLabel('Weight (kg)', { exact: true }).fill('65');
        await p.getByRole('button', { name: 'Save profile', exact: true }).click();
        await p.getByLabel('Experience', { exact: true }).waitFor();
        assert.equal((await api(athlete, '/api/plan')).plans[0].id, originalPlan);
        await fillGoals(p, { hours: '2', weeks: '24', maximum: '40' });
        await p.getByRole('button', { name: 'Save goals and race', exact: true }).click();
        await p.getByRole('button', { name: 'Review and build my plan', exact: true }).click();
        await p.waitForURL('**/training');
        assert.equal((await api(athlete, '/api/plan')).plans[0].id, originalPlan);
        await p.getByText('Review changes to future training', { exact: true }).click();
        await p.getByRole('button', { name: 'Preview Plan', exact: true }).click();
        await p.getByRole('button', { name: 'Confirm and save this plan', exact: true }).waitFor();
        await shot(p, '06-returning-review');
        await p.getByRole('button', { name: 'Confirm and save this plan', exact: true }).click();
        await p.getByText('Your structured training cycle is saved.', { exact: false }).waitFor();
        const plan = (await api(athlete, '/api/plan')).plans[0];
        assert.notEqual(plan.id, originalPlan);
        assert.equal(plan.weeks, 24);
        assert.deepEqual(await db.workout.findUnique({ where: { id: completed.id } }), completed);
        const retainedFeedback = await db.workout.findUnique({ where: { id: feedbackRecord.id } });
        // Superseding a partly performed plan changes archival flags, never its actual report or prescription.
        assert.deepEqual(retainedFeedback, { ...feedbackRecord, planned: false, source: 'superseded-plan' });
        const history = await api(athlete, '/api/calendar?month=auto');
        const visibleFeedback = history.workouts.find(workout => workout.id === feedbackRecord.id);
        assert.ok(visibleFeedback, 'The partial report must remain retrievable in calendar history');
        assert.equal(visibleFeedback.feedbackStatus, 'partial');
        assert.equal(visibleFeedback.actualDurationMin, 15);
        assert.equal(visibleFeedback.rpe, 3);
        await shot(p, '07-returning-saved-cycle');
    });
    await scenario('390px main Profile navigation: editable saved profile survives reload without replacing the active cycle', async () => {
        assert.ok(originalPlan, 'Requires the confirmed new-athlete plan');
        const prior = (await api(athlete, '/api/plan')).plans[0].id;
        await p.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Profile', exact: true }).click();
        await p.waitForURL('**/settings');
        await p.getByRole('heading', { name: 'Athlete Profile', exact: true }).waitFor();
        assert.equal(await p.getByLabel('Weight (kg)', { exact: true }).inputValue(), '65');
        await p.getByLabel('Height (cm)', { exact: true }).fill('171');
        const saved = p.waitForResponse(r => r.url().endsWith('/api/profile') && r.request().method() === 'PUT');
        await p.getByRole('button', { name: 'Save Profile', exact: true }).click();
        assert.equal((await saved).status(), 200);
        await p.reload();
        await p.getByRole('heading', { name: 'Athlete Profile', exact: true }).waitFor();
        assert.equal(await p.getByLabel('Height (cm)', { exact: true }).inputValue(), '171');
        assert.equal((await api(athlete, '/api/plan')).plans[0].id, prior);
        await shot(p, '07b-profile-nav-reloaded');
        const blank = await actor('returning-unknown', { onboarded: true });
        const q = await pageFor(blank);
        await q.goto(base + '/settings');
        await q.getByRole('heading', { name: 'Athlete Profile', exact: true }).waitFor();
        assert.equal(await q.getByLabel('Weight (kg)', { exact: true }).inputValue(), '');
        await q.getByLabel('Weight (kg)', { exact: true }).fill('64');
        const blankSaved = q.waitForResponse(r => r.url().endsWith('/api/profile') && r.request().method() === 'PUT');
        await q.getByRole('button', { name: 'Save Profile', exact: true }).click();
        assert.equal((await blankSaved).status(), 200);
        const untouched = await api(blank, '/api/profile');
        assert.equal(untouched.profile.goal, null, 'An unrelated profile edit must not invent a goal');
        assert.equal(untouched.profile.birthYear, null);
        assert.equal(untouched.profile.maxHr, null);
        assert.equal(untouched.profile.weightKg, 64);
    });
    await scenario('412px Android-like synchronized athlete: stored history and reviewed uploaded weight are honest, prefilled details persist', async () => {
        const a = await actor('synchronized', { profile: {
                birthYear: 1991,
                sex: 'female',
                heightCm: 168,
                weightKg: 61
            } });
        await db.connector.create({ data: {
                userId: a.id,
                provider: 'strava',
                status: 'connected',
                lastSyncAt: new Date(date + 'T12:00:00Z'),
                lastSyncCount: 2
            } });
        for (let i = 0; i < 2; i++)
            await db.workout.create({ data: {
                    userId: a.id,
                    date: new Date(date + 'T12:00:00Z'),
                    sport: 'run',
                    title: 'Synthetic imported browser history',
                    type: 'endurance',
                    durationMin: 30,
                    intensity: 'z2',
                    completed: true,
                    planned: false,
                    source: 'strava',
                    externalId: 'synthetic-' + randomUUID()
                } });
        await db.metricObservation.create({ data: {
                userId: a.id,
                observedAt: new Date(date + 'T12:00:00Z'),
                metricType: 'weight_kg',
                value: 62.4,
                unit: 'kg',
                source: 'apple_health',
                measurementMethod: 'uploaded_file',
                qualityFlag: 'ok'
            } });
        const q = await pageFor(a, 412);
        await q.goto(base + '/onboard');
        await q.getByRole('button', { name: 'Continue to review my information', exact: true }).waitFor();
        await shot(q, '08-android-synchronized-connections');
        await q.getByRole('button', { name: 'Continue to review my information', exact: true }).click();
        await q.getByText('2 completed imported activities stored', { exact: true }).waitFor();
        assert.equal(await q.getByLabel('Birth year', { exact: true }).inputValue(), '1991');
        assert.equal(await q.getByLabel('Height (cm)', { exact: true }).inputValue(), '168');
        assert.equal(await q.getByLabel('Weight (kg)', { exact: true }).inputValue(), '61');
        await q.getByRole('button', { name: 'Use this reviewed weight', exact: true }).click();
        await q.getByRole('button', { name: 'Save profile', exact: true }).click();
        await q.getByLabel('Experience', { exact: true }).waitFor();
        await q.reload();
        await q.getByRole('button', { name: '2. Profile', exact: true }).click();
        assert.equal(await q.getByLabel('Weight (kg)', { exact: true }).inputValue(), '62.4');
        assert.equal((await api(a, '/api/profile')).profile.weightSource, 'apple_health');
        await shot(q, '09-android-reviewed-profile');
    });
    await scenario('Mobile language units: auto resolves English to miles and Spanish to kilometres; explicit preferences remain unchanged', async () => {
        for (const [language, units, expected, width] of [['en', 'auto', 'imperial', 390], ['es', 'auto', 'metric', 412], ['en', 'metric', 'metric', 412], ['es', 'imperial', 'imperial', 390]]) {
            const a = await actor(`${language}-${units}`, { onboarded: true, language, profile: { units } });
            const today = await api(a, '/api/today');
            assert.equal(today.units, expected, `${language}/${units}`);
            const q = await pageFor(a, width);
            await q.goto(base + '/today');
            await q.getByRole('heading', { name: language === 'es' ? 'Entrenamiento de hoy' : "Today's training", exact: true }).waitFor();
            await shot(q, `10-${language}-${units}-${width}`);
        }
    });
})().catch(e => {
    console.error(e);
    process.exitCode = 1;
}).finally(async () => {
    await browser?.close();
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const remaining = await db.user.count({ where: { id: { in: ids } } });
    await db.$disconnect();
    fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify({
        syntheticOnly: true,
        physicalDevice: false,
        browser: 'Chromium mobile emulation',
        results,
        remainingFixtureUsers: remaining,
        blockedBrowserRequests: blockedRequests,
        pageErrors
    }, null, 2));
    console.log(JSON.stringify({
        passed: results.filter(r => r.status === 'PASS').length,
        total: results.length,
        remainingFixtureUsers: remaining,
        blockedBrowserRequests: blockedRequests,
        pageErrors
    }));
    if (results.some(r => r.status === 'FAIL') || remaining || pageErrors.length || blockedRequests.length)
        process.exitCode = 1;
});
