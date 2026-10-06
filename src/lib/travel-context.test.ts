import test from "node:test";
import assert from "node:assert/strict";
import { parseTravelContext } from "./travel-context";
import { parsePlanningSetup, assessPlanningSetup } from "./planning-setup";

test("travel is optional and unknown fields never become dates, a timezone or a time cap", () => {
  assert.equal(parseTravelContext(undefined), null);
  assert.equal(parseTravelContext(null), null);
  assert.deepEqual(parseTravelContext({}), { startDate: null, endDate: null, destinationTimezone: null, equipmentNotes: "", timeNotes: "", maxSessionMinutes: null });
  assert.equal(parseTravelContext({ maxSessionMinutes: 0 })?.maxSessionMinutes, 0);
});

test("travel rejects calendar rollover, reversed dates, invalid timezone and malformed caps", () => {
  for (const value of [{ startDate: "2026-02-30" }, { endDate: "2026-13-01" }, { startDate: "2026-10-10", endDate: "2026-10-09" }, { destinationTimezone: "Not/AZone" }, { maxSessionMinutes: -1 }, { maxSessionMinutes: 301 }, { maxSessionMinutes: 1.5 }, { maxSessionMinutes: true }, { maxSessionMinutes: " " }, { equipmentNotes: "x".repeat(1001) }]) assert.throws(() => parseTravelContext(value));
  assert.equal(parseTravelContext({ startDate: "2028-02-29", endDate: "2028-02-29", destinationTimezone: "America/New_York" })?.startDate, "2028-02-29");
});

test("setup JSON roundtrip preserves travel without changing baseline, account timezone or readiness requirements", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const input = { baselineObservedAt: "2026-10-05", travel: { startDate: "2026-10-09", endDate: null, destinationTimezone: "Asia/Tokyo", equipmentNotes: " Hotel gym ", timeNotes: "Meetings", maxSessionMinutes: "30" } };
  const setup = parsePlanningSetup(input, now, "America/New_York");
  assert.deepEqual(parsePlanningSetup(JSON.parse(JSON.stringify(setup)), now).travel, setup.travel);
  assert.equal(setup.baselineObservedAt, "2026-10-05");
  assert.equal(setup.travel?.equipmentNotes, "Hotel gym");
  assert.equal(setup.travel?.maxSessionMinutes, 30);
  assert.deepEqual(assessPlanningSetup(null, setup, now), assessPlanningSetup(null, { ...setup, travel: null }, now));
});
