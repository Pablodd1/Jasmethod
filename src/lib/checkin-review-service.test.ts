import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { dayBounds } from "./dates";
import { SUBJECTIVE_FIELDS } from "./checkin-safety";
import { EXISTING_REVIEW_VERSION } from "./existing-workout-review";

function fixture() {
  const revision = "a".repeat(64), contextRevision = "b".repeat(64), workoutRevision = "c".repeat(64);
  const candidate = { eligible: true, reason: "eligible", sessionId: "saved-session", minutes: 30,
    remainingPlanMinutes: 45, contextRevision, workoutRevision };
  const state = { ready: false, stale: false, hold: false, freshHold: false, transactions: 0, resolutions: 0,
    checkinWrites: 0, workoutWrites: 0, audits: 0, saved: null as any, audit: null as any };
  class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const tx = {
    dailyCheckin: { findUnique: async () => state.saved, upsert: async (q: any) => {
      assert.equal(q.where.userId_date.userId, "athlete");
      assert.equal(q.where.userId_date.date.toISOString(), dayBounds("UTC").start.toISOString());
      state.checkinWrites++; state.saved = { id: "checkin", ...q.create }; return state.saved;
    } },
    workout: { updateMany: async (q: any) => {
      assert.deepEqual(JSON.parse(JSON.stringify(q.where)), { id: "saved-session", userId: "athlete", planned: true, completed: false });
      assert.deepEqual(JSON.parse(JSON.stringify(q.data)), { approved: false }); state.workoutWrites++; return { count: 1 };
    } },
    auditLog: { create: async (q: any) => { state.audits++; state.audit = q.data; return q.data; } },
  };
  const prisma = { $transaction: async (fn: (reader: unknown) => Promise<any>, options: any) => {
    assert.equal(options.isolationLevel, "Serializable"); state.transactions++;
    const prior = { saved: state.saved, checkinWrites: state.checkinWrites, workoutWrites: state.workoutWrites, audits: state.audits, audit: state.audit };
    try { return await fn(tx); } catch (e) { Object.assign(state, prior); throw e; }
  } };
  const deps: Record<string, unknown> = { "./db": { prisma }, "./access": { ApiError }, "./dates": { dayBounds },
    "./existing-workout-review": { EXISTING_REVIEW_VERSION }, "./checkin-safety": { SUBJECTIVE_FIELDS },
    "./effective-prescription": { effectivePrescription: async (athlete: string, id: string, reader: unknown) => {
      assert.equal(athlete, "athlete"); assert.equal(id, "saved-session"); assert.equal(reader, tx); state.resolutions++;
      return { existingReview: { ...candidate, eligible: !state.hold }, canonical: {
        revision: state.stale ? "d".repeat(64) : revision,
        verdict: state.freshHold && state.checkinWrites ? "blocked" : state.ready || state.checkinWrites > 0 ? "ready" : "blocked",
        reason: "Current safety context requires full review" } };
    } },
  };
  const mod = { exports: {} as any };
  const code = ts.transpileModule(fs.readFileSync("src/lib/checkin-review-service.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; }, Date });
  const payload = { sessionId: "saved-session", expectedRevision: revision, contextRevision, noSymptoms: true,
    recoveryUnchanged: true, timeConfirmed: true, confirmed: true };
  return { state, payload, save: (patch: Record<string, unknown> = {}, actorId = "athlete") => mod.exports.reviewExistingWorkout(actorId, { id: "athlete", timezone: "UTC" }, { ...payload, ...patch }) };
}

test("short-review service saves unknown scores with explicit athlete provenance and no workout instruction write", async () => {
  const { state, save } = fixture();
  const result = await save(); assert.equal(result.ok, true); assert.equal(result.duplicate, false);
  assert.equal(state.checkinWrites, 1); assert.equal(state.workoutWrites, 1); assert.equal(state.audits, 1); assert.equal(state.resolutions, 2);
  const a = JSON.parse(state.saved.answers), adaptation = JSON.parse(state.saved.adaptation);
  for (const field of SUBJECTIVE_FIELDS) assert.equal(a[field], null);
  assert.equal(a.sick, false); assert.equal(a.newPain, false); assert.equal(a.urgentSymptoms, false);
  assert.equal(a.availableMin, 45); assert.equal(a.inputMetadata.source, "athlete-confirmed-existing");
  assert.equal(a.inputMetadata.existingReview.sessionId, "saved-session");
  assert.equal(a.inputMetadata.existingReview.noSymptoms, true); assert.equal(a.inputMetadata.existingReview.recoveryUnchanged, true);
  assert.equal(a.inputMetadata.existingReview.timeConfirmed, true);
  assert.equal(adaptation.scoreAvailable, false); assert.equal(adaptation.durationFactor, 1); assert.equal(adaptation.intensityCap, "z2");
  assert.equal(state.audit.actorId, "athlete"); assert.equal(state.audit.subjectId, "athlete");
  assert.equal(state.audit.action, "checkin.review-existing"); assert.equal(JSON.parse(state.audit.after).instructionsChanged, false);
  const again = await save(); assert.equal(again.duplicate, true);
  assert.equal(state.checkinWrites, 1); assert.equal(state.workoutWrites, 1); assert.equal(state.audits, 1);
});

test("strict explicit confirmations and stale revisions fail without persisted writes", async () => {
  for (const key of ["noSymptoms", "recoveryUnchanged", "timeConfirmed", "confirmed"]) for (const value of [false, null, undefined, "true", 1]) {
    const { state, save } = fixture(); await assert.rejects(save({ [key]: value }));
    assert.equal(state.transactions, 0); assert.equal(state.checkinWrites, 0);
  }
  for (const patch of [{ expectedRevision: "bad" }, { contextRevision: "bad" }, { sessionId: "" }]) {
    const { state, save } = fixture(); await assert.rejects(save(patch)); assert.equal(state.checkinWrites, 0);
  }
  for (const mode of ["stale", "hold"] as const) {
    const { state, save } = fixture(); state[mode] = true;
    await assert.rejects(save()); assert.equal(state.checkinWrites, 0); assert.equal(state.workoutWrites, 0); assert.equal(state.audits, 0);
  }
});

test("cross-athlete coach/admin scope cannot impersonate personal short-review confirmation", async () => {
  for (const actor of ["assigned-coach", "administrator", "other-athlete"]) {
    const { state, save } = fixture();
    await assert.rejects(save({}, actor), (e: any) => e.status === 403 && /personally confirm/.test(e.message));
    assert.equal(state.transactions, 0); assert.equal(state.checkinWrites, 0); assert.equal(state.workoutWrites, 0); assert.equal(state.audits, 0);
  }
});

test("fresh effective safety rejection rolls the confirmation back and ready retries never rewrite", async () => {
  const held = fixture(); held.state.freshHold = true;
  await assert.rejects(held.save(), /Current safety context/);
  assert.equal(held.state.checkinWrites, 0); assert.equal(held.state.workoutWrites, 0); assert.equal(held.state.audits, 0); assert.equal(held.state.saved, null);
  const ready = fixture(); ready.state.ready = true;
  assert.equal((await ready.save()).duplicate, true);
  assert.equal(ready.state.checkinWrites, 0); assert.equal(ready.state.workoutWrites, 0); assert.equal(ready.state.audits, 0);
});
