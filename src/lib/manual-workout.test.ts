import { test } from "node:test";
import assert from "node:assert/strict";
import { parseManualWorkout } from "./manual-workout";
import { prescribeToday, recommendErgogenics } from "./adaptive";
import { PROTOCOL_VERSION } from "./protocols";
const now = new Date("2026-10-02T13:00:00Z");
test("unplanned activity requires explicit real sport, observation date and actual duration", () => {
  for (const input of [{}, { sport: "run" }, { sport: "run", date: "2026-10-01" }, { sport: "run", date: "2026-10-01", durationMin: true }, { sport: "run", date: "2026-10-03", durationMin: 30 }]) assert.throws(() => parseManualWorkout(input, "America/New_York", now));
});
test("unplanned activity preserves observed date separately and unknown RPE stays null", () => {
  const w = parseManualWorkout({ sport: "boxing", date: "2026-10-01", actualDurationMin: 23 }, "America/New_York", now);
  assert.equal(w.sport, "boxing"); assert.equal(w.durationMin, 23); assert.equal(w.actualDurationMin, 23); assert.equal(w.rpe, null); assert.equal(w.planned, false); assert.equal(w.completed, true);
  assert.equal(w.date.toISOString(), "2026-10-01T04:00:00.000Z"); assert.equal(w.feedbackAt.toISOString(), now.toISOString()); assert.equal(JSON.parse(w.actualDetails).observedDate, "2026-10-01");
});
test("protocol early return obeys the actual remaining time budget", () => {
  for (const timeBudgetMin of [0, 12, 25, 30]) {
    const p = prescribeToday({ session: { sport: "bike", title: "Aerobic", type: "endurance", intensity: "z2", durationMin: 60, protocol: { id: "aerobic-base", sport: "bike", minutes: 60, level: "advanced", version: PROTOCOL_VERSION } }, adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z7" }, timeBudgetMin });
    assert.ok(p.durationMin <= timeBudgetMin, `${p.durationMin} exceeds ${timeBudgetMin}`);
    assert.ok(p.steps.reduce((sum, step) => sum + step.seconds, 0) <= timeBudgetMin * 60);
  }
});
test("master supplement toggle never opts athletes into individual supplements", () => {
  const session = { sport: "boxing", type: "interval", durationMin: 120, intensity: "z5" };
  assert.deepEqual(recommendErgogenics({ enabled: true, likes: [], dislikes: [], optsOut: [] }, session).recommended, []);
  assert.ok(recommendErgogenics({ enabled: true, likes: ["creatine"], dislikes: [], optsOut: [] }, session).recommended.every((s) => s.key === "creatine"));
});

import { checkinPrescriptionInputError } from "./checkin-prescription-input";
test("corrupt originalPlan cannot be normalized into a fresh workout", () => {
  const base = { sport: "run", title: "Run", type: "endurance", durationMin: 40, intensity: "z2" };
  assert.equal(checkinPrescriptionInputError(base), null);
  for (const originalPlan of ["{bad", "null", "[]", JSON.stringify({ ...base, sport: "hacked" }), JSON.stringify({ ...base, durationMin: -3 }), JSON.stringify({ ...base, intensity: "z99" })]) assert.ok(checkinPrescriptionInputError({ ...base, originalPlan }));
});

test("manual effort zero stays explicit rather than unknown", () => {
  assert.equal(parseManualWorkout({ sport: "mobility", date: "2026-10-01", actualDurationMin: 10, rpe: 0 }, "America/New_York", now).rpe, 0);
});
