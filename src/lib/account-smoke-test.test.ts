import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MANUAL_EMAIL_CONSENT } from "./manual-workout-email";
import { TELEGRAM_CONSENT_VERSION } from "./coaching-communication";
import { parseSmokeRequest, publicSmokeReceipt, runAccountSmoke, smokeAccountAllowed, smokeDestination, smokeKey, SMOKE_CHANNELS, SMOKE_CONSENT, type SmokeReceipt, type SmokeSnapshot, type SmokeStore } from "./account-smoke-test";
const env = { ENABLE_ACCOUNT_SMOKE_TEST: "true", JMM_SMOKE_TEST_USER_ID: "owner", TELEGRAM_BOT_TOKEN: "fake", SMTP_HOST: "smtp.example.invalid", SMTP_FROM: "test@example.invalid" };
const snapshot = (): SmokeSnapshot => ({ userId: "owner", email: "owner@example.invalid", telegram: { verifiedChatId: "123", verifiedActorId: "123", verifiedAt: new Date(1), verificationTransport: "telegram", paused: false, consentVersion: TELEGRAM_CONSENT_VERSION, consentAt: new Date(1) }, emailPreference: { enabled: true, recipient: "owner@example.invalid", verifiedAt: new Date(1), consentVersion: MANUAL_EMAIL_CONSENT, consentAt: new Date(1) }, calendar: { id: "connector", status: "connected", tokenEnc: "fake-test-token", expiresAt: new Date(Date.now() + 3600000), scope: "https://www.googleapis.com/auth/calendar.events" } });
function harness(s = snapshot()) {
  const rows = new Map<string, SmokeReceipt>(); let sends = 0; let reads = 0;
  const store: SmokeStore = {
    async snapshot(userId) { assert.equal(userId, "owner"); reads++; return structuredClone(s); },
    async claim(userId, channel, key, revision, verification) {
      assert.equal(key, smokeKey(userId, channel));
      const prior = rows.get(key); if (prior) return { claimed: false, receipt: prior };
      const receipt = { ...verification, channel, status: "processing", receiptId: null, createdAt: new Date(), updatedAt: new Date() };
      rows.set(key, receipt); return { claimed: true, receipt };
    },
    async finish(userId, channel, result) { const r = { ...rows.get(smokeKey(userId, channel))!, ...result }; rows.set(smokeKey(userId, channel), r); return r; },
  };
  return { s, rows, store, env, request: (channel = "telegram") => parseSmokeRequest({ channel, consentVersion: SMOKE_CONSENT, destinationRevision: smokeDestination(s, channel as "telegram", env).revision }),
    send: async () => { sends++; return { status: "provider_accepted" as const, receiptId: "fake:1" }; }, get sends() { return sends; }, get reads() { return reads; } };
}
test("default-off gate is exact account identity, unrelated to scheduler flags", () => {
  assert.equal(smokeAccountAllowed("owner", {}), false);
  assert.equal(smokeAccountAllowed("other", env), false);
  assert.equal(smokeAccountAllowed("owner", { ...env, ENABLE_ACCOUNT_SMOKE_TEST: "false" }), false);
  assert.equal(smokeAccountAllowed("owner", { ENABLE_AUTOMATED_DELIVERY: "true", ENABLE_TELEGRAM_COACHING: "true", ENABLE_MANUAL_WORKOUT_EMAIL: "true" }), false);
  assert.equal(smokeAccountAllowed("owner", env), true);
});
test("reject arbitrary recipients, target users, payloads, channels and malformed consent", () => {
  const good = { channel: "telegram", consentVersion: SMOKE_CONSENT, destinationRevision: "a".repeat(64) };
  for (const input of [null, [], "test", { ...good, userId: "other" }, { ...good, to: "attacker@example.invalid" }, { ...good, text: "injection" }, { ...good, channel: "__proto__" }, { ...good, consentVersion: "old" }, { ...good, destinationRevision: "x" }, { ...good, retry: true }]) assert.throws(() => parseSmokeRequest(input));
  assert.equal(parseSmokeRequest(good).channel, "telegram");
});
test("concurrent and repeated clicks across requests send at most once per channel", async () => {
  const h = harness(); const requests = Array.from({ length: 20 }, () => runAccountSmoke("owner", h.request(), h));
  await Promise.all(requests); await runAccountSmoke("owner", h.request(), h);
  assert.equal(h.sends, 1); assert.equal(h.rows.size, 1);
});
test("one channel error does not duplicate another accepted channel", async () => {
  const h = harness();
  await runAccountSmoke("owner", h.request("telegram"), h);
  await runAccountSmoke("owner", h.request("email"), { ...h, send: async () => ({ status: "unknown", receiptId: null }) });
  await runAccountSmoke("owner", h.request("calendar"), h);
  const duplicate = await runAccountSmoke("owner", h.request("email"), h);
  assert.equal(duplicate.status, "unknown"); assert.equal(h.sends, 2); assert.equal(h.rows.size, 3);
});
test("cross-user invocation and inconsistent store owner cannot send or claim", async () => {
  const h = harness(); await assert.rejects(runAccountSmoke("other", h.request(), h));
  h.s.userId = "other"; await assert.rejects(runAccountSmoke("owner", h.request(), h));
  assert.equal(h.rows.size, 0); assert.equal(h.sends, 0);
});
test("saved destination or consent revision changes invalidate old confirmation", async () => {
  for (const channel of SMOKE_CHANNELS) {
    const h = harness(); const request = h.request(channel);
    if (channel === "telegram") h.s.telegram!.verifiedChatId = "321";
    if (channel === "email") h.s.emailPreference!.consentAt = new Date(2);
    if (channel === "calendar") h.s.calendar!.tokenEnc = "different-token";
    await assert.rejects(runAccountSmoke("owner", request, h)); assert.equal(h.sends, 0); assert.equal(h.rows.size, 0);
  }
});
test("consent revoked after durable claim cancels before provider I/O", async () => {
  const h = harness(); const claim = h.store.claim;
  h.store.claim = async (...args) => { const result = await claim(...args); h.s.telegram!.paused = true; return result; };
  assert.equal((await runAccountSmoke("owner", h.request(), h)).status, "cancelled"); assert.equal(h.sends, 0);
});
test("unconfigured services, absent verification, paused consent and expired grant block sends", async () => {
  const cases: Array<["telegram" | "email" | "calendar", (h: ReturnType<typeof harness>) => void]> = [
    ["telegram", h => { h.env = { ...env, TELEGRAM_BOT_TOKEN: "" }; }],
    ["telegram", h => { h.s.telegram!.verificationTransport = "mock"; }],
    ["telegram", h => { h.s.telegram!.verifiedChatId = "-123"; }],
    ["telegram", h => { h.s.telegram!.consentAt = null; }],
    ["telegram", h => { h.s.telegram!.paused = true; }],
    ["email", h => { h.env = { ...env, SMTP_HOST: "" }; }],
    ["calendar", h => { h.s.calendar!.expiresAt = new Date(0); }],
    ["calendar", h => { h.s.calendar!.scope = "https://www.googleapis.com/auth/calendar.readonly"; }],
    ["calendar", h => { h.s.calendar = null; }],
  ];
  for (const [channel, change] of cases) { const h = harness(); change(h); await assert.rejects(runAccountSmoke("owner", h.request(channel), h)); assert.equal(h.sends, 0); }
});
test("provider exception, explicit rejection and unreadable result are terminal, never retried", async () => {
  for (const status of ["unknown", "rejected"] as const) {
    const h = harness(); let attempted = 0;
    const deps = { ...h, send: async () => { attempted++; return { status, receiptId: null }; } };
    assert.equal((await runAccountSmoke("owner", h.request(), deps)).status, status);
    await runAccountSmoke("owner", h.request(), deps); assert.equal(attempted, 1);
  }
  const h = harness(); const first = await runAccountSmoke("owner", h.request(), { ...h, send: async () => { throw Error("provider interruption"); } });
  assert.equal(first.status, "unknown"); await runAccountSmoke("owner", h.request(), h); assert.equal(h.sends, 0);
});
test("receipt persistence failure retains claim and never resends, stale claim becomes unknown", async () => {
  const h = harness(); const finish = h.store.finish; h.store.finish = async () => { throw Error("database down"); };
  await assert.rejects(runAccountSmoke("owner", h.request(), h)); h.store.finish = finish;
  const receipt = await runAccountSmoke("owner", h.request(), h);
  assert.equal(h.sends, 1); assert.equal(receipt.status, "processing");
  assert.equal(publicSmokeReceipt(receipt, new Date(receipt.createdAt.getTime() + 60001)).status, "unknown");
});
test("fixed receipt keys isolate channels and accounts and never accept client reset", () => {
  assert.notEqual(smokeKey("owner", "email"), smokeKey("other", "email"));
  assert.notEqual(smokeKey("owner", "email"), smokeKey("owner", "telegram"));
  assert.match(smokeKey("owner", "calendar"), /^[a-f0-9]{64}$/);
});
test("route enforces auth, origin, no targeting query, strict body and truthful acceptance status", () => {
  const route = readFileSync("src/app/api/account/smoke-test/route.ts", "utf8");
  for (const required of ["getCurrentUser()", "appMutationOriginAllowed(req)", "new URL(req.url).search", "smokeAccountAllowed(user.id)", "parseSmokeRequest(JSON.parse(text))", "result.status === \"provider_accepted\" ? 200", "Cache-Control", "rateLimit("]) assert.ok(route.includes(required), required);
  assert.ok(!route.includes("trainingAccess"));
  const store = readFileSync("src/lib/account-smoke-store.ts", "utf8");
  assert.ok(store.includes('provider: "google_cal_smoke"'));
  assert.ok(store.includes('status: "processing"'));
  assert.ok(store.includes('e.code !== "P2002"'));
});
test("smoke path never imports workout mutation, scheduling, refresh or general calendar sync", () => {
  for (const path of ["src/lib/account-smoke-test.ts", "src/lib/account-smoke-store.ts", "src/app/api/account/smoke-test/route.ts"]) {
    const source = readFileSync(path, "utf8");
    for (const forbidden of ["syncUserConnectors", "syncJob.create", "workout.create", "workout.update", "sendTelegramCoaching", "ENABLE_AUTOMATED_DELIVERY =", "ENABLE_MANUAL_WORKOUT_EMAIL ="]) assert.ok(!source.includes(forbidden), `${path}: ${forbidden}`);
  }
});
test("eligibility rejects saved email parser syntax before claiming", async () => {
  for (const email of ["x:y@example.com", "x(y)@example.com", '"x"@example.com', "x\\y@example.com", "x@[127.0.0.1]"]) {
    const h = harness(); h.s.email = email; h.s.emailPreference!.recipient = email;
    await assert.rejects(runAccountSmoke("owner", h.request("email"), h)); assert.equal(h.rows.size, 0); assert.equal(h.sends, 0);
  }
});
test("UI invalidates pending refresh before sending and explicitly consents per channel", () => {
  const source = readFileSync("src/app/account/smoke-test/page.tsx", "utf8");
  assert.match(source, /generation\.current\+\+;\s+inFlight\.current = true/);
  assert.ok(source.includes('if (inFlight.current || !checked[channel.channel] || channel.receipt || channel.reason) return;'));
  assert.ok(source.includes('role="status"')); assert.ok(source.includes('role="alert"'));
  assert.ok(source.includes('Primary') || source.includes('Destination:'));
});
test("isolated Telegram pairing permits one explicitly consented test while normal scheduling stays paused", async () => {
  const h = harness(); h.s.telegram!.paused = true; h.s.telegram!.verificationTransport = "mock";
  h.s.smokeTelegram = { verifiedChatId: "456", verifiedActorId: "456", verifiedAt: new Date(1) };
  let destination = "";
  await runAccountSmoke("owner", h.request(), { ...h, send: async (_channel, _snapshot, to) => { destination = to; return { status: "provider_accepted", receiptId: "fake:1" }; } });
  assert.equal(destination, "456"); assert.equal(h.s.telegram!.paused, true); assert.equal(h.s.telegram!.verificationTransport, "mock");
});
test("unverified saved email receives a single combined code test without altering normal delivery", async () => {
  const h = harness(); h.s.emailPreference = null; let code: string | undefined; let count = 0;
  const deps = { ...h, send: async (_channel: unknown, _snapshot: unknown, destination: string, _key: string, verificationCode?: string) => {
    assert.equal(destination, h.s.email); code = verificationCode; count++; return { status: "provider_accepted" as const, receiptId: "fake-email:1" };
  } };
  assert.equal(smokeDestination(h.s, "email", env).requiresVerification, true);
  const receipt = await runAccountSmoke("owner", h.request("email"), deps);
  assert.match(code!, /^[A-F0-9]{12}$/); assert.equal(publicSmokeReceipt(receipt).verificationPending, true);
  assert.ok(!JSON.stringify([...h.rows.values()]).includes(code!));
  await runAccountSmoke("owner", h.request("email"), deps); assert.equal(count, 1); assert.equal(h.s.emailPreference, null);
});
test("verified email can use independent one-off consent while global and normal delivery remain disabled", async () => {
  const h = harness(); h.s.emailPreference!.enabled = false; h.s.emailPreference!.consentAt = null;
  let code: string | undefined = "unexpected";
  await runAccountSmoke("owner", h.request("email"), { ...h, send: async (_c, _s, _to, _key, value) => { code = value; return { status: "provider_accepted", receiptId: "id" }; } });
  assert.equal(code, undefined); assert.equal(h.s.emailPreference!.enabled, false);
});
