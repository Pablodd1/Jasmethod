// @ts-nocheck -- actual verification handler with isolated database/auth boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as verification from './account-smoke-verification';
import { SMOKE_CONSENT, smokeAccountAllowed } from './account-smoke-test';
import { appMutationOriginAllowed } from './request-origin';
const origin = 'https://app.example.invalid';
const owner = 'athlete-a', email = 'owner@example.invalid', code = 'ABCDEF123456';
function fixture(patch = {}) {
  let user = { id: owner, email }, savedEmail = email, reads = 0;
  let row = { id: 'receipt', userId: owner, channel: 'email', consentVersion: SMOKE_CONSENT,
    verificationHash: verification.smokeCodeHash(owner, email, code), verifiedEmailHash: verification.smokeEmailHash(email),
    verificationExpiresAt: new Date(Date.now() + 60000), verificationAttempts: 0, verifiedAt: null, status: 'provider_accepted', ...patch };
  const writes = [], env = { ENABLE_ACCOUNT_SMOKE_TEST: 'true', JMM_SMOKE_TEST_USER_ID: owner, NEXT_PUBLIC_APP_URL: origin, NODE_ENV: 'production' };
  const tx = {
    user: { findUniqueOrThrow: async ({ where, select }) => { reads++; assert.equal(where.id, owner); assert.equal(select.email, true); return { email: savedEmail }; } },
    accountSmokeReceipt: {
      findUnique: async ({ where }) => { reads++; const key = where.userId_channel_consentVersion; assert.equal(key.userId, owner); assert.equal(key.channel, 'email'); assert.equal(key.consentVersion, SMOKE_CONSENT); return row ? { ...row } : null; },
      updateMany: async ({ where, data }) => {
        assert.equal(where.id, 'receipt'); assert.equal(where.userId, owner); assert.equal(where.verifiedAt, null);
        if (!row || row.userId !== where.userId || row.verifiedAt || row.verificationHash !== where.verificationHash || (where.verificationExpiresAt && row.verificationExpiresAt <= where.verificationExpiresAt.gt) || (where.verificationAttempts && row.verificationAttempts >= where.verificationAttempts.lt)) return { count: 0 };
        writes.push(data); row = { ...row, ...data, verificationAttempts: data.verificationAttempts ? row.verificationAttempts + data.verificationAttempts.increment : row.verificationAttempts }; return { count: 1 };
      },
    },
  };
  // There are deliberately no normal email-preference or transport dependencies.
  const db = { $transaction: async (work, options) => { assert.equal(options.isolationLevel, 'Serializable'); return work(tx); } };
  const deps = { '@/lib/auth': { getCurrentUser: async () => user }, '@/lib/db': { prisma: db },
    '@/lib/account-smoke-test': { SMOKE_CONSENT, smokeAccountAllowed: id => smokeAccountAllowed(id, env) },
    '@/lib/request-origin': { appMutationOriginAllowed: req => appMutationOriginAllowed(req, env) }, '@/lib/account-smoke-verification': verification };
  const compiled = ts.transpileModule(fs.readFileSync('src/app/api/account/smoke-test/email/verify/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandboxModule = { exports: {} };
  vm.runInNewContext(compiled, { module: sandboxModule, exports: sandboxModule.exports, require: key => { if (!(key in deps)) throw Error(`Unmocked dependency ${key}`); return deps[key]; }, Response, Date, URL, Buffer });
  return { route: sandboxModule.exports, writes, env, getRow: () => row, reads: () => reads, setUser: value => { user = value; }, setEmail: value => { savedEmail = value; } };
}
const req = (body = { code }, headers = {}, query = '') => new Request(`${origin}/api/account/smoke-test/email/verify${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, body: JSON.stringify(body) });
test('smoke verification binds code to account and saved email, changes only receipt and rejects replay', async () => {
  const f = fixture(), response = await f.route.POST(req());
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json(); assert.equal(data.verified, true); assert.match(data.message, /No other email was sent or enabled/);
  assert.equal(f.getRow().verificationAttempts, 1); assert.ok(f.getRow().verifiedAt); assert.equal(f.getRow().verificationHash, null); assert.equal(f.getRow().verificationExpiresAt, null);
  assert.equal(f.writes.length, 2); assert.equal((await f.route.POST(req())).status, 409); assert.equal(f.writes.length, 2);
});
test('smoke verification denies expiry, exhausted attempts, wrong owner binding and changed email', async () => {
  for (const patch of [{ verificationExpiresAt: new Date(0) }, { verificationAttempts: 5 }, { verifiedAt: new Date() },
    { verifiedEmailHash: verification.smokeEmailHash('changed@example.invalid') }, { verificationHash: verification.smokeCodeHash('other-athlete', email, code) }, { verificationHash: verification.smokeCodeHash(owner, 'other@example.invalid', code) }]) {
    const f = fixture(patch); assert.equal((await f.route.POST(req())).status, 409); assert.equal(f.getRow().verifiedAt?.getTime(), patch.verifiedAt?.getTime());
  }
  for (const changeSession of [false, true]) {
    const f = fixture(); f.setEmail('changed@example.invalid'); if (changeSession) f.setUser({ id: owner, email: 'changed@example.invalid' });
    assert.equal((await f.route.POST(req())).status, 409); assert.equal(f.writes.length, 0);
  }
});
test('smoke verification permits at most five valid-format guesses and never resets or resends', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) assert.equal((await f.route.POST(req({ code: '000000000000' }))).status, 409);
  assert.equal(f.getRow().verificationAttempts, 5); assert.equal(f.writes.length, 5);
  assert.equal((await f.route.POST(req())).status, 409); assert.equal(f.getRow().verifiedAt, null); assert.equal(f.writes.length, 5);
  const g = fixture({ verificationAttempts: 4 }); assert.equal((await g.route.POST(req())).status, 200); assert.equal(g.getRow().verificationAttempts, 5);
});
test('smoke verification rejects unauthenticated/cross-owner/disabled, CSRF, target injection and oversized bodies', async () => {
  for (const user of [null, { id: 'admin-other', email, role: 'ADMIN' }]) {
    const f = fixture(); f.setUser(user); assert.equal((await f.route.POST(req())).status, user ? 403 : 401); assert.equal(f.reads(), 0);
  }
  const f = fixture();
  for (const headers of [{ Origin: '' }, { Origin: 'https://foreign.example.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) assert.equal((await f.route.POST(req({ code }, headers))).status, 403);
  assert.equal((await f.route.POST(req({ code }, {}, '?userId=other'))).status, 403);
  for (const body of [{ code, userId: owner }, { code, recipient: email }, { code: 'invalid' }, [], null]) assert.equal((await f.route.POST(req(body))).status, 400);
  assert.equal((await f.route.POST(req({ code: 'A'.repeat(300) }))).status, 413);
  assert.equal(f.reads(), 0); assert.equal(f.writes.length, 0);
  f.env.ENABLE_ACCOUNT_SMOKE_TEST = 'false'; assert.equal((await f.route.POST(req())).status, 403);
});
test('verification hashes cannot be reused for another account/email or malformed code', () => {
  const challenge = verification.newSmokeEmailVerification(owner, email, new Date(0));
  assert.match(challenge.code, /^[A-F0-9]{12}$/); assert.equal(challenge.verificationExpiresAt.getTime(), 900000);
  assert.equal(verification.smokeCodeMatches(owner, email, challenge.code, challenge.verificationHash), true);
  assert.equal(verification.smokeCodeMatches('other', email, challenge.code, challenge.verificationHash), false);
  assert.equal(verification.smokeCodeMatches(owner, 'other@example.invalid', challenge.code, challenge.verificationHash), false);
  assert.equal(verification.smokeCodeMatches(owner, email, 'bad', challenge.verificationHash), false);
});
