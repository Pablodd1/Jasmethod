/** Isolated HTTP acceptance only. Never run against a real athlete database. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashToken, hashPassword } from "../src/lib/auth";
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = new URL(process.env[key] || "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/jmm_launch_integration_test"); assert.equal(url.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
const origin = "http://127.0.0.1:3220", db = new PrismaClient(), users: string[] = [];
async function actor(role: string) {
  const user = await db.user.create({ data: { name: "Synthetic integration check", email: `launch-${randomUUID()}@example.invalid`, role, passwordHash: hashPassword(randomBytes(32).toString("hex")), onboarded: true } });
  users.push(user.id); const token = randomBytes(32).toString("hex");
  await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 600_000) } });
  return { id: user.id, cookie: `jmm_session=${token}` };
}
async function request(cookie?: string, body?: unknown, sentOrigin = origin, rawBody?: string) {
  return fetch(`${origin}/api/admin/integrations`, { method: body === undefined && rawBody === undefined ? "GET" : "POST", redirect: "manual",
    headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: sentOrigin, "Content-Type": "application/json" },
    ...(body === undefined && rawBody === undefined ? {} : { body: rawBody ?? JSON.stringify(body) }), signal: AbortSignal.timeout(120_000) });
}
async function main() { try {
  const admin = await actor("admin"), athlete = await actor("athlete");
  assert.equal((await request()).status, 401);
  assert.equal((await request(athlete.cookie)).status, 403);
  assert.equal((await request(athlete.cookie, { action: "probe" })).status, 403);
  assert.equal((await request(admin.cookie, { action: "probe" }, "https://foreign.example.test")).status, 403);
  assert.equal((await request(admin.cookie, undefined, origin, " ".repeat(513))).status, 413);
  assert.equal((await request(admin.cookie, { action: "probe", destination: "https://foreign.example.test" })).status, 400);
  assert.equal((await request(admin.cookie, { action: ["probe"] })).status, 400);
  assert.equal(await db.auditLog.count({ where: { actorId: admin.id } }), 0);
  const before = await db.workout.count();
  const response = await request(admin.cookie, { action: "probe" }); assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.checks.openai.state, "missing"); assert.equal(result.checks.email.state, "missing"); assert.equal(result.checks.telegram.state, "missing");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.doesNotMatch(JSON.stringify(result), /synthetic-smtp|synthetic-private|Bearer |postgresql:|tokenHash/);
  assert.equal(await db.workout.count(), before);
  assert.equal(await db.auditLog.count({ where: { actorId: admin.id, action: "integration.probe" } }), 1);
  console.log("PASS launch integration HTTP: unauthenticated/non-admin/CSRF/body bounds/fixed actions/no secret disclosure/no training mutation/audit");
} finally {
  await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
} }
main().catch(error => { console.error("FAIL launch integration HTTP acceptance", error instanceof Error ? error.message : "Unknown test failure"); process.exitCode = 1; });
