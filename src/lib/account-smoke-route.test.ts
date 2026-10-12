// @ts-nocheck -- isolated route VM replaces auth/database/provider boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as core from './account-smoke-test';
import { appMutationOriginAllowed } from './request-origin';
import { MANUAL_EMAIL_CONSENT } from './manual-workout-email';
import { TELEGRAM_CONSENT_VERSION } from './coaching-communication';

const origin = 'https://app.example.invalid';
const owner = 'athlete-a';
function load(file, deps) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, { module: sandboxModule, exports: sandboxModule.exports, require: key => {
    if (!(key in deps)) throw Error(`Unmocked dependency: ${key}`);
    return deps[key];
  }, Response, Date, URL, Buffer });
  return sandboxModule.exports;
}
function fixture() {
  let user = { id: owner, email: 'owner@example.invalid', role: 'ATHLETE' };
  let broken = false, limited = false, emailVerified = true;
  let result = { status: 'provider_accepted', receiptId: 'synthetic-receipt' };
  let sendHook = async () => {};
  const env = { ENABLE_ACCOUNT_SMOKE_TEST: 'true', JMM_SMOKE_TEST_USER_ID: owner,
    NEXT_PUBLIC_APP_URL: origin, NODE_ENV: 'production', SMTP_HOST: 'smtp.example.invalid', SMTP_FROM: 'sender@example.invalid', TELEGRAM_BOT_TOKEN: 'SYNTHETIC_ONLY' };
  const rows = new Map(), sends = [], reads = [];
  const check = id => { assert.equal(id, owner); reads.push(id); if (broken) throw Error('SECRET DATABASE DETAILS'); };
  const db = {
    user: { findUniqueOrThrow: async ({ where }) => { check(where.id); return { id: owner, email: 'owner@example.invalid' }; } },
    communicationPreference: { findUnique: async ({ where }) => { check(where.userId); return { verifiedChatId: '12345', verifiedActorId: '12345', verifiedAt: new Date(1), verificationTransport: 'telegram', paused: false, consentVersion: TELEGRAM_CONSENT_VERSION, consentAt: new Date(1) }; } },
    manualWorkoutEmailPreference: { findUnique: async ({ where }) => { check(where.userId); return { enabled: true, recipient: 'owner@example.invalid', verifiedAt: emailVerified ? new Date(1) : null, consentVersion: MANUAL_EMAIL_CONSENT, consentAt: new Date(1) }; } },
    accountSmokeTelegram: { findUnique: async ({ where }) => { check(where.userId); return null; } },
    connector: { findUnique: async ({ where }) => { check(where.userId_provider.userId); assert.equal(where.userId_provider.provider, 'google_cal_smoke'); return null; } },
    accountSmokeReceipt: {
      findMany: async ({ where }) => { check(where.userId); assert.equal(where.consentVersion, core.SMOKE_CONSENT); return [...rows.values()].map(row => ({ ...row })); },
      create: async ({ data }) => { check(data.userId); if (rows.has(data.channel)) throw { code: 'P2002' }; const row = { ...data, status: 'processing', receiptId: null, createdAt: new Date(), updatedAt: new Date() }; rows.set(data.channel, row); return { ...row }; },
      findUniqueOrThrow: async ({ where }) => { const key = where.userId_channel_consentVersion; check(key.userId); assert.equal(key.consentVersion, core.SMOKE_CONSENT); return { ...rows.get(key.channel) }; },
      updateMany: async ({ where, data }) => { check(where.userId); assert.equal(where.status, 'processing'); const row = rows.get(where.channel); if (row?.status !== where.status) return { count: 0 }; rows.set(where.channel, { ...row, ...data, updatedAt: new Date() }); return { count: 1 }; },
    },
  };
  const store = load('src/lib/account-smoke-store.ts', { './db': { prisma: db }, './account-smoke-test': core }).accountSmokeStore;
  const sender = channel => async (destination, code) => { sends.push({ channel, destination, ...(code ? { code } : {}) }); await sendHook(); return result; };
  const route = load('src/app/api/account/smoke-test/route.ts', {
    '@/lib/auth': { getCurrentUser: async () => user }, '@/lib/db': { prisma: db },
    '@/lib/request-origin': { appMutationOriginAllowed: req => appMutationOriginAllowed(req, env) },
    '@/lib/ratelimit': { rateLimit: () => ({ ok: !limited }) }, '@/lib/account-smoke-store': { accountSmokeStore: store },
    '@/lib/account-smoke-test': { ...core, smokeAccountAllowed: id => core.smokeAccountAllowed(id, env), smokeDestination: (snapshot, channel) => core.smokeDestination(snapshot, channel, env), runAccountSmoke: (id, request, deps) => core.runAccountSmoke(id, request, { ...deps, env }) },
    '@/lib/account-smoke-transport': { sendSmokeEmail: sender('email'), sendSmokeEmailVerification: sender('verification'), sendSmokeTelegram: sender('telegram'), sendSmokeCalendar: sender('calendar') },
    '@/lib/crypto': { decryptSecret: () => { throw Error('Unexpected calendar decrypt'); } },
  });
  return { route, sends, reads, env, rows, unverifyEmail: () => { emailVerified = false; }, setUser: value => { user = value; }, breakStorage: () => { broken = true; }, limit: () => { limited = true; }, setResult: value => { result = value; }, setSendHook: value => { sendHook = value; } };
}
const get = (query = '') => new Request(`${origin}/api/account/smoke-test${query}`);
function post(body, headers = {}, query = '') {
  return new Request(`${origin}/api/account/smoke-test${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(body) });
}
async function consent(f, channel = 'email') {
  const response = await f.route.GET(get());
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json(), selected = data.channels.find(c => c.channel === channel);
  return { channel, consentVersion: data.consentVersion, destinationRevision: selected.destinationRevision };
}
test('smoke routes require signed-in allowlisted owner; admin cannot substitute another athlete', async () => {
  for (const user of [null, { id: 'admin-other', role: 'ADMIN' }]) {
    const f = fixture(); f.setUser(user);
    assert.equal((await f.route.GET(get())).status, user ? 403 : 401);
    assert.equal((await f.route.POST(post({}))).status, user ? 403 : 401);
    assert.equal(f.reads.length, 0); assert.equal(f.sends.length, 0);
  }
  const f = fixture(); f.env.ENABLE_ACCOUNT_SMOKE_TEST = 'false';
  assert.equal((await f.route.GET(get())).status, 403);
  assert.equal((await f.route.POST(post({}))).status, 403); assert.equal(f.reads.length, 0);
});
test('smoke routes reject target queries, CSRF and client-selected recipient before dispatch', async () => {
  const f = fixture(), body = await consent(f);
  for (const query of ['?athleteId=athlete-b', '?athleteId=athlete-a', '?channel=email']) {
    assert.equal((await f.route.GET(get(query))).status, 403);
    assert.equal((await f.route.POST(post(body, {}, query))).status, 403);
  }
  for (const headers of [{ Origin: '' }, { Origin: 'https://foreign.example.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await f.route.POST(post(body, headers))).status, 403);
  for (const extra of [{ recipient: 'victim@example.invalid' }, { userId: 'athlete-b' }, { to: 'victim@example.invalid' }, { channel: 'unsupported' }]) assert.equal((await f.route.POST(post({ ...body, ...extra }))).status, 400);
  assert.equal(f.sends.length, 0); assert.equal(f.rows.size, 0);
});
test('smoke routes expose only verified provider acceptance as HTTP 200 and never resend', async () => {
  for (const status of ['provider_accepted', 'unknown', 'rejected']) {
    const f = fixture(), body = await consent(f); f.setResult({ status, receiptId: status === 'provider_accepted' ? 'synthetic-receipt' : null });
    const response = await f.route.POST(post(body));
    assert.equal(response.status, status === 'provider_accepted' ? 200 : 409);
    assert.equal((await response.json()).receipt.status, status);
    assert.deepEqual(f.sends, [{ channel: 'email', destination: 'owner@example.invalid' }]);
    await f.route.POST(post(body)); assert.equal(f.sends.length, 1);
    const state = await (await f.route.GET(get())).json(); assert.equal(state.channels.find(c => c.channel === 'email').receipt.status, status);
    assert.doesNotMatch(JSON.stringify(state), /SYNTHETIC_ONLY|tokenEnc|verifiedChatId/);
  }
});
test('concurrent actual route requests claim only once and pending request returns HTTP 202', async () => {
  const f = fixture(), body = await consent(f, 'telegram');
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const sending = new Promise(resolve => { started = resolve; });
  f.setSendHook(async () => { started(); await gate; });
  const first = f.route.POST(post(body)); await sending;
  const second = await f.route.POST(post(body)); assert.equal(second.status, 202); assert.equal((await second.json()).receipt.status, 'processing');
  assert.equal(f.sends.length, 1); release(); assert.equal((await first).status, 200);
  assert.deepEqual(f.sends, [{ channel: 'telegram', destination: '12345' }]);
});
test('smoke route failures hide private details, malformed JSON and rate-limit without sends', async () => {
  const f = fixture(), body = await consent(f); f.breakStorage();
  const response = await f.route.GET(get()); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /SECRET|DATABASE/);
  const failed = await f.route.POST(post(body)); assert.equal(failed.status, 409); assert.doesNotMatch(await failed.text(), /SECRET|DATABASE/);
  assert.equal(f.sends.length, 0);
  const g = fixture(); g.limit(); assert.equal((await g.route.POST(post(body))).status, 429); assert.equal(g.sends.length, 0);
  const h = fixture(); assert.equal((await h.route.POST(new Request(`${origin}/api/account/smoke-test`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{' }))).status, 400); assert.equal(h.sends.length, 0);
});

test('unverified saved email gets one combined verification smoke send and no plaintext code in status', async () => {
  const f = fixture(); f.unverifyEmail(); const body = await consent(f);
  const response = await f.route.POST(post(body)); assert.equal(response.status, 200);
  assert.equal(f.sends.length, 1); assert.equal(f.sends[0].channel, 'verification'); assert.equal(f.sends[0].destination, 'owner@example.invalid');
  assert.match(f.sends[0].code, /^[A-F0-9]{12}$/);
  const receipt = await response.json(); assert.equal(receipt.receipt.verificationPending, true);
  const status = await (await f.route.GET(get())).text();
  assert.ok(!status.includes(f.sends[0].code)); assert.doesNotMatch(status, /verificationHash|verifiedEmailHash/);
  assert.ok(f.rows.get('email').verificationHash); assert.notEqual(f.rows.get('email').verificationHash, f.sends[0].code);
  await f.route.POST(post(body)); assert.equal(f.sends.length, 1);
});
