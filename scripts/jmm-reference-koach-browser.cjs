/** Synthetic browser acceptance; all API responses and writes are intercepted.
 * Start the built test app separately, then run:
 * node scripts/jmm-reference-koach-browser.cjs
 * JMM_UI_TEST_BASE must be an isolated 127.0.0.1 HTTP server. */
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');

const base = process.env.JMM_UI_TEST_BASE || 'http://127.0.0.1:3220';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/, 'Only the isolated loopback test app is allowed');
const output = '.local/jmm-reference-koach-browser';
mkdirSync(output, { recursive: true });
const results = [], errors = [], unexpected = [];
const today = new Date().toISOString().slice(0, 10);

async function journey(browser, language, units) {
  const es = language === 'es';
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: es ? 'es-ES' : 'en-US', serviceWorkers: 'block' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  let profile = { units, goal: 'run-only', runPaceBase: 300, swimPaceBase: 100, ftp: null, manualPrs: '[]' };
  let revision = 'synthetic-profile-0', writes = [], coachMessages = [];
  const coachPayload=()=>({ok:true,conversation:{id:'synthetic-conversation',messages:coachMessages},sessions:[],capabilities:{externalAi:false},displayUnits:units});
  const user = { id: 'synthetic-reference-owner', name: 'Synthetic athlete', email: 'reference@example.invalid', role: 'athlete', language, timezone: 'UTC', onboarded: true, profile: { units } };
  page.on('pageerror', error => errors.push(`${language}/${units}: ${error.message}`));
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== base) { unexpected.push(`${request.method()} external request`); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: { user } });
    if (path === '/api/profile') {
      if (request.method() === 'GET') return route.fulfill({ json: { profile, revision, zones: null } });
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        assert.equal(body.expectedRevision, revision, 'Uses the revision the athlete reviewed');
        assert.deepEqual(Object.keys(body).sort(), (Object.hasOwn(body, 'runPaceBase') ? ['expectedRevision', 'manualPrs', 'runPaceBase'] : ['expectedRevision', 'manualPrs']).sort(), 'Only intended profile fields are submitted');
        const { expectedRevision, ...patch } = body;
        writes.push(body); profile = { ...profile, ...patch }; revision = `synthetic-profile-${writes.length}`;
        return route.fulfill({ json: { ok: true, revision, profile } });
      }
    }
    if(path==='/api/assistant'){
      if(request.method()==='GET')return route.fulfill({json:coachPayload()});
      if(request.method()==='POST'){
        const body=request.postDataJSON();assert.doesNotMatch(JSON.stringify(body),/manualPrs|165|athlete_reported_reference/,'No local reference facts are submitted with the question');
        coachMessages=[{id:'synthetic-question',role:'user',content:body.message,source:'text',createdAt:new Date().toISOString()},{id:'synthetic-answer',role:'assistant',content:es?'Consulta tus referencias guardadas.':'Review your saved references.',source:'local',createdAt:new Date().toISOString()}];
        return route.fulfill({json:{...coachPayload(),protectedProfileAnswer:{kind:'profile_reference',privacy:'local_only',sourceMessageId:'synthetic-question',title:es?'Tus referencias guardadas':'Your saved references',answer:es?'Referencia declarada por deporte.':'Reported sport reference.',displayUnits:units,clarification:null,fields:[{field:'lthr',label:es?'Umbral de ciclismo':'Cycling threshold',sport:'bike',value:165,unit:'bpm',display:'165 bpm',source:'athlete_reported_reference',observedAt:today,provenance:'athlete_reported',note:es?'Dato declarado; no es una medición verificada.':'Athlete report; not a verified measurement.'}]}}});
      }
    }
    if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${path}`); return route.fulfill({ status: 403, json: { error: 'Unexpected mutation blocked' } }); }
    if (path === '/api/prs') return route.fulfill({ json: { revision: 'synthetic-prs', manual: [], records: [] } });
    if (path === '/api/today') return route.fulfill({ json: url.searchParams.get('view') === 'plan'
      ? { kind: 'saved_today_plan', readOnly: true, date: today, timezone: 'UTC', sessions: [] }
      : { date: today, timezone: 'UTC', units, sessions: [], connectors: [], cycle: { start: today, end: today, status: 'active', weeks: 1, currentWeek: 1 } } });
    if (path === '/api/assistant') return route.fulfill({ status: 503, json: { error: 'Synthetic assistant unavailable' } });
    return route.fulfill({ status: 503, json: { error: 'Synthetic optional service unavailable' } });
  });
  async function shot(step) {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${step}: horizontal overflow`);
    const artifact = `${language}-${units}-${step}.png`;
    await page.screenshot({ path: `${output}/${artifact}`, fullPage: true });
    results.push({ language, units, step, artifact, status: 'PASS' });
  }
  try {
    await page.goto(`${base}/settings`);
    const hr = page.getByRole('region', { name: es ? 'Referencias de FC por deporte' : 'Heart-rate references by sport' });
    await hr.waitFor();
    const run = page.locator('#profile-runPaceBase'), swim = page.locator('#profile-swimPaceBase');
    await run.waitFor();
    assert.equal(await run.inputValue(), units === 'metric' ? '5:00' : '8:03');
    assert.equal(await swim.inputValue(), units === 'metric' ? '1:40' : '1:31');
    assert.match(await run.getAttribute('type'), /^text$/);
    assert.match(await run.locator('..').innerText(), units === 'metric' ? /min:sec\/km/ : /min:sec\/mi/);
    assert.match(await swim.locator('..').innerText(), units === 'metric' ? /min:sec\/100 m/ : /min:sec\/100 yd/);
    await hr.getByText(es ? 'Añadir una referencia que falta' : 'Add a missing reference', { exact: true }).click();
    await hr.getByLabel(es ? 'Deporte' : 'Sport', { exact: true }).selectOption('bike');
    await hr.getByLabel(es ? 'Referencia' : 'Reference', { exact: true }).selectOption('lthr');
    await hr.getByLabel('bpm', { exact: true }).fill('165');
    await hr.getByRole('button', { name: es ? 'Guardar referencia' : 'Save reference', exact: true }).click();
    await hr.getByRole('alert').waitFor();
    assert.equal(writes.length, 0, 'Missing date must not trigger a save');
    await shot('01-hr-date-required');
    await hr.getByLabel(es ? 'Fecha de observación' : 'Observation date').fill(today);
    await hr.getByLabel(es?'Referencia':'Reference',{exact:true}).selectOption('maxHr');
    assert.equal(await hr.getByLabel('bpm',{exact:true}).inputValue(),'','Changing metric cannot carry another reference value');
    assert.equal(await hr.getByLabel(es?'Fecha de observación':'Observation date').inputValue(),'');
    await hr.getByLabel(es?'Referencia':'Reference',{exact:true}).selectOption('lthr');
    await hr.getByLabel('bpm',{exact:true}).fill('165');
    await hr.getByLabel(es?'Fecha de observación':'Observation date').fill(today);
    await hr.getByRole('button', { name: es ? 'Guardar referencia' : 'Save reference', exact: true }).click();
    await page.getByRole('status').filter({ hasText: es ? 'Referencia guardada.' : 'Reference saved.' }).waitFor();
    assert.equal(writes.length, 1);
    const hrRows = JSON.parse(profile.manualPrs);
    assert.ok(hrRows.some(row => row.label === 'JMM manual bike lthr reference' && row.value === 165 && row.unit === 'bpm' && row.date === today));
    assert.equal(profile.runPaceBase, 300); assert.equal(profile.swimPaceBase, 100);
    await page.reload();
    await page.getByText(new RegExp(`165 bpm.*${today}`)).waitFor();
    assert.equal(await run.inputValue(), units === 'metric' ? '5:00' : '8:03');
    assert.equal(await swim.inputValue(), units === 'metric' ? '1:40' : '1:31');
    await shot('02-hr-saved-reloaded');

    const pace = page.locator('section').filter({ has: page.getByRole('heading', { name: es ? 'Ritmo y potencia por deporte' : 'Pace and power by sport', exact: true }) });
    await pace.getByText(es ? 'Añadir referencia conocida' : 'Add a known reference', { exact: true }).click();
    await pace.getByLabel(es ? 'Referencia por deporte' : 'Sport reference').selectOption('runPaceBase');
    const paceInput = pace.locator('input[placeholder="m:ss"]');
    await paceInput.fill(units === 'metric' ? '5:10' : '8:19');
    await pace.getByRole('button', { name: es ? 'Guardar referencia' : 'Save reference', exact: true }).click();
    await pace.getByRole('alert').waitFor(); assert.equal(writes.length, 1, 'A dated pace cannot save without its observation date');
    await pace.getByLabel(es ? 'Fecha de referencia' : 'Reference date').fill(today);
    await pace.getByRole('button', { name: es ? 'Guardar referencia' : 'Save reference', exact: true }).click();
    await page.getByRole('status').filter({ hasText: es ? 'Referencia guardada.' : 'Reference saved.' }).waitFor();
    assert.equal(writes.length, 2);
    assert.ok(Math.abs(profile.runPaceBase - (units === 'metric' ? 310 : 499 / 1.609344)) < 0.001);
    assert.equal(profile.swimPaceBase, 100);
    assert.ok(JSON.parse(profile.manualPrs).some(row => row.label === 'JMM manual run threshold reference' && row.value === profile.runPaceBase && row.date === today && row.unit === 'sec/km'));
    await page.reload(); await page.locator('#profile-runPaceBase').waitFor();
    assert.equal(await page.locator('#profile-runPaceBase').inputValue(), units === 'metric' ? '5:10' : '8:19');
    assert.equal(await page.locator('#profile-swimPaceBase').inputValue(), units === 'metric' ? '1:40' : '1:31');
    await shot('03-pace-saved-reloaded');

    await page.goto(`${base}/today`);
    const coachLink = page.locator('nav.jmm-mobile-nav').getByRole('link', { name: 'Koach', exact: true });
    await coachLink.waitFor(); assert.equal(await coachLink.getAttribute('href'), '/coach');
    assert.equal(await page.locator('#jasai textarea').count(), 0, 'Today must not render the private coach conversation');
    assert.equal(await page.locator('#coach-conversation').count(), 0, 'Today must not render the athlete–human coach conversation');
    assert.equal(await page.getByRole('heading', { name: 'JMM Koach', exact: true }).count(), 0, 'The conversation has one dedicated home');
    await shot('04-today-koach-link');
    await coachLink.click(); await page.waitForURL('**/coach');
    await page.getByRole('heading', { name: 'JMM Koach', exact: true }).first().waitFor({ state: 'attached' });
    await page.getByLabel(es?'Tu mensaje':'Your message',{exact:true}).fill(es?'¿Cuál es mi LTHR de ciclismo?':'What is my cycling LTHR?');
    await page.getByRole('button',{name:es?'Enviar mensaje':'Send message',exact:true}).click();
    const protectedCard=page.getByRole('region',{name:es?'Datos del atleta en JMM':'Athlete facts in JMM'});
    await protectedCard.waitFor();assert.match(await protectedCard.innerText(),/165 bpm/);assert.ok((await protectedCard.innerText()).includes(today));
    await shot('05-koach-route');
    await page.reload();await page.getByLabel(es?'Tu mensaje':'Your message',{exact:true}).waitFor();assert.equal(await protectedCard.count(),0,'Reload never restores a protected card from chat history');
    assert.ok(coachMessages.every(m=>!m.content.includes('165')));
    assert.equal(writes.length, 2, 'Only the two explicitly confirmed reference saves write');
  } catch(error) { await page.screenshot({path:`${output}/${language}-${units}-failure.png`,fullPage:true}); throw error; } finally { await context.close(); }
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    for (const language of ['en', 'es']) for (const units of ['metric', 'imperial']) await journey(browser, language, units);
    assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
  } finally { await browser.close(); writeFileSync(`${output}/report.json`, JSON.stringify({ results, errors, unexpected }, null, 2)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
