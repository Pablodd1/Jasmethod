import { test } from "node:test";
import assert from "node:assert";
import {
  parseFinishTimeSec,
  normalizeResult,
  mapDistance,
} from "./athlinks";

test("athlinks: finish-time parsing handles h:m:s, m:s, seconds and ms epochs", () => {
  assert.strictEqual(parseFinishTimeSec("2:31:07"), 2 * 3600 + 31 * 60 + 7);
  assert.strictEqual(parseFinishTimeSec("45:12"), 45 * 60 + 12);
  assert.strictEqual(parseFinishTimeSec("3727"), 3727);
  // ms-epoch-shaped numbers are treated as milliseconds
  assert.strictEqual(parseFinishTimeSec(3727000), 3727);
  assert.strictEqual(parseFinishTimeSec(undefined), null);
  assert.strictEqual(parseFinishTimeSec("garbage"), null);
});

test("athlinks: normalization requires id, valid date and name — else null", () => {
  assert.strictEqual(normalizeResult({ resultId: 1, eventName: "X" }), null, "no date");
  assert.strictEqual(
    normalizeResult({ eventName: "X", eventDate: "2026-05-01" }),
    null,
    "no id",
  );
  assert.strictEqual(
    normalizeResult({ resultId: 2, eventDate: "not-a-date" }),
    null,
    "bad date",
  );
  assert.strictEqual(
    normalizeResult({ resultId: 2, eventDate: "2026-05-01" }),
    null,
    "no name",
  );
  const ok = normalizeResult({
    resultId: 99,
    eventId: 7,
    eventName: "Miami Man 70.3",
    eventDate: "2026-11-15",
    distanceName: "Half Ironman",
    overallTime: "5:12:00",
    overallRank: 120,
    genderRank: 101,
    ageGroupRank: 12,
  });
  assert.ok(ok);
  assert.strictEqual(ok.sourceRecordId, "99");
  assert.strictEqual(ok.finishTimeSec, 5 * 3600 + 12 * 60);
  assert.strictEqual(ok.placeOverall, 120);
  assert.strictEqual(ok.placeAgeGroup, 12);
});

test("athlinks: distance label maps onto the app's race vocabulary", () => {
  assert.strictEqual(mapDistance("Sprint"), "sprint");
  assert.strictEqual(mapDistance("Olympic"), "olympic");
  assert.strictEqual(mapDistance("Half Ironman"), "half");
  assert.strictEqual(mapDistance("70.3"), "half");
  assert.strictEqual(mapDistance("Ironman"), "full");
  assert.strictEqual(mapDistance("140.6"), "full");
  assert.strictEqual(mapDistance("HYROX"), "hyrox");
  assert.strictEqual(mapDistance("5K"), "other");
  assert.strictEqual(mapDistance(undefined), "other");
  // "Super Sprint" contains sprint but not iron → sprint
  assert.strictEqual(mapDistance("Super Sprint"), "sprint");
});
