import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { buildReviewedCycleSample, reviewedSampleTotals, REVIEWED_CYCLE_SAMPLE_GOALS } from "./reviewed-cycle-samples";
import { PLANNABLE_GOALS } from "./planning-setup";
import { cssFromTestTimes } from "./science";
import { normalizeCycleEvents, cycleEventDay } from "./cycle-events";
import { buildCycleBaselineReviews } from "./cycle-review";

test("review-only examples cover every supported goal and label strength's partial scope", () => {
  assert.deepEqual([...REVIEWED_CYCLE_SAMPLE_GOALS].filter(goal => goal !== "general-strength").sort(), [...PLANNABLE_GOALS].sort());
  for (const goal of REVIEWED_CYCLE_SAMPLE_GOALS) {
    const sample = buildReviewedCycleSample(goal);
    assert.equal(sample.review.automaticPrescription, false);
    assert.equal(sample.review.qualifiedCoachApproval, false);
    assert.equal(sample.review.scope, "engineering_and_evidence_scope");
    assert.match(sample.population, /Synthetic/);
    assert.equal(sample.weeks.length, 12);
    assert.ok(sample.baselines.every(baseline => baseline.source === "synthetic_fixture" && baseline.reviewRule === "coaching_heuristic"));
    assert.ok(sample.prerequisites.some(rule => /coaching heuristics/.test(rule)));
  }
  assert.equal(buildReviewedCycleSample("general-strength").support, "partial_supporting_strength");
  assert.match(buildReviewedCycleSample("general-strength").limitations.join(" "), /Olympic-lifting/);
  for (const excluded of ["boxing", "lifting", "olympic-lifting"])
    assert.throws(() => buildReviewedCycleSample(excluded as never), /Unsupported/);
  // Guard against silently wiring an educational fixture into a production route.
  function assertNoProductionImport(directory: string) {
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${file.name}`;
      if (file.isDirectory()) assertNoProductionImport(path);
      else if (/\.tsx?$/.test(file.name) && !file.name.endsWith(".test.ts") && file.name !== "reviewed-cycle-samples.ts")
        assert.doesNotMatch(readFileSync(path, "utf8"), /from ["'][^"']*reviewed-cycle-samples["']/);
    }
  }
  assertNoProductionImport("src");
});

test("all full-cycle samples preserve honest time/distance totals, event days and recovery", () => {
  for (const goal of REVIEWED_CYCLE_SAMPLE_GOALS) {
    const sample = buildReviewedCycleSample(goal);
    for (const week of sample.weeks) {
      assert.equal(new Set(week.sessions.map(session => session.daySlot)).size, week.sessions.length);
      assert.ok(week.restDaySlots.length >= 1);
      assert.ok(week.sessions.reduce((sum, session) => sum + session.budgetMinutes, 0) <= sample.baselineWeeklyMinutes);
      for (const session of week.sessions) {
        const totals = reviewedSampleTotals(session);
        assert.ok(totals.timedSeconds <= session.budgetMinutes * 60);
        assert.equal(session.provenance.doseOrigin, "jmm_coaching_heuristic");
        assert.equal(session.provenance.trialReplication, false);
        assert.ok(session.provenance.sourceIds.length);
        assert.ok(session.steps.every(step => step.target.type === "open"));
        if (totals.distanceMeters > 0) assert.equal(totals.exactTimeSeconds, null);
        else assert.equal(totals.exactTimeSeconds, totals.timedSeconds);
      }
    }
    if (sample.event) {
      const events = normalizeCycleEvents({ events: [{ ...sample.event, source: "request" }] });
      assert.equal(cycleEventDay(events, sample.event.dateKey).protected, true);
      assert.ok(sample.weeks[10].sessions.every(session => session.daySlot !== 6));
      assert.deepEqual(sample.weeks[11].sessions, []);
      assert.match(sample.weeks[11].theme, /no assumed return/);
    }
  }
});

test("editable work/rest endpoints recompute totals without inventing distance duration", () => {
  const run = buildReviewedCycleSample("run-only").weeks[1].sessions.find(session => session.title.startsWith("3 ×"))!;
  assert.deepEqual(reviewedSampleTotals(run), { timedSeconds: 1860, distanceMeters: 0, workSeconds: 720, recoverySeconds: 240, exactTimeSeconds: 1860, budgetMinutes: 31 });
  assert.equal(run.steps.filter(step => step.phase === "recovery").length, 2);
  const original = JSON.stringify(run);
  const edit = structuredClone(run);
  edit.steps.find(step => step.phase === "active")!.endpoint = { type: "time", seconds: 180 };
  assert.equal(reviewedSampleTotals(edit).exactTimeSeconds, 1800);
  assert.equal(JSON.stringify(run), original);
  const swim = buildReviewedCycleSample("swim-only").weeks[1].sessions[0];
  assert.equal(reviewedSampleTotals(swim).distanceMeters, 900);
  assert.equal(reviewedSampleTotals(swim).recoverySeconds, 150);
  assert.equal(reviewedSampleTotals(swim).exactTimeSeconds, null);
  const sprint = buildReviewedCycleSample("track-sprint").weeks[1].sessions[0];
  assert.equal(reviewedSampleTotals(sprint).distanceMeters, 80);
  assert.equal(reviewedSampleTotals(sprint).recoverySeconds, 540);
  assert.equal(reviewedSampleTotals(sprint).exactTimeSeconds, null);
  assert.throws(() => reviewedSampleTotals({ ...run, budgetMinutes: 1 }), /exceed/);
});

test("baseline examples preserve source-specific constructs and core expiry semantics", () => {
  const swim = buildReviewedCycleSample("swim-only").baselines[0];
  assert.equal(cssFromTestTimes(Number(swim.observations.t400Seconds), Number(swim.observations.t200Seconds)), swim.observations.cssSecondsPer100m);
  assert.match(buildReviewedCycleSample("run-only").baselines[0].interpretation, /not measured threshold/);
  assert.match(buildReviewedCycleSample("cycle").baselines[0].interpretation, /CP needs its own test/);
  const testDate = new Date("2026-10-05T12:00:00Z");
  const input = { profile: { ftp: 220 }, tests: [{ id: "synthetic-ftp", date: testDate, type: "ftp", result: 220, skipped: false, completed: true }], appliedIds: ["synthetic-ftp"], sports: ["bike", "run", "strength"] as const, timezone: "UTC" };
  const current = buildCycleBaselineReviews({ ...input, now: new Date("2026-10-12T12:00:00Z") });
  assert.equal(current[0].status, "current");
  assert.equal(current[1].status, "missing");
  assert.equal(current[2].status, "missing");
  assert.equal(buildCycleBaselineReviews({ ...input, now: new Date("2026-11-02T12:00:00Z") })[0].status, "review_due");
  const expired = buildCycleBaselineReviews({ ...input, now: new Date("2027-01-04T12:00:00Z") })[0];
  assert.equal(expired.status, "expired");
  assert.equal(expired.observedAt, "2026-10-05");
});


test("the review document is reproducible from editable session endpoints", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/render-reviewed-cycle-samples.ts", "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Verified 10 review-only cycle examples/);
});
