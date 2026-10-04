import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

test("password recovery authorization and token lifecycle (mock DB and SMTP)", async t => {
  const rows = new Map<string, any>();
  const users = new Map<string, any>([["athlete", { id: "athlete", email: "athlete@example.invalid", role: "athlete", passwordHash: "old" }]]);
  let mail = "", mailTo = "", delivery = true, sessionsRevoked = 0, linksRevoked = 0, failUpdate = false;
  const audit: any[] = [];
  let currentUser: any = null, serial = Promise.resolve();
  const resetRows = {
    findUnique: async ({ where }: any) => where.userId ? rows.get(where.userId) ?? null : [...rows.values()].find(r => r.tokenHash === where.tokenHash) ?? null,
    upsert: async ({ where, create, update }: any) => { const row = rows.has(where.userId) ? { ...rows.get(where.userId), ...update } : create; rows.set(where.userId, row); return row; },
    deleteMany: async ({ where }: any) => {
      const row = rows.get(where.userId);
      if (!row || where.tokenHash && row.tokenHash !== where.tokenHash || where.expiresAt && row.expiresAt <= where.expiresAt.gt) return { count: 0 };
      rows.delete(where.userId); return { count: 1 };
    },
  };
  const prisma: any = {
    passwordReset: resetRows,
    user: {
      findUnique: async ({ where }: any) => where.id ? users.get(where.id) ?? null : [...users.values()].find(u => u.email === where.email) ?? null,
      update: async ({ where, data }: any) => { if (failUpdate) throw new Error("synthetic failure"); Object.assign(users.get(where.id), data); return users.get(where.id); },
    },
    authSession: {
      deleteMany: async () => { sessionsRevoked++; return { count: 2 }; },
      findUnique: async () => currentUser ? { user: currentUser, expiresAt: new Date(Date.now() + 60000) } : null,
    },
    signInTransaction: { deleteMany: async () => { linksRevoked++; return { count: 1 }; } },
    auditLog: { create: async ({ data }: any) => { audit.push(data); return data; } },
    $queryRaw: async () => [],
    $transaction: (fn: any) => {
      const operation = serial.then(async () => {
        const snapshot = structuredClone([...rows]);
        try { return await fn(prisma); } catch (e) { rows.clear(); for (const [key, row] of snapshot) rows.set(key, row); throw e; }
      });
      serial = operation.then(() => undefined, () => undefined); return operation;
    },
  };
  const globalDb = globalThis as any, oldPrisma = globalDb.prisma;
  globalDb.prisma = prisma;
  const env = new Map(["SMTP_HOST", "APP_URL", "ADMIN_EMAILS", "ADMIN_RECOVERY_TOKEN"].map(k => [k, process.env[k]]));
  process.env.SMTP_HOST = "smtp.example.invalid"; process.env.APP_URL = "https://app.example.invalid";
  const smtp = t.mock.method(require("nodemailer").default, "createTransport", () => ({
    sendMail: async (data: any) => { mail = data.text; mailTo = data.to; if (!delivery) throw new Error("synthetic secret that must not leak"); return { accepted: [data.to], rejected: [] }; },
    close: () => {},
  }));
  const cookie = t.mock.method(require("next/headers"), "cookies", async () => ({ get: () => ({ value: "test-session" }), delete: () => {} }));
  t.after(() => { globalDb.prisma = oldPrisma; smtp.mock.restore(); cookie.mock.restore(); for (const [k, v] of env) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const lib = await import("./password-reset");
  const auth = await import("./auth");
  const forgot = await import("../app/api/auth/forgot-password/route");
  const reset = await import("../app/api/auth/reset-password/route");
  const admin = await import("../app/api/admin/users/[id]/password-reset/route");
  const recovery = await import("../app/api/auth/admin-recovery/route");
  let ip = 0;
  const req = (body: any = {}, origin = "https://app.example.invalid") => new Request("https://attacker.example.invalid/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json", origin, "x-forwarded-for": `reset-test-${ip++}` }, body: JSON.stringify(body) });
  const tokenFromMail = () => /#token=([A-Za-z0-9_-]+)/.exec(mail)![1];
  const password = "Unique-synthetic-password-2026!";

  await t.test("canonical fragment link; only digest persists; public absent/present response equal", async () => {
    const absent = await forgot.POST(req({ email: "missing@example.invalid" }));
    const present = await forgot.POST(req({ email: "athlete@example.invalid" }));
    assert.deepEqual(await absent.json(), await present.json());
    assert.equal(mailTo, "athlete@example.invalid");
    assert.match(mail, /https:\/\/app.example.invalid\/reset-password#token=/);
    assert.doesNotMatch(mail, /attacker/);
    assert.equal(rows.get("athlete").tokenHash, lib.resetTokenHash(tokenFromMail()));
    assert.equal(JSON.stringify([...rows]).includes(tokenFromMail()), false);
  });
  await t.test("issuance cooldown is persisted and does not replace a fresh token", async () => {
    const previous = rows.get("athlete").tokenHash;
    assert.equal(await lib.requestPasswordReset(req(), "athlete@example.invalid"), "throttled");
    assert.equal(rows.get("athlete").tokenHash, previous);
  });
  await t.test("replacement invalidates old token, expiry fails without changing account", async () => {
    const old = tokenFromMail(); rows.get("athlete").createdAt = new Date(0);
    await lib.requestPasswordReset(req(), "athlete@example.invalid");
    assert.equal(await lib.resetPassword(old, password), false);
    rows.get("athlete").expiresAt = new Date(0);
    assert.equal(await lib.resetPassword(tokenFromMail(), password), false);
    assert.equal(sessionsRevoked, 0); assert.equal(users.get("athlete").passwordHash, "old");
  });
  await t.test("valid reset consumes once even under concurrent attempts and revokes sessions/links", async () => {
    rows.clear(); await lib.requestPasswordReset(req(), "athlete@example.invalid");
    const results = await Promise.all([lib.resetPassword(tokenFromMail(), password), lib.resetPassword(tokenFromMail(), password)]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(auth.verifyPassword(password, users.get("athlete").passwordHash), true);
    assert.equal(users.get("athlete").role, "athlete"); assert.equal(sessionsRevoked, 1); assert.equal(linksRevoked, 1);
    assert.equal(await lib.resetPassword(tokenFromMail(), password), false);
  });
  await t.test("failed password update rolls consumption back", async () => {
    await lib.requestPasswordReset(req(), "athlete@example.invalid"); failUpdate = true;
    await assert.rejects(() => lib.resetPassword(tokenFromMail(), password)); failUpdate = false;
    assert.ok(rows.get("athlete")); assert.equal(sessionsRevoked, 1);
  });
  await t.test("password limits and malformed requests fail before reset", async () => {
    assert.ok(lib.passwordResetError("short")); assert.ok(lib.passwordResetError("é".repeat(37)));
    assert.equal(lib.passwordResetError("a".repeat(72)), null);
    assert.equal(await lib.resetPassword("invalid", password), false);
    assert.equal((await reset.POST(req({ token: tokenFromMail(), password: "short" }))).status, 400);
    assert.equal((await reset.POST(req({}, "https://evil.example.invalid"))).status, 403);
  });
  await t.test("retired-password digest is rejected without storing its plaintext", () => {
    const crypto = require("crypto"), original = crypto.createHash;
    const mock = t.mock.method(crypto, "createHash", (algorithm: string) => {
      const hash = original(algorithm), update = hash.update.bind(hash), digest = hash.digest.bind(hash);
      let denied = false;
      hash.update = (value: any, ...args: any[]) => { denied ||= value === "synthetic-denied-password-marker"; update(value, ...args); return hash; };
      hash.digest = (...args: any[]) => denied ? "0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d" : digest(...args);
      return hash;
    });
    try { assert.equal(lib.passwordResetError("synthetic-denied-password-marker"), "Choose a new, unique password."); }
    finally { mock.mock.restore(); }
  });
  await t.test("SMTP failure invalidates token while keeping public response generic", async () => {
    rows.clear(); delivery = false;
    assert.equal(await lib.requestPasswordReset(req(), "athlete@example.invalid"), "delivery-failed");
    assert.equal(rows.size, 0);
    const res = await forgot.POST(req({ email: "athlete@example.invalid" }));
    assert.equal(res.status, 200); assert.equal((await res.json()).message, lib.resetRequestMessage);
    assert.equal(rows.size, 0); delivery = true;
  });
  await t.test("admin requires authenticated admin, ignores supplied recipient, records audit", async () => {
    const context = { params: Promise.resolve({ id: "athlete" }) };
    assert.equal((await admin.POST(req(), context)).status, 401);
    currentUser = { id: "coach", role: "coach", passwordHash: auth.hashPassword(password) };
    assert.equal((await admin.POST(req(), context)).status, 403);
    currentUser.role = "admin";
    assert.equal((await admin.POST(req({}, "https://evil.example.invalid"), context)).status, 403);
    assert.equal((await admin.POST(req({ email: "attacker@example.invalid" }), context)).status, 200);
    assert.equal(mailTo, "athlete@example.invalid");
    assert.ok(audit.find(row => row.actorId === "coach" && row.subjectId === "athlete" && row.action === "password_reset_requested"));
    assert.equal(JSON.stringify(audit).includes(tokenFromMail()), false);
    rows.clear(); delivery = false;
    assert.equal((await admin.POST(req(), context)).status, 502); delivery = true;
  });
  await t.test("legacy owner recovery keeps role and revokes outstanding access", async () => {
    process.env.ADMIN_EMAILS = "athlete@example.invalid"; process.env.ADMIN_RECOVERY_TOKEN = "synthetic-owner-recovery-secret";
    assert.equal((await recovery.POST(req({ email: "athlete@example.invalid", token: "wrong", newPassword: password }))).status, 401);
    const before = sessionsRevoked;
    const response = await recovery.POST(req({ email: "athlete@example.invalid", token: process.env.ADMIN_RECOVERY_TOKEN, newPassword: password }));
    assert.equal(response.status, 200); assert.equal(users.get("athlete").role, "athlete");
    assert.equal(sessionsRevoked, before + 1); assert.equal(rows.size, 0);
  });
});

