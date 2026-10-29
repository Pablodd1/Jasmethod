import test from "node:test";
import assert from "node:assert/strict";
import { generatePlan } from "./science";
import { parsePlanningSetup } from "./planning-setup";
import { boundPlanWeeks } from "./planning-bounds";
import { shapeTrainingCycle } from "./training-cycle";

const start = new Date("2026-10-20T00:00:00Z");
const setup = parsePlanningSetup({ baselineWeeklyMinutes: 411, trainingDays: [0, 1, 2, 3, 4, 5, 6], maxSessionMinutes: 180, restPreference: "no_fixed_rest" });
const generate = (distance: string, extra: { weeklyHours?: number; reviewedCycle?: boolean } = {}) => generatePlan({
  level: "advanced", distance, weeks: 8, startDate: start, weeklyHours: 411 / 60, reviewedCycle: true, ...extra,
});

test("reviewed triathlon planning uses the reported 411-minute dose without a second event-distance multiplier", () => {
  const sprint = generate("sprint"), olympic = generate("olympic"), half = generate("half");
  // Sport-specific structures/ceilings can leave different unused minutes.
  // The volume wave must use the same reported input, without another distance discount.
  assert.deepEqual(sprint.map(w=>w.periodizationFactor),half.map(w=>w.periodizationFactor));
  assert.deepEqual(olympic.map(w=>w.periodizationFactor),half.map(w=>w.periodizationFactor));
  for(const cycle of [sprint,olympic,half])assert.ok(Math.abs(cycle[0].totalMinutes-411*.85)<=8);
  for (const distance of ["sprint", "olympic", "half", "full"]) {
    const raw = generate(distance);
    const bounded = boundPlanWeeks(raw, setup, 14, 2, "advanced", [], { preserveWeeklyDose: true }).weeks;
    const cycle = shapeTrainingCycle(bounded, { startKey: "2026-10-20", needsAssessment: true, templatePeriodized: true, recoveryReview: false, protectedDays: [] });
    // Week one retains the template's 0.85 volume wave, with integer rounding.
    assert.ok(Math.abs(cycle[0].totalMinutes - 411 * .85) <= 3, distance);
    assert.equal(cycle[0].restDaySlots.length, 0);
    for (const sport of ["swim", "bike", "run"]) assert.ok(cycle[0].sessions.some(s => s.sport === sport), `${distance}: ${sport}`);
    assert.equal(raw[5].periodizationFactor, .55);
    assert.ok(cycle[5].totalMinutes < cycle[4].totalMinutes, "the template recovery week remains reduced");
    for (const [index, week] of cycle.entries()) {
      assert.ok(week.totalMinutes <= 411);
      assert.equal(week.cycleFactor, 1, "no second generic ramp is applied");
      assert.equal(week.totalMinutes, bounded[index].totalMinutes);
      assert.ok(week.sessions.every(s => Number.isInteger(s.minutes) && s.minutes > 0 && s.minutes <= 180));
    }
  }
});

test("legacy or unreviewed suggested volumes retain distance defaults", () => {
  for (const options of [{ reviewedCycle: false }, { weeklyHours: undefined }]) {
    assert.ok(generate("sprint", options)[0].totalMinutes < generate("half", options)[0].totalMinutes);
    assert.ok(generate("half", options)[0].totalMinutes < generate("full", options)[0].totalMinutes);
  }
});

test("easy-volume trimming removes the computed excess without shrinking the retained allocation again", () => {
  const first = generate("half")[0];
  const budget = Math.round(411 * first.periodizationFactor!);
  assert.ok(first.sessions.every(s => ["z1", "z2"].includes(s.zone)));
  // All easy bouts fit the ordinary caps in this fixture, so only per-bout
  // integer rounding can explain a difference from the intended weekly dose.
  assert.ok(Math.abs(first.totalMinutes - budget) <= 3);
  assert.equal(first.totalMinutes, first.sessions.reduce((sum, s) => sum + s.minutes, 0));
});

test("reviewed volume still yields to availability, performed dates and recovery review without a minimum workout duration", () => {
  const restricted = { ...setup, trainingDays: [2, 4], maxSessionMinutes: 10 };
  const bounded = boundPlanWeeks(generate("sprint"), restricted, 14, 2, "advanced", [], { preserveWeeklyDose: true }).weeks;
  const cycle = shapeTrainingCycle(bounded, { startKey: "2026-10-20", needsAssessment: true, templatePeriodized: true, recoveryReview: true, protectedDays: ["2026-10-20"] });
  assert.ok(cycle[0].totalMinutes < bounded[0].totalMinutes);
  assert.ok(cycle[0].sessions.every(s => s.daySlot !== 0));
  for (const week of cycle) {
    assert.ok(week.totalMinutes <= 20);
    assert.ok(week.sessions.every(s => [2, 4].includes((2 + s.daySlot) % 7) && s.minutes <= 10));
  }
});
