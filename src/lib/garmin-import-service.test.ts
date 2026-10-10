import test from "node:test";
import assert from "node:assert/strict";
import { confirmGarminImport, previewGarminImport } from "./garmin-import-service";
const input = { filename: "Activities.csv", content: "Activity Type,Date,Title,Distance,Time\nRunning,2026-01-04 08:00:00,Easy run,5,00:30:00", timezone: "UTC", unitSystem: "metric" as const, numberFormat: "decimal-dot" as const };
function fixture() {
  const state: { rows: any[]; audits: any[]; writes: number; failures: number } = { rows: [], audits: [], writes: 0, failures: 0 };
  const db: any = {
    user: { findUnique: async () => ({ timezone: "UTC" }) },
    workout: {
      findMany: async ({ where }: any) => state.rows.filter(row => row.userId === where.userId),
      createMany: async ({ data }: any) => { state.writes++; for (const row of data) state.rows.push({ id: `row-${state.rows.length}`, feedbackStatus: null, ...row }); return { count: data.length }; },
      update: async ({ where, data }: any) => { state.writes++; Object.assign(state.rows.find(row => row.id === where.id), data); },
    },
    auditLog: {
      findFirst: async ({ where }: any) => state.audits.find(row => Object.entries(where).every(([key, val]) => row[key] === val)),
      create: async ({ data }: any) => { state.writes++; state.audits.push(data); },
    },
    $executeRaw: async () => {},
    $transaction: async (run: any) => { if (state.failures-- > 0) throw { code: "P2034" }; return run(db); },
  };
  return { state, db };
}
test("preview writes nothing; confirmed save and interrupted-response retry are exactly once", async () => {
  const { state, db } = fixture();
  const preview = await previewGarminImport("athlete", input, db);
  assert.equal(preview.canCommit, true); assert.equal(preview.counts.new, 1); assert.equal(state.writes, 0);
  const saved = await confirmGarminImport("athlete", input, preview.previewToken, db);
  assert.equal(saved.ok, true); assert.equal(saved.replayed, false); assert.equal(state.rows.length, 1);
  const writes = state.writes;
  const retry = await confirmGarminImport("athlete", input, preview.previewToken, db);
  assert.equal(retry.replayed, true); assert.equal(state.writes, writes);
  const next = await previewGarminImport("athlete", input, db);
  assert.equal(next.counts.duplicate, 1); assert.equal(next.canCommit, false);
  assert.ok(!JSON.stringify(state.audits).includes("Easy run"), "audit keeps receipt, not raw upload");
});
test("confirmation rejects changed settings, cross-athlete tokens and intervening history without writes", async () => {
  const { state, db } = fixture();
  const preview = await previewGarminImport("athlete", input, db);
  for (const [userId, file] of [["athlete", { ...input, unitSystem: "imperial" }], ["other", input]] as const) {
    await assert.rejects(confirmGarminImport(userId, file, preview.previewToken, db), (error: any) => error.status === 409);
  }
  state.rows.push({ userId: "athlete", id: "manual", date: new Date("2026-01-04T08:00:00Z"), sport: "run", durationMin: 30, completed: true, source: "manual" });
  await assert.rejects(confirmGarminImport("athlete", input, preview.previewToken, db), (error: any) => error.status === 409);
  assert.equal(state.writes, 0);
});
test("invalid files never become writable and serialization retry remains bounded", async () => {
  const { state, db } = fixture();
  const invalid = { ...input, content: "Date,Total Distance\n2026-01-04,500" };
  const preview = await previewGarminImport("athlete", invalid, db);
  assert.equal(preview.canCommit, false);
  await assert.rejects(confirmGarminImport("athlete", invalid, preview.previewToken, db), (error: any) => error.status === 422);
  const valid = await previewGarminImport("athlete", input, db); state.failures = 1;
  assert.equal((await confirmGarminImport("athlete", input, valid.previewToken, db)).ok, true);
  assert.equal(state.rows.length, 1);
});
test("identical rows within one file are reported as duplicates rather than unsupported skips", async () => {
  const { db } = fixture();
  const result = await previewGarminImport("athlete", { ...input, content: `${input.content}\n${input.content.split("\n")[1]}` }, db);
  assert.deepEqual(result.counts, { new: 1, updated: 0, duplicate: 1, skipped: 0, rejected: 0 });
});
