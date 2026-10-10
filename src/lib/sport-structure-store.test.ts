import { test } from "node:test";
import assert from "node:assert/strict";
import { applySportStructureEdit, structureMetadata } from "./sport-structure-store";
import { effectivePrescription } from "./effective-prescription";
import { SPORT_STRUCTURE_EXAMPLES } from "./sport-structure-examples";

function fixture() {
  let row: any = { id: "session-1", userId: "athlete-1", date: new Date(), title: "Strength", sport: "strength", durationMin: 30, intensity: "z2", planned: true, completed: false, approved: true, planDay: null, prescription: JSON.stringify({ sport: "strength", durationMin: 30, verdict: "full", steps: [{ name: "Previous generic session", seconds: 1800, phase: "active", zone: "z2" }], detail: { main: "Existing notes" } }) };
  const scopes: string[] = [];
  const audit: any[] = [];
  let writes = 0;
  let conflict = false;
  const tx: any = {
    $executeRaw: async (_strings: any, athleteId: string) => { assert.equal(athleteId, "athlete-1"); },
    workout: {
      findFirst: async ({ where }: any) => { scopes.push(where.userId); return where.userId === row.userId && where.id === row.id ? { ...row } : null; },
      findMany: async ({ where }: any) => { scopes.push(where.userId); return []; },
      updateMany: async ({ where, data }: any) => { assert.equal(where.userId, "athlete-1"); assert.equal(where.planned, true); assert.equal(where.completed, false); assert.equal(where.prescription, row.prescription); assert.equal(where.feedbackAt, null); if (conflict) return { count: 0 }; writes++; row = { ...row, ...data }; return { count: 1 }; },
    },
    athleteProfile: { findUnique: async () => null },
    user: { findUnique: async () => ({ timezone: "UTC" }) },
    auditLog: { findFirst: async () => null, findMany: async () => [], create: async ({ data }: any) => { audit.push(data); return data; } },
    supplementProfile: { findUnique: async () => null },
    dailyCheckin: { findUnique: async () => null },
    benchmarkTest: { findMany: async () => [] },
    race: { findMany: async ({where}:any) => {scopes.push(where.userId); return [];} },
  };
  return { tx, scopes, audit, row: () => row, set: (data: any) => { row = { ...row, ...data }; }, writes: () => writes, conflict: () => { conflict = true; } };
}
const context = { actorId: "coach-1", athleteId: "athlete-1", timezone: "UTC" };
async function request(f: ReturnType<typeof fixture>, sportStructure: unknown = SPORT_STRUCTURE_EXAMPLES.strength.structure) {
  const current = await effectivePrescription(context.athleteId, "session-1", f.tx);
  assert.ok(current);
  return { id: "session-1", expectedRevision: current.canonical.revision, sportStructure };
}

test("transactional structure edit uses only scoped reads, verifies persistence and preserves a blocked check-in", async () => {
  const f = fixture();
  const body = await request(f);
  const before = JSON.parse(f.row().prescription);
  const result = await applySportStructureEdit(f.tx, context, body);
  assert.equal(f.writes(), 1);
  assert.equal(f.row().approved, false);
  assert.ok(f.scopes.length > 0 && f.scopes.every(scope => scope === "athlete-1"));
  assert.equal(result.verdict, "blocked");
  assert.notEqual(result.revision, body.expectedRevision);
  assert.deepEqual(result.sportStructure, SPORT_STRUCTURE_EXAMPLES.strength.structure);
  assert.deepEqual(JSON.parse(f.row().prescription).detail, before.detail);
  assert.equal(JSON.parse(f.row().prescription).verdict, "full");
  assert.equal(f.audit.length, 1);
  assert.equal(f.audit[0].actorId, "coach-1");
  assert.equal(f.audit[0].subjectId, "athlete-1");
  assert.equal(f.audit[0].after, f.row().prescription);
});

test("stale canonical revisions, newly recorded feedback and lost updates do not write or report success", async () => {
  const f = fixture();
  const body = await request(f);
  f.set({ notes: "Changed after the editor opened" });
  await assert.rejects(applySportStructureEdit(f.tx, context, body), /changed/);
  assert.equal(f.writes(), 0);
  f.set({ feedbackStatus: "skipped" });
  const feedbackBody = await request(f);
  await assert.rejects(applySportStructureEdit(f.tx, context, feedbackBody), /read-only/);
  assert.equal(f.writes(), 0);
  assert.equal(f.audit.length, 0);
  const concurrent = fixture(); concurrent.conflict();
  await assert.rejects(applySportStructureEdit(concurrent.tx, context, await request(concurrent)), /changed while saving/);
  assert.equal(concurrent.writes(), 0);
  assert.equal(concurrent.audit.length, 0);
});

test("another athlete's session is inaccessible even with a known revision", async () => {
  const f = fixture();
  const body = await request(f);
  f.set({ userId: "different-athlete" });
  await assert.rejects(applySportStructureEdit(f.tx, context, body), /not found/);
  assert.equal(f.writes(), 0);
  assert.equal(f.audit.length, 0);
});

test("metadata reads persisted structure even when check-in safety hides executable steps", async () => {
  const f = fixture();
  f.set({ prescription: JSON.stringify({ durationMin: 30, verdict: "full", sportStructure: SPORT_STRUCTURE_EXAMPLES.strength.structure }) });
  const resolved = await effectivePrescription(context.athleteId, "session-1", f.tx);
  assert.ok(resolved);
  assert.equal(resolved.canonical.verdict, "blocked");
  assert.deepEqual(resolved.prescription.steps, []);
  const metadata = structureMetadata(resolved);
  assert.deepEqual(metadata.sportStructure, SPORT_STRUCTURE_EXAMPLES.strength.structure);
  assert.equal(metadata.declaredBudgetMin, 30);
});

test("invalid structure fails before persistence, and clearing never revives superseded steps", async () => {
  const f = fixture();
  const invalid = structuredClone(SPORT_STRUCTURE_EXAMPLES.strength.structure) as any;
  invalid.steps[1].endpoint.reps = -1;
  await assert.rejects(applySportStructureEdit(f.tx, context, await request(f, invalid)), /repetitions/);
  assert.equal(f.writes(), 0);
  assert.equal(f.audit.length, 0);
  await applySportStructureEdit(f.tx, context, await request(f));
  const cleared = await applySportStructureEdit(f.tx, context, await request(f, null));
  assert.equal(cleared.sportStructure, null);
  assert.equal(cleared.verdict, "blocked");
  assert.deepEqual(JSON.parse(f.row().prescription).steps, []);
  assert.equal(JSON.parse(f.row().prescription).sportStructureBudgetMin, undefined);
});
