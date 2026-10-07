import { invalidateDoubleDay } from "./double-day";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";
import * as canonicalHelpers from "./canonical-session";
function fixture(change: (input: any) => void = () => {}) {
  const session = { id: "variant", userId: "a", sport: "bike", title: "Threshold", durationMin: 60, intensity: "z4", type: "threshold", regenCount: 0, planned: true, completed: false, feedbackAt: null };
  const p = prescribeToday({ session, adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z4" } });
  const workout: any = { ...session, prescription: JSON.stringify(p), originalPlan: JSON.stringify(session) };
  const canonical = canonicalHelpers.canonicalSession({ athleteId: "a", workout, prescription: p, dateLocal: "2026-10-02", timezone: "UTC" });
  const state: any = { resolved: { workout: { ...workout }, prescription: p, canonical, targetProfile: { intensityPct: 120 } }, workout, writes: [], audits: [] };
  change(state);
  class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const tx = { $executeRaw: async () => 0, workout: { findFirst: async () => state.workout, update: async ({ data }: any) => { state.writes.push(data); return { ...workout, ...data }; } }, auditLog: { create: async (data: any) => state.audits.push(data) } };
  const deps: Record<string, any> = {
    "@/lib/double-day": { invalidateDoubleDay }, "@/lib/db": { prisma: { $transaction: async (fn: any) => fn(tx) } },
    "@/lib/access": { ApiError, trainingAccess: async () => ({ actor: { id: "a" }, athlete: { id: "a", timezone: "UTC", profile: { intensityPct: 120 } } }), errorResponse: (e: any) => Response.json({ error: e.message }, { status: e.status || 500 }) },
    "@/lib/adaptive": { prescribeToday }, "@/lib/prescription": { baseWorkout },
    "@/lib/effective-prescription": { effectivePrescription: async () => state.resolved },
    "@/lib/canonical-session": canonicalHelpers,
  };
  const source = fs.readFileSync("src/app/api/workout/regenerate/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const output: any = { exports: {} };
  vm.runInNewContext(compiled, { module: output, exports: output.exports, require: (name: string) => { if (name in deps) return deps[name]; throw new Error(`Unmocked ${name}`); }, Response, Request });
  return { state, run: (extra = {}) => output.exports.POST(new Request("https://example.test/api/workout/regenerate", { method: "POST", body: JSON.stringify({ id: "variant", mode: "variant", ...extra }) })) };
}
test("variant preserves reviewed allocation and does not apply profile intensity twice", async () => {
  const { run, state } = fixture(); const response = await run(); assert.equal(response.status, 200); assert.equal(state.writes.length, 1);
  const p = JSON.parse(state.writes[0].prescription); assert.equal(p.durationMin, 60); assert.equal(p.steps.reduce((n: number, s: any) => n + s.seconds, 0), 3600); assert.ok(p.steps.every((s: any) => Number(s.zone.slice(1)) <= 4));
});
test("variant cannot resurrect a held session, overwrite feedback or ignore changed revision", async () => {
  for (const change of [(s: any) => { s.resolved.canonical.verdict = "blocked"; s.resolved.canonical.reason = "Complete the safety check-in"; }, (s: any) => { s.workout.feedbackAt = new Date(); }, (s: any) => { s.workout.prescription = "changed"; }]) {
    const { run, state } = fixture(change); const r = await run(); assert.equal(r.status, 409); assert.equal(state.writes.length, 0);
  }
  const { run, state } = fixture(); assert.equal((await run({ expectedRevision: "stale" })).status, 409); assert.equal(state.writes.length, 0);
});
