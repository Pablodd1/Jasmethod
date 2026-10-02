import test from "node:test";
import assert from "node:assert/strict";
import { structuredSteps } from "./prescription";
import { canonicalSession, SPORTS } from "./canonical-session";
import { prescribeToday } from "./adaptive";

test("generated allocations preserve full time budget and intensity caps across every sport and variant", () => {
  let timeOnly = 0;
  for (const sport of SPORTS) for (const minutes of [1, 5, 10, 20, 25, 30, 45, 60, 90, 120]) for (const variant of [0, 1, 2, 3]) for (let z = 1; z <= 7; z++) {
    const type = ["strength", "boxing", "hyrox", "mobility"].includes(sport) ? sport : "threshold";
    const steps = structuredSteps(minutes, `z${z}`, type, variant, sport);
    const fixture = `${sport}/${minutes}/v${variant}/z${z}`;
    assert.ok(steps.every(s => s.seconds > 0 && Number(s.zone.slice(1)) <= z), fixture);
    if (steps.every(s => !s.reps && (!s.endpoint || s.endpoint.type === "time"))) {
      timeOnly++;
      assert.equal(steps.reduce((sum, s) => sum + s.seconds, 0), minutes * 60, fixture);
      const c = canonicalSession({ athleteId: "fixture", workout: { id: fixture, sport, title: fixture, durationMin: minutes }, prescription: { durationMin: minutes, steps }, dateLocal: "2026-10-02", timezone: "UTC" });
      assert.equal(c.verdict, "ready", fixture);
      assert.equal(c.exactTimeSeconds, minutes * 60, fixture);
    } else {
      // Repetition seconds remain an estimated allocation, never an exact endpoint.
      const c = canonicalSession({ athleteId: "fixture", workout: { id: fixture, sport, title: fixture, durationMin: minutes }, prescription: { durationMin: minutes, steps }, dateLocal: "2026-10-02", timezone: "UTC" });
      assert.equal(c.exactTimeSeconds, null, fixture);
    }
  }
  assert.equal(timeOnly, 2240);
});
test("threshold variant preserves hard bouts/recovery and assigns the unused time to easy cooldown", () => {
  const p = prescribeToday({ session: { title: "Integration threshold", sport: "bike", type: "threshold", durationMin: 60, intensity: "z4", variantSeed: 1 }, adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z4" }, profile: { ftp: 200, lthr: 165 } });
  assert.deepEqual(p.steps.map(s => s.seconds), [540, 1173, 176, 1173, 538]);
  assert.equal(p.steps.reduce((sum, s) => sum + s.seconds, 0), 3600);
  assert.equal(p.steps.at(-1)!.zone, "z1");
});

test("low-zone variants never advertise threshold work and scaled labels match endpoints", () => {
  const easy = structuredSteps(30, "z2", "endurance", 1, "bike");
  assert.doesNotMatch(JSON.stringify(easy), /Sweet.spot|Threshold block/);
  assert.ok(easy.every(step => Number(step.zone.slice(1)) <= 2));
  const threshold = structuredSteps(60, "z4", "threshold", 1, "bike");
  assert.match(threshold.find(step => step.phase === "active")!.group!, /19 min 33 s/);
});
