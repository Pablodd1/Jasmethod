import test from "node:test";
import assert from "node:assert/strict";
import { planTargetPreview } from "./plan-target-preview";

const now = new Date("2026-10-31T12:00Z");
const steps = [{ name: "Steady", seconds: 1800, zone: "z2", phase: "active" as const }];
const input = { steps, sport: "bike" as const, profile: { ftp: 200 },
  tests: [{ id: "ftp-test", type: "ftp", result: 200, date: now, completed: true, skipped: false }],
  appliedIds: ["ftp-test"], now, sessionDate: now, timezone: "UTC" };

test("preview projects current targets and evidence without altering relative stored steps", () => {
  const result = planTargetPreview(input);
  assert.match(result.steps[0].targetLabel, /111–150 W/);
  assert.equal(result.steps[0].reference?.source, "applied_field_test");
  assert.equal(result.steps[0].reference?.observedAt, now.toISOString());
  assert.deepEqual(result.mechanicalWork, { lowKj: 199.8, highKj: 270 });
  assert.equal("target" in steps[0], false);
});

test("future/absent/unapplied evidence leaves targets and work unknown", () => {
  for (const override of [{ sessionDate: new Date("2027-02-01T12:00Z") }, { appliedIds: [] }, { tests: [] }]) {
    const result = planTargetPreview({ ...input, ...override });
    assert.match(result.steps[0].targetLabel, /RPE/);
    assert.equal(result.steps[0].reference, null);
    assert.equal(result.mechanicalWork, null);
  }
});

test("automatic units match the executable athlete preference in both languages", () => {
  const run = { ...input, sport: "run" as const, profile: { runPaceBase: 300, units: "auto" },
    tests: [{ ...input.tests[0], id: "run-test", type: "run5k", result: 1415 }], appliedIds: ["run-test"] };
  const english = planTargetPreview({ ...run, language: "en" });
  const spanish = planTargetPreview({ ...run, language: "es" });
  assert.match(english.steps[0].targetLabel, /\/mi/);
  assert.match(english.steps[0].speedLabel!, /mph/);
  assert.match(spanish.steps[0].targetLabel, /\/km/);
  assert.match(spanish.steps[0].speedLabel!, /km\/h/);
});
