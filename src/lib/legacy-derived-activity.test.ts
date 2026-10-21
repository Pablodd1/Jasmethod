import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { coachingSummary } from "./coaching";
import { importedTrainingReview } from "./imported-training-review";
import { cycleActivityEvidence } from "./training-cycle";
import { athleteDayReview } from "./athlete-day-review";
import * as policy from "./derived-activity-policy";
import * as dates from "./dates";

const now = new Date("2026-10-15T12:00:00Z"), day = "2026-10-06";
const base = { id: "actual", userId: "owner", date: new Date(`${day}T12:00:00Z`), source: "garmin", sport: "run", title: "Original actual", completed: true,
  planned: false, durationMin: 40, actualDurationMin: 40, distanceKm: 8, rpe: 4, feedbackStatus: "completed", matchedPlanId: null };

test("legacy summary/import review/cycle guards do not calculate from restricted or unknown raw contributors", () => {
  for (const origin of [{ source: "strava" }, { source: "uploaded_unknown" }, { source: "garmin", notes: "Original source: STRAVA" }, { source: "manual", externalId: "strava:42" }]) {
    const rows = [{ ...base, id: "permitted" }, { ...base, ...origin, id: "restricted", matchedPlanId: "permitted" }], before = JSON.stringify(rows);
    const summary = coachingSummary(rows, [], {}, "UTC", now);
    assert.equal(summary.minutes, null); assert.equal(summary.estimatedLoad, null); assert.equal(summary.pmc, null); assert.equal(summary.fulfillmentPct, null);
    assert.equal(summary.derivedActivityPolicy.status, "insufficient"); assert.deepEqual(summary.daily, []);
    const imported = importedTrainingReview(rows, "UTC", now);
    assert.equal(imported.rawRecordCount, 2); assert.equal(imported.recordedWeeklyAverageMinutes, null); assert.equal(imported.possibleOverlapGroups, null);
    assert.ok(imported.weeks.every(week => week.minutesRange.minimum === null && week.minutesRange.maximum === null));
    const cycle = cycleActivityEvidence(rows, day, "UTC");
    assert.equal(cycle.reportedMinutes, null); assert.equal(cycle.reportedSessions, null); assert.equal(cycle.historyReview, true);
    assert.equal(cycle.recoveryReview, false, "restriction does not establish physiological fatigue");
    assert.deepEqual(cycle.protectedDays, [day]); assert.match(cycle.note, /understate training/);
    assert.equal(JSON.stringify(rows), before);
  }
});

test("athlete day review preserves restricted original observations without derived pace or assumed grouping", () => {
  const row = { ...base, source: "strava" }, before = JSON.stringify(row);
  const result = athleteDayReview([row, { ...base, userId: "another-owner" }], "owner", day, "UTC", null);
  assert.equal(result.records.length, 1); assert.equal(result.records[0].minutes, 40); assert.equal(result.records[0].distanceKm, 8);
  assert.equal(result.records[0].rpe, 4); assert.equal(result.records[0].source, "strava");
  assert.equal(result.records[0].paceSecondsPerKm, null); assert.equal(result.possibleCopies, null); assert.equal(result.derivedActivityPolicy.status, "insufficient");
  assert.equal(JSON.stringify(row), before);
  const allowed = athleteDayReview([base], "owner", day, "UTC", null); assert.equal(allowed.records[0].paceSecondsPerKm, 300);
});

function weeklyFixture(origin: Record<string, unknown>) {
  let calculations = 0;
  const queries: any[] = [], rows = [{ ...base, ...origin }];
  const deps: Record<string, unknown> = { "./dates": dates, "./derived-activity-policy": policy, "./fitness": { estimateTss: () => { calculations++; return 30; } },
    "./db": { prisma: { workout: { findMany: async (args: any) => { queries.push(args); for (const key of ["source", "externalId", "notes"]) assert.equal(args.select[key], true); return rows; } }, athleteProfile: { findUnique: async () => ({ ftp: 200 }) } } } };
  const mod: any = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("src/lib/weekly-review.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, require: (id: string) => { if (id in deps) return deps[id]; throw Error(id); } });
  return { run: (language = "en") => mod.exports.buildWeeklyReview("owner", "UTC", language), calculations: () => calculations, queries };
}
test("weekly summaries select provenance and stop before load/adherence computations for restricted history", async () => {
  for (const origin of [{ source: "strava" }, { source: "garmin", notes: "Original source: STRAVA" }, { source: null }]) {
    const f = weeklyFixture(origin), result = await f.run();
    assert.equal(result.hasData, true); assert.equal(result.derivedActivityPolicy.status, "insufficient");
    assert.equal(f.calculations(), 0); assert.match(result.text, /not.*additional training capacity|no rest or additional training capacity/);
    assert.doesNotMatch(result.text, /Time total:|Total time:|Best effort:|%|load est/);
    assert.ok(f.queries.every(query => query.where.userId === "owner"));
    const spanish = await f.run("es"); assert.match(spanish.text, /no se infiere descanso/);
  }
  const allowed = weeklyFixture({ source: "manual" }); assert.match((await allowed.run()).text, /Total time:/); assert.ok(allowed.calculations() > 0);
});
