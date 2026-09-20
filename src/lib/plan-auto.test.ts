import { test } from "node:test";
import assert from "node:assert";
import { starterPlanInputs } from "./plan-auto";

test("starter inputs: selected sport wins; missing data falls back, never to nothing", () => {
  // Sport selected → that sport's plan.
  assert.strictEqual(
    starterPlanInputs({ goal: "boxing" }).distance,
    "boxing",
  );
  assert.strictEqual(
    starterPlanInputs({ goal: "track-sprint" }).distance,
    "track-sprint",
  );
  // Nothing filled (saved empty) → the wizard's default sport, not "no plan".
  assert.strictEqual(starterPlanInputs(null).distance, "olympic");
  assert.strictEqual(starterPlanInputs({ goal: null }).distance, "olympic");
  assert.strictEqual(starterPlanInputs({ goal: "not-a-sport" }).distance, "olympic");
  // Level falls back to beginner; weeks are always a sane default.
  assert.strictEqual(starterPlanInputs(null).level, "beginner");
  assert.strictEqual(starterPlanInputs({ experience: "zzz" }).level, "beginner");
  assert.strictEqual(starterPlanInputs({ experience: "advanced" }).level, "advanced");
  assert.strictEqual(starterPlanInputs(null).weeks, 12);
});

test("starter inputs: race date only counts when it is in the future", () => {
  assert.strictEqual(
    starterPlanInputs({ raceDate: new Date(Date.now() + 30 * 86400000) }).hasRace,
    true,
  );
  assert.strictEqual(
    starterPlanInputs({ raceDate: new Date(Date.now() - 86400000) }).hasRace,
    false,
  );
  assert.strictEqual(starterPlanInputs(null).hasRace, false);
});
