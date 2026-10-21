/** Synthetic UI acceptance only. Browser API requests are intercepted; no provider calls or writes. */
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const { parseEventCandidates } = require('../src/lib/race-event-lookup.ts');
const { parseHourlyEnvironment } = require('../src/lib/race-environment.ts');
const base = process.env.JMM_UI_TEST_BASE || 'http://127.0.0.1:3220';
assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
const dir = '.local/jmm-race-intelligence-browser';
mkdirSync(dir, { recursive: true });
const results = [], errors = [], unexpected = [];
const raw = { races: [{ race: { race_id: 1, name: 'Synthetic public race', is_private_race: 'F', is_draft_race: 'F', next_date: '10/22/2026', url: 'https://runsignup.com/Race/FL/Miami/Example', timezone: 'America/New_York', address: { street: '100 Main Street', city: 'Miami', state: 'FL', zipcode: '33101', country_code: 'US' }, events: [{ event_id: 1, name: '5K', start_time: '10/22/2026 07:30', event_type: 'running_race', distance: '5K' }, { event_id: 2, name: '10K', start_time: null, event_type: 'running_race', distance: '10K' }] } }] };
const candidates = parseEventCandidates(raw, '2026-10-21T12:00:00Z');
const point = parseHourlyEnvironment({ header: { time_standard: 'UTC', fill_value: -999, sources: ['Synthetic fixture'] }, parameters: { T2M: { units: 'C' }, RH2M: { units: '%' }, WS10M: { units: 'm/s' } }, properties: { parameter: { T2M: { '2026102211': 30 }, RH2M: { '2026102211': 75 }, WS10M: { '2026102211': 3 } } } }, { latitude: 25, longitude: -80, at: '2026-10-22T11:30:00Z', timeZone: 'America/New_York' }, 'historical', '2026-10-21T12:00:00Z')[0];
const environment = { status: 'available', label: 'live_forecast', requestedAtUTC: '2026-10-22T11:30:00Z', snapshot: { ...point, dataType: 'forecast', source: 'MET Norway', sourceUpdatedAtUTC: '2026-10-21T10:00:00Z' }, samples: [], ranges: {}, baselineYears: [], sourceUrl: 'https://api.met.no/', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: 'Based on data from MET Norway (synthetic test copy)', warnings: ['Synthetic forecast, not actual venue weather.'] };
async function main() {
    const browser = await chromium.launch({ headless: true });
    try {
        for (const lang of ['en', 'es'])
            for (const width of [390, 412]) {
                const es = lang === 'es', units = width === 390 ? (es ? 'metric' : 'imperial') : (es ? 'imperial' : 'metric'), context = await browser.newContext({ viewport: { width, height: 844 }, locale: lang }), page = await context.newPage();
                let lookups = 0, conditions = 0;
                page.on('pageerror', e => errors.push(e.message));
                await page.route('**/*', async (route) => {
                    const req = route.request(), u = new URL(req.url());
                    if (u.origin !== base) {
                        unexpected.push('external browser request');
                        return route.abort();
                    }
                    if (!u.pathname.startsWith('/api/'))
                        return route.continue();
                    if (u.pathname === '/api/auth/me')
                        return route.fulfill({ json: { user: { id: 'synthetic-owner', name: 'Synthetic owner', email: 'athlete@example.invalid', role: 'athlete', language: lang, timezone: 'America/New_York', onboarded: true, profile: { units } } } });
                    if (u.pathname === '/api/race-scenarios' && req.method() === 'GET')
                        return route.fulfill({ json: { revision: 'fixture', races: [{id:'other-race',name:'Other saved race',date:'2027-01-15T00:00:00Z',startTime:null,location:'Other venue',lat:null,lng:null,distance:'5k',courseKm:null,courseElevM:null,targetTempC:null,humidity:null,baseElevM:null}], anchors: [], snapshots: [] } });
                    if (u.pathname === '/api/race-scenarios/lookup') {
                        lookups++;
                        const body = req.postDataJSON();
                        if (body.mode === 'venue')
                            return route.fulfill({ json: { venues: [{ latitude: 25, longitude: -80, label: '100 MAIN STREET, MIAMI', source: 'US Census Geocoder', sourceUrl: 'https://geocoding.geo.census.gov/' }] } });
                        return route.fulfill({ json: { candidates, requiresConfirmation: true } });
                    }
                    if (u.pathname === '/api/race-scenarios/environment') {
                        conditions++;
                        const body = req.postDataJSON();
                        assert.equal(body.at, '2026-10-22T07:30:00-04:00');
                        assert.equal(body.latitude, 25);
                        assert.deepEqual(Object.keys(body).sort(), ['at', 'latitude', 'longitude', 'timeZone']);
                        return route.fulfill({ json: environment });
                    }
                    if (req.method() !== 'GET') {
                        unexpected.push(req.method() + ' ' + u.pathname);
                        return route.fulfill({ status: 500, json: { error: 'Unexpected write' } });
                    }
                    return route.fulfill({ json: { ok: true } });
                });
                await page.goto(base + '/races/scenarios');
                const card = page.locator('section[aria-labelledby="race-intelligence-title"]');
                await card.getByRole('button', { name: es ? 'Buscar carrera' : 'Find race', exact: true }).waitFor();
                await card.getByLabel(es ? 'Carrera o ciudad' : 'Race or city', { exact: true }).fill('Synthetic');
                await card.getByRole('button', { name: es ? 'Buscar carrera' : 'Find race', exact: true }).click();
                await card.getByRole('button', { name: es ? 'Confirmar evento' : 'Confirm this event', exact: true }).nth(1).click();
                assert.equal(await page.getByLabel(es ? 'Nombre del escenario / evento' : 'Scenario / event name', { exact: true }).inputValue(), 'Synthetic public race · 10K');
                assert.equal(await page.getByLabel(es ? 'Hora local' : 'Local time', { exact: true }).inputValue(), '');
                await page.getByLabel(es ? 'Hora local' : 'Local time', { exact: true }).fill('07:30');
                await card.getByRole('button', { name: es ? 'Buscar dirección del lugar' : 'Find venue address', exact: true }).click();
                await card.getByRole('button', { name: es ? 'Confirmar coordenadas' : 'Confirm venue coordinates', exact: true }).click();
                await card.getByRole('button', { name: es ? 'Consultar condiciones' : 'Get race conditions', exact: true }).click();
                await card.getByRole('heading', { name: es ? 'Pronóstico disponible' : 'Live forecast', exact: true }).waitFor();
                assert.ok((await card.innerText()).includes(units === 'imperial' ? '86°F' : '30°C'));
                await card.getByText(es ? 'Detalles y correcciones' : 'Weather details and corrections', { exact: true }).click();
                await card.getByLabel(es ? `Punto de rocío (${units === 'imperial' ? '°F' : '°C'})` : `Dew point (${units === 'imperial' ? '°F' : '°C'})`, { exact: true }).fill(units === 'imperial' ? '110' : '40');
                await card.getByRole('button', { name: es ? 'Recalcular condiciones mostradas' : 'Recalculate displayed conditions', exact: true }).click();
                assert.ok(await card.getByRole('alert').isVisible());
                await card.getByLabel(es ? `Punto de rocío (${units === 'imperial' ? '°F' : '°C'})` : `Dew point (${units === 'imperial' ? '°F' : '°C'})`, { exact: true }).fill(units === 'imperial' ? '68' : '20');
                await card.getByRole('button', { name: es ? 'Recalcular condiciones mostradas' : 'Recalculate displayed conditions', exact: true }).click();
                await card.getByRole('button', { name: es ? 'Consultar condiciones' : 'Get race conditions', exact: true }).click();
                assert.equal(conditions, 1);
                assert.match(await card.getByRole('alert').innerText(), es ? /conservan/ : /retained/);
                await card.getByRole('button', { name: es ? 'Adjuntar contexto al escenario' : 'Attach context to this scenario', exact: true }).click();
                assert.equal(lookups, 2);
                assert.equal(await page.locator('#conditions').getByLabel(es ? 'Temperatura (°C)' : 'Temperature (°C)', { exact: true }).inputValue(), '30');
                await page.screenshot({ path: `${dir}/${lang}-${width}.png`, fullPage: true });
                const geometry = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
                assert.ok(geometry.scroll <= geometry.viewport + 1, JSON.stringify(geometry));
                await page.getByLabel(es ? 'Carrera guardada' : 'Saved race',{exact:true}).selectOption('other-race');
                assert.equal(await card.getByRole('heading',{name:es ? 'Pronóstico disponible' : 'Live forecast',exact:true}).count(),0);
                results.push({ switchedRaceClearsWeather:true, lang, width, units, ambiguousSelection: true, missingTimeNotInvented: true, venueConfirmed: true, manualCorrectionRetained: true, contextAttached: true, geometry });
                await context.close();
            }
    }
    finally {
        await browser.close();
        writeFileSync(`${dir}/report.json`, JSON.stringify({ results, errors, unexpected, scope: 'Synthetic Chromium API-mocked browser only; provider acceptance, native devices and personalized accuracy not tested' }, null, 2));
    }
    assert.equal(errors.length, 0);
    assert.equal(unexpected.length, 0);
    console.log(`${results.length} race intelligence browser journeys passed`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
