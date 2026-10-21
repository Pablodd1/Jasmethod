import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { eventLookupInput } from './race-event-lookup';
import { validateRaceWeatherRequest } from './race-weather';
import { readScenarioJson } from './race-scenario-http';
import { appMutationOriginAllowed } from './request-origin';
function fixture(route: 'lookup' | 'environment') {
    const state = { authenticated: true, allowed: true, rate: true, calls: 0 };
    class ApiError extends Error {
        constructor(message: string, public status = 400) { super(message); }
    }
    const deps: Record<string, unknown> = {
        '@/lib/access': { ApiError, trainingAccess: async () => { if (!state.authenticated)
                throw new ApiError('Sign in', 401); if (!state.allowed)
                throw new ApiError('Foreign athlete', 403); return { actor: { id: 'owner' } }; } },
        '@/lib/ratelimit': { rateLimit: () => ({ ok: state.rate }) },
        '@/lib/request-origin': { appMutationOriginAllowed: (r: Request) => appMutationOriginAllowed(r, { APP_URL: 'https://example.test' }) },
        '@/lib/race-scenario-http': { readScenarioJson: async (r: Request, max: number) => { try {
                return await readScenarioJson(r, max);
            }
            catch (e) {
                throw new ApiError((e as Error).message, (e as any).status ?? 400);
            } }, SCENARIO_HEADERS: { 'Cache-Control': 'private, no-store' }, scenarioError: (e: any) => Response.json({ error: e.message }, { status: e.status ?? 500 }) },
        '@/lib/race-event-lookup': { eventLookupInput, lookupRaceEvents: async () => { state.calls++; return []; }, lookupRaceVenue: async () => { state.calls++; return []; } },
        '@/lib/race-weather': { validateRaceWeatherRequest },
        '@/lib/race-environment': { getRaceEnvironment: async () => { state.calls++; return { status: 'unavailable', label: 'insufficient_weather_data', snapshot: null }; } },
    };
    const mod = { exports: {} as any };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/app/api/race-scenarios/${route}/route.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, require: (id: string) => { if (!(id in deps))
            throw Error(id); return deps[id]; }, Request, Response, URL, process: { env: {} } });
    const body = route === 'lookup' ? { query: 'Public race', mode: 'name' } : { latitude: 25, longitude: -80, at: '2026-10-22T12:00:00Z', timeZone: 'America/New_York' };
    return { state, body, post: (value: unknown = body, origin = 'https://example.test') => mod.exports.POST(new Request(`https://example.test/api/race-scenarios/${route}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(value) })) };
}
for (const route of ['lookup', 'environment'] as const)
    test(`${route} actual route authenticates, scopes, checks origin and limits before any provider call`, async () => { const f = fixture(route); f.state.authenticated = false; assert.equal((await f.post()).status, 401); f.state.authenticated = true; f.state.allowed = false; assert.equal((await f.post()).status, 403); f.state.allowed = true; assert.equal((await f.post(f.body, 'https://foreign.invalid')).status, 403); assert.equal((await f.post({ ...f.body, heartRate: 180 })).status, 400); assert.equal((await f.post({ query: 'a'.repeat(3000) })).status, 413); f.state.rate = false; assert.equal((await f.post()).status, 429); assert.equal(f.state.calls, 0); f.state.rate = true; const r = await f.post(); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'private, no-store'); assert.equal(f.state.calls, 1); if (route === 'environment')
        assert.equal((await r.json()).status, 'unavailable'); });
