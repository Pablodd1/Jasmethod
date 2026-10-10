import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCycleBaselineReviews, cycleBaselineStatus, requiredCycleSports } from "./cycle-review";
import { evidencedTargetProfile, type AnchorTest } from "./anchor-evidence";

const now = new Date("2026-10-12T12:00:00Z");
const testRecord = (type: string, result: number, date = new Date("2026-10-01T12:00:00Z")): AnchorTest => ({ id: type, type, result, date, completed: true, skipped: false });
const profile = { ftp: 200, runPaceBase: 318, swimPaceBase: 110 };
const tests = [testRecord("ftp", 200), testRecord("run5k", 1500), testRecord("swim", 110)];
const make = (changes: Partial<Parameters<typeof buildCycleBaselineReviews>[0]> = {}) => buildCycleBaselineReviews({ profile, tests, appliedIds: tests.map(test => test.id), sports: ["bike", "run", "swim"], now, timezone: "UTC", ...changes });

test("each endurance sport retains its own dated source and review cadence, without cross-sport evidence", () => {
  const reviews = make();
  assert.deepEqual(reviews.map(review => review.source), ["measured_test", "estimated_from_5k_test", "swim_field_test_reference"]);
  for (const review of reviews) { assert.equal(review.status, "current"); assert.equal(review.observedAt, "2026-10-01"); assert.equal(review.reviewDueAt, "2026-10-29"); assert.equal(review.expiresAt, "2026-12-30"); }
  const partial = make({ appliedIds: ["ftp"] });
  assert.deepEqual(partial.map(review => review.status), ["current", "missing", "missing"]);
  assert.deepEqual(partial.map(review => review.value), [200, null, null]);
  assert.deepEqual(make({ tests: [testRecord("lthr", 170)] }).map(review => review.status), ["missing", "missing", "missing"]);
});
test("unapplied, invalid, future, skipped and mismatching evidence cannot establish a baseline", () => {
  const invalid = [
    { ...tests[0], date: new Date("2026-10-13") }, { ...tests[0], skipped: true }, { ...tests[0], completed: false },
    { ...tests[0], result: 201 }, { ...tests[0], result: Infinity }, { ...tests[0], date: new Date("bad") },
  ];
  for (const record of invalid) assert.equal(make({ tests: [record] })[0].status, "missing");
  assert.equal(make({ appliedIds: [] })[0].status, "missing");
});
test("90-day anchor expiry remains exact and observations/reviews cannot renew it", () => {
  const observed = new Date(now.getTime() - 90 * 86400000);
  const old = [testRecord("ftp", 200, observed)];
  assert.equal(make({ tests: old })[0].status, "review_due");
  assert.equal(evidencedTargetProfile(profile, old, ["ftp"], now).ftp, 200);
  const expired = make({ tests: old, now: new Date(now.getTime() + 1) })[0];
  assert.equal(expired.status, "expired"); assert.equal(expired.value, 200);
  assert.equal(evidencedTargetProfile(profile, old, ["ftp"], new Date(now.getTime() + 1)).ftp, null);
  assert.equal(cycleBaselineStatus(make()[0], "2026-10-29"), "review_due");
  assert.equal(cycleBaselineStatus(make()[0], "2026-12-30"), "expired");
  assert.equal(cycleBaselineStatus(make()[0], "2027-02-01"), "expired");
});
test("supported goals select relevant sports and movement sports require familiar technique review", () => {
  const expected = { cycle: ["bike"], "swim-only": ["swim"], "run-only": ["run"], "track-sprint": ["run"], hyrox: ["run", "hyrox", "strength"], strength: ["strength"], boxing: ["boxing"], sprint: ["swim", "bike", "run"], full: ["swim", "bike", "run"] };
  for (const [goal, sports] of Object.entries(expected)) assert.deepEqual(requiredCycleSports(goal), sports);
  const movement = make({ sports: ["strength", "hyrox", "mobility", "boxing"] });
  for (const review of movement) { assert.equal(review.status, "missing"); assert.equal(review.value, null); assert.match(review.note, /qualified review/); }
});
test("review keys follow athlete-local dates through daylight-saving changes", () => {
  const reviews = make({ tests: [testRecord("ftp", 200, new Date("2026-10-01T02:00:00Z"))], timezone: "America/New_York" });
  assert.equal(reviews[0].observedAt, "2026-09-30");
  assert.equal(reviews[0].reviewDueAt, "2026-10-28");
  assert.equal(reviews[0].expiresAt, "2026-12-29");
});
