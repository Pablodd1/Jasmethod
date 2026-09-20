import { test } from "node:test";
import assert from "node:assert";
import { prescribeToday } from "./adaptive";

const base = {
  session: {
    sport: "run",
    title: "Tempo run",
    type: "tempo",
    intensity: "z3",
    durationMin: 45,
  },
  adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z7" },
};

test("coach intensity 100/null leaves the prescription as planned", () => {
  for (const pct of [null, 100]) {
    const p = prescribeToday({ ...base, profile: { intensityPct: pct } });
    assert.strictEqual(p.intensity, "z3");
    assert.strictEqual(p.durationMin, 45);
  }
});

test("coach intensity 80% eases: zone capped one step down, duration trimmed 20%", () => {
  const p = prescribeToday({ ...base, profile: { intensityPct: 80 } });
  assert.strictEqual(p.intensity, "z2");
  assert.strictEqual(p.durationMin, 36);
});

test("coach intensity 60% caps two zones and trims duration to 60%", () => {
  const p = prescribeToday({ ...base, profile: { intensityPct: 60 } });
  assert.strictEqual(p.intensity, "z1");
  assert.strictEqual(p.durationMin, 27);
});

test("coach intensity 120% sharpens: planned zone raised two steps, duration +25%", () => {
  const p = prescribeToday({ ...base, profile: { intensityPct: 120 } });
  assert.strictEqual(p.intensity, "z5");
  assert.strictEqual(p.durationMin, 56); // round(45 × 1.25)
});

test("coach intensity never overrides a rest verdict", () => {
  const p = prescribeToday({
    ...base,
    adaptation: { verdict: "rest", durationFactor: 0, intensityCap: "z1" },
    profile: { intensityPct: 120 },
  });
  assert.strictEqual(p.durationMin, 0);
});

test("coach intensity never pushes past a harder automatic check-in cap when easing", () => {
  const p = prescribeToday({
    ...base,
    adaptation: { verdict: "easy", durationFactor: 0.85, intensityCap: "z2" },
    profile: { intensityPct: 80 },
  });
  // planned z3, coach shift → z2, automatic cap z2 → z2
  assert.strictEqual(p.intensity, "z2");
});
