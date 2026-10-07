/** Actual social-sign-in handlers with isolated storage/HTTP and real signed JWTs. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as jose from "jose";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(file: string, dependencies: Record<string, unknown>, extras: Record<string, unknown> = {}) {
  const exports: any = {};
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unmocked dependency ${name}`);
    return dependencies[name];
  }, URL, URLSearchParams, Request, Response, Buffer, Date, AbortSignal, ...extras });
  return exports;
}
class TestResponse extends Response {
  cookies = { set: (...args: any[]) => this.cookieWrites.push(args) };
  cookieWrites: any[][] = [];
  static redirect(url: string, status: number) { return new TestResponse(null, { status, headers: { location: url } }); }
  static json(body: unknown, init?: ResponseInit) { return new TestResponse(JSON.stringify(body), init); }
}
const rsa = jose.generateKeyPair("RS256");
const otherRsa = jose.generateKeyPair("RS256");
const appleKey = jose.generateKeyPair("ES256", { extractable: true }).then(pair => jose.exportPKCS8(pair.privateKey));
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const defaultEnv = { SIGN_IN_PROVIDERS: "google,apple,chatgpt", NODE_ENV: "test", APP_URL: "https://app.example.invalid", GOOGLE_CLIENT_ID: "test-google-client", GOOGLE_CLIENT_SECRET: "test-google-secret", CHATGPT_CLIENT_ID: "test-chatgpt-client", CHATGPT_CLIENT_SECRET: "test-chatgpt-secret", APPLE_CLIENT_ID: "test-apple-client", APPLE_TEAM_ID: "test-team", APPLE_KEY_ID: "test-key" };

async function fixture(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = { ...defaultEnv, APPLE_PRIVATE_KEY: await appleKey, ...overrides };
  const config = load("src/lib/sign-in-config.ts", {}, { process: { env } });
  const keys = await rsa;
  const jar = new Map<string, string>();
  const state: any = { transaction: null, account: null, existingEmail: null, owner: null, currentUser: null, linkSession: null, claims: {}, tokenFetches: [], sessions: [], creates: [], mappings: [], admins: [], totalUsers: 0, enrollmentLocks: 0 };
  const db: any = {
    $executeRaw: async () => { state.enrollmentLocks++; return 1; },
    authSession: { findUnique: async () => state.linkSession },
    signInTransaction: {
      deleteMany: async ({ where }: any) => {
        if (!where.stateHash) return { count: 0 };
        const row = state.transaction;
        if (!row || row.stateHash !== where.stateHash || row.browserHash !== where.browserHash || row.expiresAt <= new Date()) return { count: 0 };
        state.transaction = null; return { count: 1 };
      },
      create: async ({ data }: any) => { state.transaction = data; return data; },
      findUnique: async () => state.transaction,
    },
    signInAccount: {
      findUnique: async ({ where }: any) => {
        if (state.account) return state.account;
        const key = where.issuer_clientId_subject;
        const mapping = state.mappings.find((row: any) =>
          row.issuer === key.issuer && row.clientId === key.clientId && row.subject === key.subject);
        return mapping ? { ...mapping, user: state.owner } : null;
      },
      create: async ({ data }: any) => { state.mappings.push(data); return data; },
    },
    user: {
      count: async () => state.totalUsers,
      findUnique: async ({ where }: any) => where.id ? state.owner : state.existingEmail,
      create: async ({ data }: any) => { state.creates.push(data); return { ...data, id: "new-user", onboarded: false }; },
    },
    $transaction: async (fn: any) => fn(db),
  };
  const handlerModule = load("src/lib/social-sign-in.ts", {
    "node:crypto": crypto,
    jose: { ...jose, createRemoteJWKSet: () => async () => keys.publicKey },
    "next/headers": { cookies: async () => ({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined }) },
    "next/server": { NextResponse: TestResponse },
    "./db": { prisma: db },
    "./auth": { createSession: async (id: string) => { state.sessions.push(id); return "synthetic-session"; }, getCurrentUser: async () => state.currentUser, hashPassword: () => "synthetic-password-hash", hashToken: digest, sessionCookieOnResponse: (_session: string, _req: Request, response: TestResponse) => { response.cookies.set("jmm_session", "synthetic-session"); return response; } },
    "./admin": { syncAdminRole: async (user: any) => state.admins.push(user.id) },
    "./ratelimit": { clientIp: () => "synthetic-ip", rateLimit: () => ({ ok: true }) },
    "./sign-in-config": config,
    "./pilot-limit": load("src/lib/pilot-limit.ts", {}),
  }, { process: { env }, fetch: async (url: string, init: any) => {
    state.tokenFetches.push({ url, init });
    const c = config.signInConfig(state.provider);
    const token = await new jose.SignJWT({ nonce: state.nonce, email: "athlete@example.invalid", email_verified: true, name: "Test Athlete", ...state.claims })
      .setProtectedHeader({ alg: "RS256" }).setSubject("provider-subject").setIssuer(c.issuer).setAudience(c.clientId).setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
    return Response.json({ id_token: token });
  } });
  async function start(provider = "google", link = false) {
    state.provider = provider;
    if (link && state.currentUser) { jar.set("jmm_session", "synthetic-link-session"); state.linkSession = { userId: state.currentUser.id, expiresAt: new Date(Date.now() + 60_000) }; }
    const response = await handlerModule.startSignIn(new Request(`${env.APP_URL}/api/auth/${provider}${link ? "?link=1" : ""}`), provider) as TestResponse;
    for (const [name, value] of response.cookieWrites) jar.set(name, value);
    if (state.transaction) state.nonce = state.transaction.nonce;
    const location = new URL(response.headers.get("location")!);
    return { response, location, state: location.searchParams.get("state")! };
  }
  function finish(stateValue: string, provider = "google", method = "GET") {
    const params = new URLSearchParams({ state: stateValue, code: "synthetic-code" });
    return handlerModule.finishSignIn(new Request(`${env.APP_URL}/api/auth/${provider}/callback${method === "GET" ? `?${params}` : ""}`, method === "POST" ? { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params } : undefined), provider) as Promise<TestResponse>;
  }
  return { handlerModule, state, jar, config, start, finish, env, keys };
}

test("social JWT verification enforces signature, issuer, audience, expiry, nonce and authorized party", async () => {
  const f = await fixture();
  async function token(claims: Record<string, unknown> = {}, foreignKey = false) {
    return new jose.SignJWT({ iss: "https://accounts.google.com", aud: defaultEnv.GOOGLE_CLIENT_ID, sub: "test-subject", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, nonce: "test-nonce", email: " Athlete@Example.Invalid ", email_verified: true, ...claims })
      .setProtectedHeader({ alg: "RS256" }).sign((foreignKey ? await otherRsa : f.keys).privateKey);
  }
  const good = await f.handlerModule.verifySignInToken(await token(), "google", "test-nonce");
  assert.equal(good.subject, "test-subject"); assert.equal(good.email, "athlete@example.invalid");
  for (const claims of [{ iss: "https://attacker.invalid" }, { aud: "another-client" }, { exp: Math.floor(Date.now() / 1000) - 60 }, { nonce: "wrong" }, { azp: "another-client" }, { aud: [defaultEnv.GOOGLE_CLIENT_ID, "other"] }, { sub: "" }]) {
    await assert.rejects(f.handlerModule.verifySignInToken(await token(claims), "google", "test-nonce"));
  }
  await assert.rejects(f.handlerModule.verifySignInToken(await token({}, true), "google", "test-nonce"));
  await assert.rejects(f.handlerModule.verifySignInToken("eyJhbGciOiJub25lIn0.e30.", "google", "test-nonce"));
  for (const verified of [false, undefined, "false"]) {
    assert.equal((await f.handlerModule.verifySignInToken(await token({ email_verified: verified }), "google", "test-nonce")).email, null);
  }
});

test("full pilot blocks only new OAuth enrollment and preserves existing sign-in and linking", async () => {
  const full = await fixture(); full.state.totalUsers = 50;
  const started = await full.start();
  const refused = await full.finish(started.state);
  assert.match(refused.headers.get("location")!, /error=pilot_full/);
  assert.equal(full.state.creates.length + full.state.sessions.length, 0);

  const returning = await fixture(); returning.state.totalUsers = 50;
  returning.state.account = { userId: "existing", user: { id: "existing", email: "old@example.invalid", onboarded: true } };
  const again = await returning.start();
  assert.equal((await returning.finish(again.state)).headers.get("location"), `${returning.env.APP_URL}/today`);
  assert.deepEqual(returning.state.sessions, ["existing"]);
  assert.equal(returning.state.creates.length, 0);

  const linking = await fixture(); linking.state.totalUsers = 50;
  linking.state.currentUser = linking.state.owner = { id: "owner", email: "owner@example.invalid", onboarded: true };
  const link = await linking.start("google", true);
  assert.equal((await linking.finish(link.state)).headers.get("location"), `${linking.env.APP_URL}/today`);
  assert.equal(linking.state.mappings.length, 1);
  assert.equal(linking.state.creates.length, 0);
});

test("social provider configuration requires credentials and a production canonical HTTPS origin", async () => {
  const f = await fixture({ GOOGLE_CLIENT_SECRET: undefined, APPLE_TEAM_ID: undefined, CHATGPT_TOKEN_AUTH_METHOD: "invalid" });
  for (const provider of ["google", "apple", "chatgpt"]) assert.equal(f.config.signInConfig(provider), null);
  assert.equal((await fixture({ CHATGPT_TOKEN_AUTH_METHOD: "none", CHATGPT_CLIENT_SECRET: undefined })).config.signInConfig("chatgpt").method, "none");
  for (const env of [{ NODE_ENV: "production", APP_URL: undefined }, { NODE_ENV: "production", APP_URL: "http://app.example.invalid" }]) {
    const x = await fixture(env); assert.throws(() => x.config.signInBase(new Request("https://untrusted.example.invalid")));
  }
});

test("social start binds state to browser, hashes state, uses nonce and S256 PKCE", async () => {
  const f = await fixture(); const started = await f.start(); const row = f.state.transaction;
  assert.equal(row.stateHash, digest(started.state)); assert.notEqual(row.stateHash, started.state);
  assert.equal(row.browserHash, digest(f.jar.get("jmm_signin_google")!));
  assert.equal(started.location.searchParams.get("nonce"), row.nonce);
  assert.equal(started.location.searchParams.get("code_challenge"), createHash("sha256").update(row.verifier).digest("base64url"));
  assert.equal(started.location.searchParams.get("code_challenge_method"), "S256");
  assert.equal(started.response.cookieWrites[0][2].httpOnly, true);
  assert.equal(started.response.headers.get("cache-control"), "no-store");
});

test("social callbacks reject foreign browsers, expired state and replay before token exchange", async () => {
  const f = await fixture(); const started = await f.start(); const original = f.jar.get("jmm_signin_google")!;
  f.jar.set("jmm_signin_google", "x".repeat(43));
  assert.match((await f.finish(started.state)).headers.get("location")!, /invalid_state/);
  assert.equal(f.state.tokenFetches.length, 0);
  f.jar.set("jmm_signin_google", original); f.state.transaction.expiresAt = new Date(0);
  assert.match((await f.finish(started.state)).headers.get("location")!, /invalid_state/);
  const fresh = await f.start();
  const results = await Promise.all([f.finish(fresh.state), f.finish(fresh.state)]);
  assert.equal(results.filter(r => r.headers.get("location")!.endsWith("/onboard")).length, 1);
  assert.equal(f.state.tokenFetches.length, 1); assert.equal(f.state.sessions.length, 1);
});

test("social verified new identity creates athlete and linked subject without accepting provider role claims", async () => {
  const f = await fixture(); f.state.claims = { role: "admin" }; const started = await f.start();
  assert.equal((await f.finish(started.state)).headers.get("location"), `${f.env.APP_URL}/onboard`);
  assert.equal(f.state.creates[0].role, "athlete");
  assert.equal(f.state.creates[0].signInAccounts.create.subject, "provider-subject");
  assert.equal(f.state.sessions[0], "new-user");
});

test("social existing subject signs into original user even without a newly returned email", async () => {
  const f = await fixture(); f.state.account = { userId: "existing-user", user: { id: "existing-user", email: "old@example.invalid", onboarded: true } }; f.state.claims = { email: undefined, email_verified: undefined };
  const started = await f.start(); assert.equal((await f.finish(started.state)).headers.get("location"), `${f.env.APP_URL}/today`);
  assert.deepEqual(f.state.sessions, ["existing-user"]); assert.equal(f.state.creates.length, 0); assert.equal(f.state.admins.length, 0);
});

test("social new identities need verified email and cannot silently merge an existing email account", async () => {
  for (const collision of [false, true]) {
    const f = await fixture(); if (collision) f.state.existingEmail = { id: "password-user" }; else f.state.claims = { email_verified: false };
    const started = await f.start(); const result = await f.finish(started.state);
    assert.match(result.headers.get("location")!, collision ? /account_link_required/ : /email_required/);
    assert.equal(f.state.sessions.length + f.state.creates.length + f.state.mappings.length, 0);
  }
});

test("social explicit account linking needs existing login and rejects another user's provider subject", async () => {
  const f = await fixture(); assert.match((await f.start("google", true)).response.headers.get("location")!, /account_link_required/);
  f.state.currentUser = { id: "owner" }; f.state.owner = { id: "owner", email: "owner@example.invalid", onboarded: true };
  const started = await f.start("google", true); await f.finish(started.state);
  assert.equal(f.state.mappings[0].userId, "owner");
  const g = await fixture(); g.state.currentUser = { id: "owner" }; g.state.account = { userId: "someone-else", user: { id: "someone-else" } };
  const other = await g.start("google", true); assert.match((await g.finish(other.state)).headers.get("location")!, /account_link_required/);
  assert.equal(g.state.sessions.length + g.state.mappings.length, 0);
});

test("one athlete links all three providers and each later signs into the same account", async () => {
  const f = await fixture();
  f.state.owner = { id: "same-athlete", email: "athlete@example.invalid", onboarded: true };
  f.state.currentUser = f.state.owner;
  f.state.existingEmail = f.state.owner;
  for (const provider of ["google", "apple", "chatgpt"]) {
    // Explicit linking also supports Apple's private relay address.
    f.state.claims = { email: provider === "apple" ? "relay@privaterelay.appleid.com" : "athlete@example.invalid" };
    const started = await f.start(provider, true);
    const response = await f.finish(started.state, provider, provider === "apple" ? "POST" : "GET");
    assert.equal(response.headers.get("location"), `${f.env.APP_URL}/today`);
  }
  assert.equal(f.state.mappings.length, 3);
  assert.equal(new Set(f.state.mappings.map((row: any) => row.issuer)).size, 3);
  assert.ok(f.state.mappings.every((row: any) => row.userId === "same-athlete"));
  f.state.currentUser = null;
  f.state.linkSession = null;
  f.jar.delete("jmm_session");
  f.state.claims = { email: undefined, email_verified: undefined };
  for (const provider of ["google", "apple", "chatgpt"]) {
    const started = await f.start(provider);
    const response = await f.finish(started.state, provider, provider === "apple" ? "POST" : "GET");
    assert.equal(response.headers.get("location"), `${f.env.APP_URL}/today`);
  }
  assert.equal(f.state.creates.length, 0, "must not duplicate the athlete");
  assert.equal(f.state.mappings.length, 3, "returning login must reuse the identity mapping");
  assert.deepEqual(f.state.sessions, Array(6).fill("same-athlete"));
});

test("Apple form-post callback uses secure SameSite=None cookie and signed client secret", async () => {
  const f = await fixture(); const started = await f.start("apple");
  assert.equal(started.location.searchParams.get("response_mode"), "form_post");
  assert.equal(started.response.cookieWrites[0][2].sameSite, "none"); assert.equal(started.response.cookieWrites[0][2].secure, true);
  assert.equal((await f.finish(started.state, "apple", "POST")).headers.get("location"), `${f.env.APP_URL}/onboard`);
  const body = f.state.tokenFetches[0].init.body as URLSearchParams;
  const secret = jose.decodeJwt(body.get("client_secret")!);
  assert.equal(secret.iss, defaultEnv.APPLE_TEAM_ID); assert.equal(secret.sub, defaultEnv.APPLE_CLIENT_ID); assert.equal(secret.aud, "https://appleid.apple.com");
  assert.equal(body.has("code_verifier"), false);
});

test("ChatGPT exchanges PKCE code with configured Basic or public-client auth only", async () => {
  for (const method of ["client_secret_basic", "none"]) {
    const f = await fixture({ CHATGPT_TOKEN_AUTH_METHOD: method, CHATGPT_CLIENT_SECRET: method === "none" ? undefined : "synthetic-basic-secret" });
    const started = await f.start("chatgpt"); const verifier = f.state.transaction.verifier;
    await f.finish(started.state, "chatgpt");
    const init = f.state.tokenFetches[0].init;
    assert.equal(init.body.get("code_verifier"), verifier); assert.equal(init.body.has("client_secret"), false);
    if (method === "none") assert.equal(init.headers.Authorization, undefined);
    else assert.equal(init.headers.Authorization, `Basic ${Buffer.from(`${defaultEnv.CHATGPT_CLIENT_ID}:synthetic-basic-secret`).toString("base64")}`);
    assert.equal(init.redirect, "error"); assert.equal(f.state.sessions.length, 1);
  }
});


test("social linking rejects revoked original session before external exchange", async () => {
  const f = await fixture(); f.state.currentUser = { id: "owner" };
  const started = await f.start("google", true); f.state.linkSession = null;
  assert.match((await f.finish(started.state)).headers.get("location")!, /account_link_required/);
  assert.equal(f.state.tokenFetches.length + f.state.sessions.length + f.state.mappings.length, 0);
});

test("social start redirects alternate host before issuing browser state", async () => {
  const f = await fixture();
  const response = await f.handlerModule.startSignIn(new Request("https://alternate.example.invalid/api/auth/google?link=1"), "google");
  assert.equal(new URL(response.headers.get("location")).origin, f.env.APP_URL);
  assert.equal(response.cookieWrites.length, 0); assert.equal(f.state.transaction, null);
});

test("Apple callback rejects oversized and wrong-content-type form bodies without token exchange", async () => {
  for (const [contentType, body] of [["application/json", "{}"], ["application/x-www-form-urlencoded", "x=" + "a".repeat(16_384)]]) {
    const f = await fixture();
    const response = await f.handlerModule.finishSignIn(new Request(`${f.env.APP_URL}/api/auth/apple/callback`, { method: "POST", headers: { "Content-Type": contentType }, body }), "apple");
    assert.match(response.headers.get("location"), /verification_failed/);
    assert.equal(f.state.tokenFetches.length + f.state.sessions.length, 0);
  }
});


test("Google demo disables other providers even when credentials exist", async () => {
  for (const value of [undefined, "google"]) {
    const f = await fixture({ SIGN_IN_PROVIDERS: value });
    assert.ok(f.config.signInConfig("google"));
    for (const provider of ["apple", "chatgpt"]) {
      assert.equal(f.config.signInConfig(provider), null);
      assert.equal((await f.start(provider)).location.searchParams.get("error"), "not_configured");
      assert.equal(new URL((await f.finish("synthetic-state", provider)).headers.get("location")!).searchParams.get("error"), "not_configured");
    }
    assert.equal(f.state.transaction, null);
    assert.equal(f.state.tokenFetches.length, 0);
  }
  const disabled = await fixture({ SIGN_IN_PROVIDERS: "" });
  assert.equal(disabled.config.signInConfig("google"), null);
});
