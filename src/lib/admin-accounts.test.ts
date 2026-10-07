import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function fixture(role: string | null = "admin", origin = true, exists = true) {
  const calls: any[] = [];
  const tx = {
    user: { findUnique: async (args: any) => { calls.push({ lookup: args }); return exists ? { id: "target" } : null; } },
    authSession: { deleteMany: async (args: any) => { calls.push({ sessions: args }); return { count: 2 }; } },
    signInTransaction: { deleteMany: async (args: any) => { calls.push({ links: args }); return { count: 1 }; } },
    auditLog: { create: async (args: any) => { calls.push({ audit: args }); return args.data; } },
  };
  const prisma = { ...tx,
    user: { ...tx.user,
      count: async () => { calls.push({ count: true }); return 50; },
      findMany: async (args: any) => { calls.push({ list: args }); return [{ id: "admin", name: "Admin", email: "admin@example.invalid", role: "admin", onboarded: true, createdAt: new Date(), signInAccounts: [{ provider: "google", subject: "private-provider-subject" }], _count: { sessions: 1 }, passwordHash: "private-hash-must-not-serialize" }]; },
    },
    $transaction: async (fn: any) => { calls.push({ transaction: true }); return fn(tx); },
  };
  const output = ts.transpileModule(readFileSync("src/app/api/admin/accounts/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixtureModule = { exports: {} };
  runInNewContext(output, { module: fixtureModule, exports: fixtureModule.exports, Response, Request, URL, Date, console, require: (name: string) => {
    if (name === "@/lib/auth") return { getCurrentUser: async () => role ? { id: "admin", role } : null };
    if (name === "@/lib/db") return { prisma };
    if (name === "@/lib/password-reset") return { resetOriginAllowed: () => origin };
    if (name === "@/lib/ratelimit") return { rateLimit: () => ({ ok: true }) };
    if (name === "@/lib/pilot-limit") return { PILOT_USER_LIMIT: 50 };
    throw Error(`Unexpected dependency ${name}`);
  } });
  return { api: fixtureModule.exports as any, calls };
}
const req = (body: unknown = { action: "revoke_sessions", userId: "target", confirmed: true }) => new Request("https://app.test/api/admin/accounts", { method: "POST", headers: { origin: "https://app.test", "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("account overview and revocation are administrator-only, including denial to coaches", async () => {
  for (const role of [null, "athlete", "coach"]) {
    const f = fixture(role);
    assert.equal((await f.api.GET(new Request("https://app.test/api/admin/accounts"))).status, role ? 403 : 401);
    assert.equal((await f.api.POST(req())).status, role ? 403 : 401);
    assert.equal(f.calls.length, 0);
  }
});

test("overview includes all roles and total capacity but excludes credential and provider identity secrets", async () => {
  const f = fixture(); const response = await f.api.GET(new Request("https://app.test/api/admin/accounts"));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.total, 50); assert.equal(body.limit, 50); assert.equal(body.remaining, 0); assert.equal(body.accounts[0].role, "admin"); assert.equal(body.accounts[0].isSelf, true);
  assert.deepEqual(body.accounts[0].loginProviders, ["google"]);
  assert.doesNotMatch(JSON.stringify(body), /private-hash|private-provider|passwordHash|subject|token/);
  const query = f.calls.find(call => call.list).list;
  assert.equal(query.where, undefined); assert.equal(query.select.passwordHash, undefined); assert.equal(query.select.signInAccounts.select.subject, undefined);
});

test("revocation requires confirmation, valid origin and another account without changing roles or passwords", async () => {
  for (const body of [{ action: "revoke_sessions", userId: "target" }, { action: "revoke_sessions", userId: "admin", confirmed: true }, { action: "revoke_sessions", userId: "target", confirmed: true, role: "admin" }]) {
    const f = fixture(); assert.equal((await f.api.POST(req(body))).status, 400); assert.equal(f.calls.length, 0);
  }
  const badOrigin = fixture("admin", false); assert.equal((await badOrigin.api.POST(req())).status, 403); assert.equal(badOrigin.calls.length, 0);
  const missing = fixture("admin", true, false); assert.equal((await missing.api.POST(req())).status, 404); assert.equal(missing.calls.some(call => call.sessions || call.audit), false);
  const f = fixture(); const response = await f.api.POST(req()); assert.equal(response.status, 200); assert.equal((await response.json()).deletedSessions, 2);
  assert.equal(f.calls.find(call => call.sessions).sessions.where.userId, "target");
  assert.equal(f.calls.find(call => call.links).links.where.linkUserId, "target");
  const audit = f.calls.find(call => call.audit).audit.data; assert.equal(audit.actorId, "admin"); assert.equal(audit.subjectId, "target"); assert.equal(audit.action, "account.sessions_revoked");
});
