import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { COROS_OAUTH_ISSUERS, COROS_OAUTH_SCOPES, CorosOAuthError, corosOAuthConfig, corosOAuthConfigured } from "./coros-oauth-config";
import { createCorosOAuthProtocol, validateCorosDiscovery, validateCorosGrant, corosDigest, type CorosOAuthProtocol, type CorosGrant } from "./coros-oauth-protocol";
import { createCorosOAuthService, COROS_MANUAL_REVOCATION_MESSAGE, type CorosConnection, type CorosOAuthStore, type CorosTransaction } from "./coros-oauth-service";
import { validateCorosMutation, corosErrorResponse } from "./coros-oauth-request";

const env = { APP_URL: "https://app.example", ENABLE_COROS_CONNECTOR: "true", COROS_ISSUER: "https://mcpus.coros.com", COROS_CLIENT_ID: "synthetic-client", TOKEN_ENCRYPTION_KEY: "synthetic-offline-test-key-not-a-real-credential" };
const now = () => new Date("2026-10-09T12:00:00Z");
const syntheticToken = (access = "synthetic-access", refresh = "synthetic-refresh"): CorosGrant => ({ accessToken: access, refreshToken: refresh, expiresAt: new Date(now().getTime() + 3600_000), scope: COROS_OAUTH_SCOPES.join(" "), idToken: "synthetic-id-token" });
const metadataJson = (issuer: typeof COROS_OAUTH_ISSUERS[number] = COROS_OAUTH_ISSUERS[0]) => ({ issuer, authorization_endpoint: `${issuer}/oauth2/authorize`, token_endpoint: `${issuer}/oauth2/token`, jwks_uri: `${issuer}/oauth2/jwks`, userinfo_endpoint: `${issuer}/userinfo`, revocation_endpoint: `${issuer}/oauth2/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], id_token_signing_alg_values_supported: ["RS256"], scopes_supported: [...COROS_OAUTH_SCOPES], revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"] });
const metadata = validateCorosDiscovery(metadataJson(), COROS_OAUTH_ISSUERS[0]);
const json = (value: unknown, status = 200) => Response.json(value, { status });
const rejection = async (fn: () => Promise<unknown>, code: string) => assert.rejects(fn, (error: unknown) => error instanceof CorosOAuthError && error.code === code);
const enc = (value: string) => `enc:v1:${Buffer.from(value).toString("base64")}`;
const dec = (value: string | null) => value ? Buffer.from(value.slice(7), "base64").toString("utf8") : "";
function fixture(overrides: { protocol?: Partial<CorosOAuthProtocol>; env?: Record<string, string | undefined> } = {}) {
  const rows = new Map<string, CorosConnection>();
  const transactions = new Map<string, CorosTransaction>();
  const calls: string[] = [];
  const store: CorosOAuthStore = {
    async get(userId) { const row = rows.get(userId); return row ? { ...row } : null; },
    async begin(userId, pendingEnc, txn) {
      const old = rows.get(userId);
      if (old?.tokenEnc || (old && !["disconnected", "revocation_required"].includes(old.status))) throw new CorosOAuthError("disconnect_previous_account", "Disconnect first", 409);
      transactions.set(txn.state, { ...txn });
      rows.set(userId, { id: `row-${userId}`, userId, status: "authorizing", tokenEnc: pendingEnc, refreshEnc: null, expiresAt: null, scope: null, externalRef: null, lastError: old?.lastError?.includes(COROS_MANUAL_REVOCATION_MESSAGE) ? COROS_MANUAL_REVOCATION_MESSAGE : null });
    },
    async transaction(state) { const txn = transactions.get(state); return txn ? { ...txn } : null; },
    async consume(state, userId, at) {
      const txn = transactions.get(state);
      if (!txn || txn.userId !== userId || txn.usedAt || txn.expiresAt <= at) return false;
      txn.usedAt = at; return true;
    },
    async replace(expected, patch, unique, invalidateAt) {
      const row = rows.get(expected.userId);
      if (!row || row.id !== expected.id || row.status !== expected.status || row.tokenEnc !== expected.tokenEnc || row.refreshEnc !== expected.refreshEnc) return false;
      if (unique && [...rows.values()].some(other => other.userId !== row.userId && other.tokenEnc && other.externalRef === patch.externalRef)) throw new CorosOAuthError("provider_account_already_linked", "Already linked", 409);
      rows.set(row.userId, { ...row, ...patch });
      if (invalidateAt) for (const txn of transactions.values()) if (txn.userId === row.userId && !txn.usedAt) txn.usedAt = invalidateAt;
      return true;
    },
  };
  const protocol: CorosOAuthProtocol = {
    async discover() { calls.push("discover"); return metadata; },
    async tokens() { calls.push("tokens"); return syntheticToken(); },
    async identity() { calls.push("identity"); return "synthetic-subject"; },
    async revoke() { calls.push("revoke"); return false; },
    ...overrides.protocol,
  };
  const service = createCorosOAuthService({ store, protocol, encrypt: enc, decrypt: dec, now, env: overrides.env || env });
  async function pending(userId = "athlete-a") {
    const start = await service.begin(userId);
    const params = new URL(start.authorizationUrl).searchParams;
    return { ...start, params: new URLSearchParams({ state: params.get("state")!, code: "synthetic-code" }), userId };
  }
  async function connected(userId = "athlete-a") { const input = await pending(userId); await service.complete(userId, input.params, input.browserBinding); return input; }
  return { rows, transactions, calls, store, service, protocol, pending, connected };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(res => { resolve = res; }); return { promise, resolve }; }

test("COROS configuration is disabled by default and strictly pins the deployment origin and issuer", () => {
  assert.equal(corosOAuthConfigured({}), false);
  assert.equal(corosOAuthConfigured(env), true);
  for (const patch of [{ ENABLE_COROS_CONNECTOR: "false" }, { COROS_ISSUER: "https://mcp.coros.com" }, { COROS_ISSUER: "https://mcpus.coros.com/" }, { COROS_CLIENT_ID: "a b" }, { TOKEN_ENCRYPTION_KEY: "short" }, { APP_URL: "https://app.example/path" }, { APP_URL: "https://name@app.example" }, { APP_URL: "https://app.example/?next=bad" }, { APP_URL: "http://app.example" }, { APP_URL: "http://localhost:3000", NODE_ENV: "production" }]) assert.equal(corosOAuthConfigured({ ...env, ...patch }), false);
  assert.equal(corosOAuthConfig(env).redirectUri, "https://app.example/api/connectors/coros/callback");
  assert.equal(corosOAuthConfigured({ ...env, APP_URL: "http://localhost:3000", NODE_ENV: "test" }), true);
});
test("COROS metadata validates exact endpoints, PKCE, public client support and all advertised scopes", () => {
  for (const issuer of COROS_OAUTH_ISSUERS) assert.equal(validateCorosDiscovery(metadataJson(issuer), issuer).issuer, issuer);
  for (const patch of [{ issuer: "https://evil.example" }, { token_endpoint: "https://evil.example/token" }, { jwks_uri: `${env.COROS_ISSUER}/oauth2/jwks?redirect=evil` }, { userinfo_endpoint: `${env.COROS_ISSUER}/other` }, { code_challenge_methods_supported: ["plain"] }, { token_endpoint_auth_methods_supported: ["client_secret_post"] }, { scopes_supported: ["openid"] }, { id_token_signing_alg_values_supported: ["none"] }]) assert.throws(() => validateCorosDiscovery({ ...metadataJson(), ...patch }, COROS_OAUTH_ISSUERS[0]), CorosOAuthError);
  assert.equal(metadata.publicRevocationSupported, false);
});
test("COROS grant validates token shape, lifetime, type and scope without fabricating expiry", () => {
  const token = { access_token: "synthetic-access", refresh_token: "synthetic-refresh", token_type: "Bearer", expires_in: 3600, scope: COROS_OAUTH_SCOPES.join(" ") };
  for (const patch of [{ access_token: "bad\nheader" }, { refresh_token: "" }, { token_type: "MAC" }, { expires_in: undefined }, { expires_in: "3600" }, { expires_in: -1 }, { expires_in: 99_999_999 }, { scope: "openid" }, { id_token: null }]) assert.throws(() => validateCorosGrant({ ...token, ...patch }, now()), CorosOAuthError);
  const first = validateCorosGrant(token, now());
  assert.equal(first.expiresAt.getTime(), now().getTime() + 3600_000);
  assert.equal(validateCorosGrant({ ...token, refresh_token: undefined, scope: undefined }, now(), first).refreshToken, first.refreshToken);
  // OAuth 2.0 permits omission only when scopes are unchanged from the request.
  assert.equal(validateCorosGrant({ ...token, scope: undefined }, now()).scope, COROS_OAUTH_SCOPES.join(" "));
});
test("COROS authorization has state, nonce, S256, resource, encrypted server-side verifier and browser binding", async () => {
  const f = fixture(); const start = await f.pending();
  const url = new URL(start.authorizationUrl), state = url.searchParams.get("state")!;
  const txn = f.transactions.get(state)!;
  const data = JSON.parse(dec(txn.returnUrl));
  assert.equal(url.origin, env.COROS_ISSUER);
  assert.equal(url.pathname, "/oauth2/authorize");
  assert.equal(url.searchParams.get("scope"), "openid offline_access mcp.tools");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), corosDigest(data.verifier));
  assert.equal(url.searchParams.get("resource"), `${env.COROS_ISSUER}/mcp`);
  assert.equal(url.searchParams.get("nonce"), data.nonce);
  assert.equal(data.browserHash, corosDigest(start.browserBinding));
  assert.equal(txn.userId, "athlete-a");
  assert.ok(!start.authorizationUrl.includes(data.verifier));
  assert.ok(txn.returnUrl?.startsWith("enc:v1:"));
  assert.equal(f.rows.get("athlete-a")?.status, "authorizing");
});
test("COROS disabled configuration never starts provider or database work", async () => {
  const f = fixture({ env: { ...env, ENABLE_COROS_CONNECTOR: "false" } });
  await rejection(() => f.service.begin("athlete-a"), "provider_unavailable");
  assert.deepEqual(f.calls, []); assert.equal(f.rows.size, 0);
});
test("COROS callback rejects a different user, missing browser binding and replay before token exchange", async () => {
  const f = fixture(); const input = await f.pending();
  await rejection(() => f.service.complete("athlete-b", input.params, input.browserBinding), "invalid_state");
  await rejection(() => f.service.complete(input.userId, input.params, undefined), "invalid_state");
  await rejection(() => f.service.complete(input.userId, input.params, "x".repeat(43)), "invalid_state");
  assert.equal(f.calls.filter(x => x === "tokens").length, 0);
  await f.service.complete(input.userId, input.params, input.browserBinding);
  await rejection(() => f.service.complete(input.userId, input.params, input.browserBinding), "invalid_state");
  assert.equal(f.calls.filter(x => x === "tokens").length, 1);
});
test("COROS callback rejects expired, altered issuer, duplicate query and changed configuration", async () => {
  for (const issue of ["expired", "issuer", "duplicate", "config"]) {
    const f = fixture(); const input = await f.pending();
    if (issue === "expired") f.transactions.get(input.params.get("state")!)!.expiresAt = now();
    if (issue === "issuer") input.params.set("iss", "https://mcpeu.coros.com");
    if (issue === "duplicate") input.params.append("state", input.params.get("state")!);
    if (issue === "config") { const tx = f.transactions.get(input.params.get("state")!)!; const value = JSON.parse(dec(tx.returnUrl)); value.clientId = "another-client"; tx.returnUrl = enc(JSON.stringify(value)); }
    await rejection(() => f.service.complete(input.userId, input.params, input.browserBinding), "invalid_state");
    assert.equal(f.calls.filter(x => x === "tokens").length, 0);
  }
});
test("COROS denial consumes transaction, clears pending state and never exchanges a code", async () => {
  const f = fixture(); const input = await f.pending(); input.params.set("error", "access_denied");
  await rejection(() => f.service.complete(input.userId, input.params, input.browserBinding), "authorization_declined");
  assert.equal(f.rows.get(input.userId)?.status, "disconnected"); assert.equal(f.rows.get(input.userId)?.tokenEnc, null);
  assert.equal(f.calls.filter(x => x === "tokens").length, 0);
  await rejection(() => f.service.complete(input.userId, input.params, input.browserBinding), "invalid_state");
});
test("COROS concurrent callback is single use and only validated identity becomes authorized", async () => {
  const f = fixture(); const input = await f.pending();
  const results = await Promise.allSettled([f.service.complete(input.userId, input.params, input.browserBinding), f.service.complete(input.userId, input.params, input.browserBinding)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.calls.filter(x => x === "tokens").length, 1);
  assert.equal(f.rows.get(input.userId)?.status, "authorized");
  const status = await f.service.status(input.userId);
  assert.deepEqual(Object.keys(status).sort(), ["connectionStatus", "lastError", "localAccessStopped", "reconnectRequired", "requiresProviderRevocation"].sort());
  assert.ok(!JSON.stringify(status).includes("synthetic-subject"));
  assert.ok(!JSON.stringify(status).includes("synthetic-access"));
  assert.ok(f.rows.get(input.userId)?.externalRef?.startsWith("coros:v1:"));
});
test("COROS failed identity stores only stopped encrypted credentials for disconnect", async () => {
  const f = fixture({ protocol: { async identity() { throw new Error("provider-body-secret"); } } }); const input = await f.pending();
  await rejection(() => f.service.complete(input.userId, input.params, input.browserBinding), "connection_failed");
  assert.equal(f.rows.get(input.userId)?.status, "reconnect_required");
  assert.ok(f.rows.get(input.userId)?.tokenEnc?.startsWith("enc:v1:"));
  await rejection(() => f.service.authorization(input.userId), "reconnect_required");
  assert.ok(!JSON.stringify(await f.service.status(input.userId)).includes("provider-body-secret"));
});
test("COROS same provider account cannot become authorized for two athletes", async () => {
  const f = fixture(); await f.connected(); const second = await f.pending("athlete-b");
  await rejection(() => f.service.complete(second.userId, second.params, second.browserBinding), "provider_account_already_linked");
  assert.equal(f.rows.get("athlete-a")?.status, "authorized"); assert.equal(f.rows.get("athlete-b")?.status, "reconnect_required");
});
test("COROS reconnect cannot overwrite an existing or pending connection", async () => {
  const f = fixture(); await f.pending(); await rejection(() => f.service.begin("athlete-a"), "disconnect_previous_account");
});
test("COROS refresh serializes rotation; failure stops authorization and never retries", async () => {
  const f = fixture(); await f.connected(); const old = f.rows.get("athlete-a")!.tokenEnc;
  f.protocol.tokens = async () => syntheticToken("new-synthetic-access", "new-synthetic-refresh");
  await f.service.refresh("athlete-a");
  assert.notEqual(f.rows.get("athlete-a")?.tokenEnc, old);
  assert.equal((await f.service.authorization("athlete-a")).accessToken, "new-synthetic-access");
  let attempts = 0; f.protocol.tokens = async () => { attempts++; throw new Error("provider-secret"); };
  await rejection(() => f.service.refresh("athlete-a"), "refresh_failed");
  assert.equal(attempts, 1); assert.equal(f.rows.get("athlete-a")?.status, "reconnect_required");
  await rejection(() => f.service.authorization("athlete-a"), "reconnect_required");
});
test("COROS simultaneous refresh sends a single rotating-token request", async () => {
  const f = fixture(); await f.connected();
  const gate = deferred<CorosGrant>(); const started = deferred<void>(); let attempts = 0;
  f.protocol.tokens = async () => { attempts++; started.resolve(); return gate.promise; };
  const first = f.service.refresh("athlete-a"); await started.promise;
  await rejection(() => f.service.refresh("athlete-a"), "reconnect_required");
  gate.resolve(syntheticToken("rotated-access", "rotated-refresh")); await first;
  assert.equal(attempts, 1);
});
test("COROS disconnect wins over in-flight refresh without restoring credentials", async () => {
  const f = fixture(); await f.connected(); const gate = deferred<CorosGrant>(); const started = deferred<void>();
  f.protocol.tokens = async () => { started.resolve(); return gate.promise; };
  const refresh = f.service.refresh("athlete-a"); await started.promise;
  const result = await f.service.disconnect("athlete-a");
  assert.equal(result.remoteRevoked, false); assert.equal(result.requiresProviderRevocation, true);
  gate.resolve(syntheticToken("late-access", "late-refresh"));
  await rejection(() => refresh, "connection_changed");
  assert.equal(f.rows.get("athlete-a")?.tokenEnc, null);
  assert.equal(f.rows.get("athlete-a")?.status, "revocation_required");
  assert.equal((await f.service.status("athlete-a")).requiresProviderRevocation, true);
});
test("COROS disconnect wins over in-flight code exchange and pending callback is canceled", async () => {
  const f = fixture(); const input = await f.pending(); const gate = deferred<CorosGrant>(); const started = deferred<void>();
  f.protocol.tokens = async () => { started.resolve(); return gate.promise; };
  const completion = f.service.complete(input.userId, input.params, input.browserBinding); await started.promise;
  const result = await f.service.disconnect(input.userId); assert.equal(result.requiresProviderRevocation, true);
  gate.resolve(syntheticToken()); await rejection(() => completion, "connection_changed");
  assert.equal(f.rows.get(input.userId)?.tokenEnc, null);
  const g = fixture(); const pending = await g.pending(); const canceled = await g.service.disconnect(pending.userId);
  assert.equal(canceled.requiresProviderRevocation, false);
  await rejection(() => g.service.complete(pending.userId, pending.params, pending.browserBinding), "invalid_state");
});
test("COROS public-client unsupported revoke stops local access and persists truthful warning", async () => {
  const f = fixture(); await f.connected(); const result = await f.service.disconnect("athlete-a");
  assert.deepEqual(result, { ok: true, remoteRevoked: false, localAccessStopped: true, requiresProviderRevocation: true });
  assert.equal(f.rows.get("athlete-a")?.tokenEnc, null); assert.equal(f.rows.get("athlete-a")?.refreshEnc, null);
  assert.equal((await f.service.status("athlete-a")).requiresProviderRevocation, true);
  assert.equal((await f.service.disconnect("athlete-a")).requiresProviderRevocation, true);
  await f.connected();
  assert.equal((await f.service.status("athlete-a")).requiresProviderRevocation, true, "prior unknown grant warning survives a new grant");
});
test("COROS disconnect remains available with feature flag disabled and uses stored issuer/client", async () => {
  const f = fixture(); await f.connected();
  const disabled = createCorosOAuthService({ store: f.store, protocol: f.protocol, encrypt: enc, decrypt: dec, now, env: { ...env, ENABLE_COROS_CONNECTOR: "false", COROS_ISSUER: "https://mcpeu.coros.com", COROS_CLIENT_ID: "changed-client" } });
  assert.equal((await disabled.status("athlete-a")).localAccessStopped, true);
  await rejection(() => disabled.refresh("athlete-a"), "provider_unavailable");
  await rejection(() => disabled.authorization("athlete-a"), "provider_unavailable");
  let issuer = "", client = "";
  f.protocol.discover = async value => { issuer = value; return metadata; };
  f.protocol.revoke = async (_, value) => { client = value; return false; };
  await disabled.disconnect("athlete-a"); assert.equal(issuer, env.COROS_ISSUER); assert.equal(client, env.COROS_CLIENT_ID);
});
test("COROS revocation failure never reports remote success and can retry safely", async () => {
  const f = fixture(); await f.connected();
  f.protocol.revoke = async () => { throw new Error("provider-secret"); };
  await rejection(() => f.service.disconnect("athlete-a"), "revocation_failed");
  assert.equal(f.rows.get("athlete-a")?.status, "revocation_pending");
  assert.equal((await f.service.status("athlete-a")).localAccessStopped, true);
  await rejection(() => f.service.authorization("athlete-a"), "reconnect_required");
  f.protocol.revoke = async () => true;
  const result = await f.service.disconnect("athlete-a"); assert.equal(result.remoteRevoked, true);
  assert.equal(f.rows.get("athlete-a")?.tokenEnc, null);
});
test("COROS unknown exchange outcome conservatively requires provider removal", async () => {
  const f = fixture({ protocol: { async tokens() { throw new Error("transport error after dispatch"); } } }); const input = await f.pending();
  await rejection(() => f.service.complete(input.userId, input.params, input.browserBinding), "connection_failed");
  assert.equal((await f.service.disconnect(input.userId)).requiresProviderRevocation, true);
});
test("COROS mutation requires exact consent, same configured origin, bounded JSON and own athlete", async () => {
  const req = (body: unknown, origin = "https://app.example", suffix = "") => new Request(`https://app.example/api/connectors/coros/authorize${suffix}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await validateCorosMutation(req({ consent: true }), "athlete-a", true, env);
  await rejection(() => validateCorosMutation(req({ consent: "true" }), "athlete-a", true, env), "consent_required");
  await rejection(() => validateCorosMutation(req({ consent: true }, "https://evil.example"), "athlete-a", true, env), "invalid_origin");
  await rejection(() => validateCorosMutation(req({ consent: true, athleteId: "athlete-b" }), "athlete-a", true, env), "own_account_required");
  await rejection(() => validateCorosMutation(req({ consent: true }, undefined, "?athleteId=athlete-b"), "athlete-a", true, env), "own_account_required");
  await rejection(() => validateCorosMutation(req({ data: "x".repeat(2000) }), "athlete-a", true, env), "invalid_request");
  await rejection(() => validateCorosMutation(req([]), "athlete-a", true, env), "invalid_request");
  await rejection(() => validateCorosMutation(req({ consent: true, returnUrl: "https://evil.example" }), "athlete-a", true, env), "invalid_request");
  const badJson = new Request("https://app.example/api/connectors/coros/authorize", { method: "POST", headers: { Origin: "https://app.example", "Content-Type": "application/json" }, body: "{" });
  await rejection(() => validateCorosMutation(badJson, "athlete-a", true, env), "invalid_request");
});
test("COROS provider transport never redirects, retries a POST or leaks provider responses", async () => {
  const calls: RequestInit[] = [];
  const protocol = createCorosOAuthProtocol(async (_, init) => { calls.push(init!); return json({ error: "secret-provider-body" }, 500); }, now);
  await rejection(() => protocol.tokens(metadata, { grant_type: "refresh_token", refresh_token: "synthetic-refresh" }), "provider_request_failed");
  assert.equal(calls.length, 1); assert.equal(calls[0].redirect, "error"); assert.equal(calls[0].cache, "no-store");
  assert.ok(calls[0].signal);
  const response = corosErrorResponse(new Error("secret-provider-body")); assert.ok(!(await response.text()).includes("secret-provider-body"));
});
test("COROS unsupported public-client revocation sends no credential requests", async () => {
  let calls = 0; const protocol = createCorosOAuthProtocol(async () => { calls++; return new Response(null); }, now);
  assert.equal(await protocol.revoke(metadata, env.COROS_CLIENT_ID, syntheticToken()), false); assert.equal(calls, 0);
  assert.equal(await protocol.revoke({ ...metadata, publicRevocationSupported: true }, env.COROS_CLIENT_ID, syntheticToken()), true); assert.equal(calls, 2);
});
test("COROS protocol rejects oversized or non-JSON discovery without following redirects", async () => {
  for (const response of [new Response("<html>", { headers: { "Content-Type": "text/html" } }), json({ value: "x".repeat(300_000) })]) {
    const protocol = createCorosOAuthProtocol(async () => response, now);
    await rejection(() => protocol.discover(COROS_OAUTH_ISSUERS[0]), "provider_response_invalid");
  }
});
test("COROS ID token verifies signature, issuer, audience, expiry, nonce, subject and access-token hash", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey); const atHash = createHash("sha256").update("synthetic-access").digest().subarray(0, 16).toString("base64url");
  const issued = Math.floor(now().getTime() / 1000);
  const base = { iss: env.COROS_ISSUER, aud: env.COROS_CLIENT_ID, sub: "synthetic-subject", iat: issued, exp: issued + 3600, nonce: "synthetic-nonce", at_hash: atHash };
  const protocol = createCorosOAuthProtocol(async () => json({ keys: [jwk] }), now);
  const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "RS256" }).sign(privateKey);
  assert.equal(await protocol.identity(metadata, { clientId: env.COROS_CLIENT_ID }, { ...syntheticToken(), idToken: await sign(base) }, { nonce: "synthetic-nonce" }), "synthetic-subject");
  for (const patch of [{ iss: "https://mcpeu.coros.com" }, { aud: "another-client" }, { exp: issued - 20 }, { nonce: "another-nonce" }, { sub: "" }, { at_hash: "wrong-hash" }, { iat: issued + 100 }, { aud: [env.COROS_CLIENT_ID, "another-client"], azp: "another-client" }]) await rejection(async () => protocol.identity(metadata, { clientId: env.COROS_CLIENT_ID }, { ...syntheticToken(), idToken: await sign({ ...base, ...patch }) }, { nonce: "synthetic-nonce" }), "identity_invalid");
  const otherKeys = await generateKeyPair("RS256");
  const badSignature = await new SignJWT(base).setProtectedHeader({ alg: "RS256" }).sign(otherKeys.privateKey);
  await rejection(() => protocol.identity(metadata, { clientId: env.COROS_CLIENT_ID }, { ...syntheticToken(), idToken: badSignature }, { nonce: "synthetic-nonce" }), "identity_invalid");
});
test("COROS initial grant requires signed ID token; refresh without one rechecks exact subject via userinfo", async () => {
  const calls: string[] = [];
  const protocol = createCorosOAuthProtocol(async (url, init) => { calls.push(String(url)); assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer synthetic-access"); return json({ sub: "synthetic-subject" }); }, now);
  const grant = { ...syntheticToken(), idToken: undefined };
  await rejection(() => protocol.identity(metadata, { clientId: env.COROS_CLIENT_ID }, grant, { nonce: "nonce" }), "identity_invalid");
  assert.equal(calls.length, 0);
  assert.equal(await protocol.identity(metadata, { clientId: env.COROS_CLIENT_ID }, grant, { subject: "synthetic-subject" }), "synthetic-subject");
  assert.deepEqual(calls, [`${env.COROS_ISSUER}/userinfo`]);
  await rejection(() => protocol.identity(metadata, { clientId: env.COROS_CLIENT_ID }, grant, { subject: "another-subject" }), "identity_invalid");
});
test("COROS durable warning survives a declined reconnect and repeated local disconnect", async () => {
  const f = fixture(); await f.connected(); await f.service.disconnect("athlete-a");
  const input = await f.pending(); input.params.set("error", "access_denied");
  await rejection(() => f.service.complete(input.userId, input.params, input.browserBinding), "authorization_declined");
  assert.equal(f.rows.get(input.userId)?.status, "disconnected");
  assert.equal((await f.service.disconnect(input.userId)).requiresProviderRevocation, true);
  assert.equal((await f.service.status(input.userId)).requiresProviderRevocation, true);
});
test("COROS status checks expiry, encryption and saved client binding without provider calls", async () => {
  const f = fixture(); await f.connected(); const before = f.calls.length;
  assert.equal((await f.service.status("athlete-a")).localAccessStopped, false);
  f.rows.get("athlete-a")!.expiresAt = now();
  assert.equal((await f.service.status("athlete-a")).localAccessStopped, true);
  assert.equal((await f.service.status("athlete-a")).reconnectRequired, false);
  f.rows.get("athlete-a")!.tokenEnc = "legacy-plaintext";
  assert.equal((await f.service.status("athlete-a")).reconnectRequired, true);
  assert.equal(f.calls.length, before);
  const g = fixture(); await g.connected();
  const auth = JSON.parse(dec(g.rows.get("athlete-a")!.tokenEnc)); auth.clientId = "old-client";
  g.rows.get("athlete-a")!.tokenEnc = enc(JSON.stringify(auth));
  const status = await g.service.status("athlete-a");
  assert.equal(status.localAccessStopped, true); assert.equal(status.reconnectRequired, true);
});
test("COROS reconnect begun after a canceled exchange is not invalidated by stale completion", async () => {
  const f = fixture(); const first = await f.pending(); const gate = deferred<CorosGrant>(); const started = deferred<void>();
  f.protocol.tokens = async () => { started.resolve(); return gate.promise; };
  const old = f.service.complete(first.userId, first.params, first.browserBinding); await started.promise;
  await f.service.disconnect(first.userId);
  const newer = await f.pending();
  gate.resolve(syntheticToken("stale-access", "stale-refresh"));
  await rejection(() => old, "connection_changed");
  assert.equal(f.transactions.get(newer.params.get("state")!)?.usedAt, null);
  f.protocol.tokens = async () => syntheticToken("current-access", "current-refresh");
  await f.service.complete(newer.userId, newer.params, newer.browserBinding);
  assert.equal((await f.service.authorization(newer.userId)).accessToken, "current-access");
});
