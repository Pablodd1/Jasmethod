/** Disposable new-athlete journeys only. Never load against a deployed database. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const u = new URL(process.env[key] || "");
  assert.equal(u.protocol, "postgresql:"); assert.equal(u.hostname, "127.0.0.1");
  assert.equal(u.port, "55432"); assert.equal(u.pathname, "/jmm_launch_integration_test"); assert.equal(u.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"), "Local egress guard is required");
export const base = "http://127.0.0.1:3220";
export const db = new PrismaClient();
export const dayKey = new Date().toISOString().slice(0, 10);
export const day = new Date(`${dayKey}T00:00:00Z`);
export const observedKey = new Date(day.getTime() - 86400000).toISOString().slice(0, 10);
export const validAnswers = { sleep: 4, soreness: 1, motivation: 4, energy: 4, stress: 1,
  sick: false, newPain: false, urgentSymptoms: false, availableMinutes: 120 };
export type Actor = { id: string; cookie: string; email: string; password: string };
export const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];
export async function actor(sport: string): Promise<Actor> {
  assert.match(sport, /^[a-z-]+$/);
  const email = `athlete-qa-${sport}-${randomUUID()}@example.invalid`, password = randomBytes(24).toString("base64url");
  // Independent synthetic networks prevent repair reruns sharing one signup
  // bucket. This helper is restricted above to the disposable loopback app.
  const fixtureIp = `127.0.0.${10 + Math.max(0, ["triathlon", "swimming", "cycling", "hyrox", "running"].indexOf(sport))}`;
  const signup = await fetch(`${base}/api/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json", origin: base, "x-forwarded-for": fixtureIp },
    body: JSON.stringify({ email, password, name: `Synthetic QA ${sport}`, birthYear: 1990 }) });
  const data = await signup.json(); assert.equal(signup.status, 200, JSON.stringify(data));
  const cookie = (signup.headers.getSetCookie().find(s => s.startsWith("jmm_session=")) || "").split(";")[0];
  assert.ok(cookie.startsWith("jmm_session="));
  await db.user.update({ where: { id: data.user.id }, data: { timezone: "UTC" } });
  const a = { id: data.user.id, cookie, email, password };
  mkdirSync(".local/athlete-qa", { recursive: true });
  writeFileSync(`.local/athlete-qa/${sport}-private.json`, JSON.stringify(a), { mode: 0o600 });
  return a;
}
export async function api(path: string, a: Actor, body?: unknown, method?: string, status = 200): Promise<any> {
  assert.ok(path.startsWith("/api/"));
  const response = await fetch(`${base}${path}`, { method: method || (body === undefined ? "GET" : "POST"),
    headers: { cookie: a.cookie, "Content-Type": "application/json", origin: base },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(120000) });
  const data = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(data)}`);
  return data;
}
export async function save(a: Actor, fields: Record<string, unknown>) {
  const p = await api("/api/profile", a);
  return api("/api/profile", a, { ...fields, expectedRevision: p.revision,
    ...(fields.setup ? { expectedSetupRevision: p.setupRevision } : {}) }, "PUT");
}
export async function scenario(name: string, work: () => Promise<void>) {
  try { await work(); results.push({ name, status: "PASS" }); console.log(`PASS ${name}`); }
  catch (e) { const detail = e instanceof Error ? e.message : String(e); results.push({ name, status: "FAIL", detail }); console.error(`FAIL ${name}: ${detail}`); }
}
export async function finish(sport: string) {
  assert.match(sport, /^[a-z-]+$/);
  mkdirSync(".local/athlete-qa", { recursive: true });
  writeFileSync(`.local/athlete-qa/${sport}-report.json`, JSON.stringify({ sport, dayKey, synthetic: true, results }, null, 2));
  // Keep these named local-only users for the parent CTO's browser review.
  await db.$disconnect();
  if (results.some(r => r.status === "FAIL")) process.exitCode = 1;
}
