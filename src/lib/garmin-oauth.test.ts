import { test } from "node:test";
import assert from "node:assert/strict";
import { GarminError, garminConfig, garminConfigured } from "./garmin-config";
import { createGarminProtocol, garminDigest, parseGarminToken, type GarminProtocol, type GarminToken } from "./garmin-protocol";
import { createGarminOAuthService, type GarminConnection, type GarminStore, type GarminTransaction } from "./garmin-oauth-service";

const environment = () => ({ APP_URL: "https://app.example", ENABLE_GARMIN_CONNECTOR: "true", GARMIN_PROCESSING_APPROVED: "true",
  GARMIN_CLIENT_ID: "fixture-client", GARMIN_CLIENT_SECRET: "fixture-secret", TOKEN_ENCRYPTION_KEY: "fixture-key-must-have-at-least-32-characters" });
const token = (suffix = "1"): GarminToken => ({ accessToken: `access-${suffix}`, refreshToken: `refresh-${suffix}`, expiresIn: 86400, refreshExpiresIn: 7_776_000 });
function fixture() {
  const env = environment(), rows = new Map<string, GarminConnection>(), txns = new Map<string, GarminTransaction>();
  const calls = { token: 0, revoke: 0, identity: 0, permissions: 0 };
  const options = { failToken: false, failRevoke: false, failIdentity: false, subject: "garmin-athlete-A", permissions: ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"] as any[], casLost: false };
  let clock = new Date("2026-10-25T12:00:00Z");
  const encrypt = (s: string) => `enc:v1:${Buffer.from(s).toString("base64")}`;
  const decrypt = (s: string) => Buffer.from(s.slice(7), "base64").toString();
  const store: GarminStore = {
    get: async id => rows.has(id) ? structuredClone(rows.get(id)!) : null,
    async begin(userId, marker, txn) {
      if (rows.get(userId)?.tokenEnc) throw new GarminError("disconnect_previous_account", "Disconnect first", 409);
      rows.set(userId, { id: `connector-${userId}`, userId, status: "authorizing", tokenEnc: marker, refreshEnc: null, externalRef: null, scope: null, expiresAt: null, lastError: null });
      txns.set(txn.state, structuredClone(txn));
    },
    transaction: async state => txns.has(state) ? structuredClone(txns.get(state)!) : null,
    async consume(state, userId, now) {
      const txn = txns.get(state); if (!txn || txn.userId !== userId || txn.usedAt || txn.expiresAt <= now) return false;
      txn.usedAt = now; return true;
    },
    async replace(expected, patch, unique, invalidateAt) {
      const actual = rows.get(expected.userId);
      if (options.casLost || !actual || actual.id !== expected.id || actual.status !== expected.status || actual.tokenEnc !== expected.tokenEnc || actual.refreshEnc !== expected.refreshEnc || actual.syncStartedAt?.getTime() !== expected.syncStartedAt?.getTime()) return false;
      if (unique && [...rows.values()].some(r => r.userId !== expected.userId && r.externalRef === patch.externalRef && r.tokenEnc))
        throw new GarminError("provider_account_already_linked", "Already linked", 409);
      rows.set(expected.userId, { ...actual, ...patch });
      if (invalidateAt) for (const txn of txns.values()) if (txn.userId === expected.userId && !txn.usedAt) txn.usedAt = invalidateAt;
      return true;
    },
  };
  const protocol: GarminProtocol = {
    async token() { calls.token++; if (options.failToken) throw new Error("fixture-private-token-response"); return token(String(calls.token)); },
    async identity() { calls.identity++; if (options.failIdentity) throw new Error("fixture-private-identity-response"); return options.subject; },
    async permissions() { calls.permissions++; return options.permissions; },
    async revoke() { calls.revoke++; if (options.failRevoke) throw new GarminError("revocation_unconfirmed", "Provider revocation unconfirmed", 503); },
  };
  const service = createGarminOAuthService({ store, protocol, encrypt, decrypt, env, now: () => clock });
  async function start(user = "A") {
    const result = await service.begin(user), url = new URL(result.authorizationUrl), state = url.searchParams.get("state")!;
    const params = new URLSearchParams({ state, code: "fixture-code" }); return { ...result, url, state, params };
  }
  async function connect(user = "A") { const startResult = await start(user); await service.complete(user, startResult.params, startResult.browserBinding); return startResult; }
  return { service, store, rows, txns, env, options, calls, start, connect, encrypt, decrypt, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}

test("Garmin config fails closed until credentials, encryption and recipient review are configured", () => {
  const env = environment(); assert.equal(garminConfigured(env), true);
  for (const key of ["ENABLE_GARMIN_CONNECTOR", "GARMIN_PROCESSING_APPROVED", "GARMIN_CLIENT_ID", "GARMIN_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"]) {
    assert.equal(garminConfigured({ ...env, [key]: "" }), false, key);
  }
  for (const origin of ["http://app.example", "https://user:pass@app.example", "https://app.example/path", "https://app.example/?redirect=bad"]) assert.equal(garminConfigured({ ...env, APP_URL: origin }), false);
});
test("Garmin authorization uses S256, encrypted verifier, exact callback and no fabricated scopes", async () => {
  const f = fixture(), start = await f.start();
  assert.equal(start.url.origin, "https://connect.garmin.com"); assert.equal(start.url.pathname, "/oauth2Confirm");
  assert.equal(start.url.searchParams.get("redirect_uri"), "https://app.example/api/connectors/garmin/callback");
  assert.equal(start.url.searchParams.get("code_challenge_method"), "S256"); assert.equal(start.url.searchParams.has("scope"), false);
  const pending = JSON.parse(f.decrypt(f.txns.get(start.state)!.returnUrl!));
  assert.equal(start.url.searchParams.get("code_challenge"), garminDigest(pending.verifier));
  assert.ok(!start.authorizationUrl.includes(pending.verifier)); assert.ok(!f.txns.get(start.state)!.returnUrl!.includes(pending.verifier));
});
test("Garmin completing an owned grant stores verified identity and permissions, not an import receipt", async () => {
  const f = fixture(); await f.connect(); const row = f.rows.get("A")!;
  assert.equal(row.status, "connected"); assert.equal(row.externalRef, "garmin-athlete-A"); assert.ok(row.tokenEnc!.startsWith("enc:v1:"));
  assert.deepEqual((await f.service.status("A")).permissions, ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"]);
  assert.equal((await f.service.status("A")).historicalBackfill, false); assert.equal((await f.service.status("A")).deviceReceipt, "unverified");
  assert.equal((await f.service.authorization("A", ["ACTIVITY_EXPORT"])).userId, "garmin-athlete-A");
});
for (const kind of ["other-athlete", "missing-browser", "wrong-browser", "expired", "replayed", "duplicate-state", "duplicate-code", "config-change"]) {
  test(`Garmin rejects ${kind} callback without exchanging a token`, async () => {
    const f = fixture(), a = await f.start(); let user = "A", binding: string | undefined = a.browserBinding;
    if (kind === "other-athlete") user = "B";
    if (kind === "missing-browser") binding = undefined;
    if (kind === "wrong-browser") binding = "z".repeat(43);
    if (kind === "expired") f.advance(600_001);
    if (kind === "replayed") f.txns.get(a.state)!.usedAt = new Date();
    if (kind === "duplicate-state") a.params.append("state", a.state);
    if (kind === "duplicate-code") a.params.append("code", "another-code");
    if (kind === "config-change") f.env.GARMIN_CLIENT_ID = "another-client";
    await assert.rejects(f.service.complete(user, a.params, binding)); assert.equal(f.calls.token, 0);
  });
}
test("Garmin refused consent consumes state and preserves manual fallback", async () => {
  const f = fixture(), a = await f.start(); a.params.delete("code"); a.params.set("error", "access_denied");
  await assert.rejects(f.service.complete("A", a.params, a.browserBinding), /not completed/);
  assert.equal(f.calls.token, 0); assert.equal(f.rows.get("A")!.status, "disconnected"); assert.equal(f.rows.get("A")!.tokenEnc, null);
});
test("Garmin callback replay never repeats the one-use exchange", async () => {
  const f = fixture(), a = await f.connect(); await assert.rejects(f.service.complete("A", a.params, a.browserBinding)); assert.equal(f.calls.token, 1);
});
test("Garmin same provider account cannot link two athletes", async () => {
  const f = fixture(); await f.connect("A"); const b = await f.start("B");
  await assert.rejects(f.service.complete("B", b.params, b.browserBinding), /Already linked/);
  assert.equal(f.rows.get("A")!.status, "connected"); assert.equal(f.rows.get("B")!.status, "disconnected");
  assert.equal(f.rows.get("B")!.tokenEnc, null); await f.service.disconnect("B"); assert.equal(f.calls.revoke, 0);
});
test("Garmin partial user permission is honored and unavailable actions fail closed", async () => {
  const f = fixture(); f.options.permissions = ["ACTIVITY_EXPORT"]; await f.connect();
  await f.service.authorization("A", ["ACTIVITY_EXPORT"]);
  await assert.rejects(f.service.authorization("A", ["WORKOUT_IMPORT"]), /required permission/);
});
test("Garmin empty permission grant is not reported connected", async () => {
  const f = fixture(); f.options.permissions = []; await assert.rejects(f.connect());
  assert.equal(f.rows.get("A")!.status, "reconnect_required"); assert.ok(f.rows.get("A")!.tokenEnc);
});
test("Garmin revoked permission blocks use even while the original access token remains valid", async () => {
  const f = fixture(); await f.connect(); f.options.permissions = ["ACTIVITY_EXPORT"];
  await assert.rejects(f.service.authorization("A", ["WORKOUT_IMPORT"]), /required permission/);
  assert.equal(f.rows.get("A")!.scope, "ACTIVITY_EXPORT"); assert.equal(f.calls.token, 1);
});
test("Garmin refresh rotates credentials once and checks identity again", async () => {
  const f = fixture(); await f.connect(); f.advance(86_400_000);
  const auth = await f.service.authorization("A"); assert.equal(auth.accessToken, "access-2"); assert.equal(f.calls.token, 2);
  assert.equal(JSON.parse(f.decrypt(f.rows.get("A")!.refreshEnc!)).refreshToken, "refresh-2");
  await f.service.authorization("A"); assert.equal(f.calls.token, 2);
});
for (const kind of ["timeout", "identity-change", "missing-permission", "expired-refresh"]) {
  test(`Garmin ${kind} after refresh cannot be used or automatically retried`, async () => {
    const f = fixture(); await f.connect(); f.advance(86_400_000);
    if (kind === "timeout") f.options.failToken = true;
    if (kind === "identity-change") f.options.subject = "different-athlete";
    if (kind === "missing-permission") f.options.permissions = [];
    if (kind === "expired-refresh") f.advance(100 * 86_400_000);
    await assert.rejects(f.service.authorization("A", ["ACTIVITY_EXPORT"]));
    const count = f.calls.token; await assert.rejects(f.service.authorization("A", ["ACTIVITY_EXPORT"])); assert.equal(f.calls.token, count);
  });
}
test("Garmin concurrent refresh loses the claim instead of reusing a rotating refresh token", async () => {
  const f = fixture(); await f.connect(); f.advance(86_400_000); f.options.casLost = true;
  await assert.rejects(f.service.authorization("A"), /connection changed/); assert.equal(f.calls.token, 1);
});
test("Garmin disconnect invokes registration deletion even with release switch disabled", async () => {
  const f = fixture(); await f.connect(); f.env.ENABLE_GARMIN_CONNECTOR = "false";
  assert.deepEqual(await f.service.disconnect("A"), { disconnected: true, providerRevoked: true });
  assert.equal(f.calls.revoke, 1); assert.equal(f.rows.get("A")!.tokenEnc, null); assert.equal(f.rows.get("A")!.refreshEnc, null);
});
test("Garmin revocation failure retains credentials for recovery and does not report success", async () => {
  const f = fixture(); await f.connect(); f.options.failRevoke = true;
  await assert.rejects(f.service.disconnect("A")); assert.equal(f.rows.get("A")!.status, "revocation_required"); assert.ok(f.rows.get("A")!.tokenEnc);
  await assert.rejects(f.service.authorization("A")); f.options.failRevoke = false; await f.service.disconnect("A");
  assert.equal(f.calls.revoke, 2); assert.equal(f.rows.get("A")!.status, "disconnected");
});
test("Garmin pending authorization disconnect invalidates its callback without provider call", async () => {
  const f = fixture(), a = await f.start(); await f.service.disconnect("A");
  await assert.rejects(f.service.complete("A", a.params, a.browserBinding)); assert.equal(f.calls.revoke, 0); assert.equal(f.calls.token, 0);
});
test("Garmin active exchange cannot be interrupted, but an expired exchange has honest manual recovery", async () => {
  const f = fixture(); await f.start(); const row = f.rows.get("A")!;
  row.status = "exchanging"; row.syncStartedAt = new Date("2026-10-25T12:00:00Z");
  await assert.rejects(f.service.disconnect("A"), /in progress/); assert.equal(f.calls.revoke, 0);
  f.advance(90_001); await assert.rejects(f.service.disconnect("A"), /Remove JMM/);
  assert.equal(f.rows.get("A")!.status, "revocation_required");
  assert.deepEqual(await f.service.disconnect("A", true), { disconnected: true, providerRevoked: false, manualRevocationReported: true });
  assert.equal(f.rows.get("A")!.tokenEnc, null); assert.equal(f.calls.revoke, 0);
});
for (const interrupted of ["refreshing", "disconnecting"]) {
  test(`Garmin interrupted ${interrupted} with a stored grant can recover and revoke`, async () => {
    const f = fixture(); await f.connect(); const row = f.rows.get("A")!;
    row.status = interrupted; row.syncStartedAt = new Date("2026-10-25T12:00:00Z"); f.advance(90_001);
    assert.equal((await f.service.disconnect("A")).providerRevoked, true); assert.equal(f.calls.revoke, 1);
  });
}
test("Garmin manual removal cannot clear a normal connected account without trying provider revocation", async () => {
  const f = fixture(); await f.connect(); await assert.rejects(f.service.disconnect("A", true), /normal Garmin disconnection/);
  assert.equal(f.rows.get("A")!.status, "connected"); assert.equal(f.calls.revoke, 0);
});
test("50 Garmin athlete grants retain independent identity and encrypted credentials", async () => {
  const f = fixture();
  for (let i = 0; i < 50; i++) { f.options.subject = `garmin-${i}`; await f.connect(`athlete-${i}`); }
  for (let i = 0; i < 50; i++) assert.equal((await f.service.authorization(`athlete-${i}`)).userId, `garmin-${i}`);
  assert.equal(f.calls.token, 50); assert.equal(f.rows.size, 50);
});
test("Garmin protocol uses server Basic credentials, fixed endpoints and validates permission receipts", async () => {
  const requests: { url: string; init: RequestInit }[] = [];
  const protocol = createGarminProtocol(async (url, init) => {
    requests.push({ url: String(url), init: init! });
    if (String(url).endsWith("/token")) return Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", token_type: "bearer", expires_in: 86400, refresh_token_expires_in: 7_776_000 });
    if (String(url).endsWith("/id")) return Response.json({ userId: "garmin-A" });
    if (String(url).endsWith("/permissions")) return Response.json({ permissions: ["ACTIVITY_EXPORT", "UNREVIEWED_PERMISSION"] });
    return new Response(null, { status: 204 });
  });
  const cfg = garminConfig(environment()); await protocol.token(cfg, { grant_type: "authorization_code", code: "fixture-code", code_verifier: "fixture-verifier", redirect_uri: cfg.redirectUri });
  assert.equal(requests[0].url, "https://diauth.garmin.com/di-oauth2-service/oauth/token"); assert.ok(!requests[0].url.includes("fixture-secret"));
  assert.equal(new Headers(requests[0].init.headers).get("Authorization"), `Basic ${Buffer.from("fixture-client:fixture-secret").toString("base64")}`);
  assert.equal(requests[0].init.redirect, "error"); assert.equal(requests[0].init.cache, "no-store");
  assert.equal(await protocol.identity("fixture-access"), "garmin-A"); assert.deepEqual(await protocol.permissions("fixture-access"), ["ACTIVITY_EXPORT"]);
  await protocol.revoke("fixture-access"); assert.equal(requests[3].init.method, "DELETE");
});
for (const field of ["access_token", "refresh_token", "token_type", "expires_in", "refresh_token_expires_in"]) {
  test(`Garmin incomplete ${field} response is rejected`, () => {
    const reply: Record<string, unknown> = { access_token: "a", refresh_token: "r", token_type: "bearer", expires_in: 86400, refresh_token_expires_in: 7_776_000 };
    delete reply[field]; assert.throws(() => parseGarminToken(reply));
  });
}
test("Garmin transport exceptions and provider bodies never expose credentials", async () => {
  const cfg = garminConfig(environment());
  for (const fetcher of [async () => { throw new Error("fixture-private-secret"); }, async () => new Response("fixture-private-secret", { status: 403 })]) {
    const protocol = createGarminProtocol(fetcher);
    await assert.rejects(protocol.token(cfg, { grant_type: "refresh_token" }), e => e instanceof GarminError && !e.message.includes("fixture-private-secret"));
  }
});
