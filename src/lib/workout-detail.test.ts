import { test } from "node:test";
import assert from "node:assert";
import { structuredSteps } from "./prescription";

test("strength sessions get named lift blocks with sets, reps and variation", () => {
  const a = structuredSteps(50, "z3", "strength", 0, "strength");
  const b = structuredSteps(50, "z3", "strength", 1, "strength");
  assert.ok(a.length >= 4, "warm-up, main, accessory, cool-down at minimum");
  const activeNames = a.filter((s) => s.phase === "active").map((s) => s.name);
  assert.ok(activeNames.some((n) => /Squat|Deadlift/i.test(n)), "named main lifts");
  assert.ok(a.some((s) => s.reps === 20 && /4 sets × 5/.test(s.note || "")), "main block: 4×5");
  assert.ok(a.some((s) => s.reps === 30 && /3 sets × 10/.test(s.note || "")), "accessory: 3×10");
  // Variation: a different seed rotates the exercise selection.
  assert.notDeepEqual(
    a.filter((s) => s.phase === "active").map((s) => s.name),
    b.filter((s) => s.phase === "active").map((s) => s.name),
  );
  // Sum of step seconds ≈ session length (within rounding).
  const sum = a.reduce((acc, s) => acc + s.seconds, 0);
  assert.ok(Math.abs(sum - 50 * 60) <= 120, `strength steps sum ${sum}s vs 3000s`);
});

test("boxing sessions get rounds with rotating technical focus and rests", () => {
  const steps = structuredSteps(60, "z5", "skill", 0, "boxing");
  const rounds = steps.filter((s) => /^Round \d+/.test(s.name));
  const rests = steps.filter((s) => s.name === "Rest between rounds");
  assert.ok(rounds.length >= 8, `60-min session needs real rounds, got ${rounds.length}`);
  assert.strictEqual(rounds.length - rests.length <= 1, true);
  assert.ok(rounds.every((r) => r.seconds === 180 && r.zone === "z5"));
  assert.ok(rests.every((r) => r.seconds === 60));
  const focuses = new Set(rounds.map((r) => r.name));
  assert.ok(focuses.size > 1, "focus rotates across rounds");
});

test("HYROX sessions alternate run and station blocks", () => {
  const steps = structuredSteps(75, "z4", "interval", 0, "hyrox");
  const runs = steps.filter((s) => /^Run \d+/.test(s.name));
  const stations = steps.filter((s) => /Sled|Wall balls|Lunge|Farmers|Row/.test(s.name));
  assert.ok(runs.length >= 3);
  assert.ok(stations.length >= 3);
  assert.strictEqual(runs.length, stations.length, "run and station blocks pair up");
});

test("default sports keep the interval/steady structure (no regression)", () => {
  const intervals = structuredSteps(45, "z4", "interval", 0, "run");
  assert.ok(intervals.some((s) => /Effort 1/.test(s.name)));
  assert.ok(intervals.some((s) => s.phase === "recovery"));
  const steady = structuredSteps(60, "z2", "endurance", 0, "bike");
  assert.ok(steady.some((s) => /Steady effort/.test(s.name)));
});

test("every step carries an executable note in the sport builders", () => {
  for (const steps of [
    structuredSteps(50, "z3", "strength", 0, "strength"),
    structuredSteps(60, "z5", "skill", 0, "boxing"),
    structuredSteps(75, "z4", "interval", 0, "hyrox"),
  ]) {
    for (const s of steps)
      assert.ok(s.note && s.note.length > 10, `step "${s.name}" needs an instruction note`);
  }
});
