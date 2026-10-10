import test from "node:test";
import assert from "node:assert/strict";
import { garminImportCounts, importedFields, planGarminImport, type ExistingGarminActivity } from "./garmin-import-plan";
import type { GarminFileWorkout } from "./garmin-file-import";
const workout = (patch: Partial<GarminFileWorkout> = {}): GarminFileWorkout => ({ source: "garmin", externalId: "garmin-file:start:one", identity: "start-sport", sourceRow: 2, date: new Date("2026-01-04T12:00:00Z"), sport: "run", title: "Easy", durationMin: 30, sourceDurationSeconds: 1800, distanceKm: 5, ...patch });
const saved = (patch: Partial<ExistingGarminActivity> = {}): ExistingGarminActivity => ({ ...workout(), id: "saved", planned: false, completed: true, actualDurationMin: 30, feedbackStatus: null, ...patch });
test("same-file repeat is duplicate, changed supplied metrics update one exact source identity", () => {
  assert.equal(planGarminImport([workout()], [saved()])[0].status, "duplicate");
  const update = planGarminImport([workout({ avgHr: 140, title: "Reviewed title" })], [saved()])[0];
  assert.equal(update.status, "updated"); assert.equal(update.existingId, "saved");
});
test("cross-format and foreign-source duplicate stays unchanged, conflicts never create another activity", () => {
  for (const source of ["garmin", "strava", "manual", "intervals"]) {
    const result = planGarminImport([workout()], [saved({ externalId: "tcx:old", source })]);
    assert.equal(result[0].status, "duplicate");
  }
  assert.equal(planGarminImport([workout()], [saved({ externalId: "tcx:old", durationMin: 60 })])[0].status, "skipped");
  assert.equal(planGarminImport([workout()], [saved({ externalId: "tcx:a" }), saved({ id: "another", externalId: "tcx:b" })])[0].status, "skipped");
});
test("explicit feedback, planned rows, non-file identities and changed sport/time are protected", () => {
  for (const patch of [{ feedbackStatus: "partial", actualDurationMin: 15 }, { planned: true }, { source: "strava" }, { sport: "bike" }, { date: new Date("2026-01-05T12:00:00Z") }]) {
    const result = planGarminImport([workout({ avgHr: 130 })], [saved(patch)]);
    assert.notEqual(result[0].status, "updated");
  }
});
test("batch duplicate and conflicting identities cannot silently overwrite each other", () => {
  assert.deepEqual(planGarminImport([workout(), workout()], []).map(row => row.status), ["new", "duplicate"]);
  assert.deepEqual(planGarminImport([workout(), workout({ durationMin: 60 })], []).map(row => row.status), ["skipped", "skipped"]);
});
test("only supplied activity metrics can change; null values never erase measurements or copy private notes", () => {
  const fields = importedFields({ ...workout(), avgHr: undefined, notes: "private", rpe: 4 } as GarminFileWorkout);
  assert.equal(fields.avgHr, undefined); assert.equal(fields.notes, undefined); assert.equal(fields.rpe, undefined);
  assert.deepEqual(garminImportCounts(planGarminImport([workout(), workout()], []), 2, 3), { new: 1, updated: 0, duplicate: 1, skipped: 2, rejected: 3 });
});
test("legacy CSV identity catches prior timezone errors without creating duplicates or silently moving history", () => {
  const candidate = workout({ legacyExternalIds: ["garmin-csv:2026-01-04 08:00:00:Easy"] });
  const old = saved({ externalId: candidate.legacyExternalIds![0], date: new Date("2026-01-04T08:00:00Z") });
  assert.equal(planGarminImport([candidate], [old])[0].status, "skipped");
  assert.equal(planGarminImport([candidate], [saved({ externalId: candidate.legacyExternalIds![0] })])[0].status, "duplicate");
});
test("performed planned day cannot be double-counted by a file at its real start time", () => {
  const actual = workout({ date: new Date("2026-01-04T13:00:00Z") });
  const completedPlan = saved({ externalId: null, planned: true, source: "plan", date: new Date("2026-01-04T05:00:00Z") });
  assert.equal(planGarminImport([actual], [completedPlan], "America/New_York")[0].status, "skipped");
  assert.equal(planGarminImport([actual], [{ ...completedPlan, completed: false, actualDurationMin: null }], "America/New_York")[0].status, "new");
});
