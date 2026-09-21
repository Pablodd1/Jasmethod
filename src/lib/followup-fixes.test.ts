import { test } from "node:test";
import assert from "node:assert";
import { parseTrainingCommand, applyTrainingCommand } from "./training-commands";
import { structuredSteps } from "./prescription";
import { prescribeToday } from "./adaptive";
import { postFuelPersonalized } from "./fueling";

// ---- Follow-up review: negation handling ----

test("parser: 'I do not need a rest day' never triggers an edit", () => {
  for (const q of [
    "I do not need a rest day",
    "no rest day for me today",
    "I don't want to skip the workout",
  ]) {
    assert.strictEqual(parseTrainingCommand(q).command, "NO_CHANGE", `"${q}"`);
  }
});

// ---- Follow-up review: sport builders respect the zone cap and time ----

test("boxing steps follow the capped zone and never overrun the session", () => {
  const easy = structuredSteps(10, "z2", "skill", 0, "boxing");
  const total = easy.reduce((a, s) => a + s.seconds, 0);
  assert.ok(total <= 10 * 60 + 30, `10-min session built ${total}s of steps`);
  assert.ok(
    easy.every((s) => Number(s.zone.slice(1)) <= 2 || s.phase !== "active"),
    "no active step above the z2 cap",
  );
  const hard = structuredSteps(60, "z5", "skill", 0, "boxing");
  assert.ok(hard.some((s) => s.zone === "z5"), "hard day keeps real rounds");
  const totalHard = hard.reduce((a, s) => a + s.seconds, 0);
  assert.ok(totalHard <= 60 * 60 + 30, `60-min session built ${totalHard}s`);
});

test("hyrox blocks follow the capped zone", () => {
  const easy = structuredSteps(40, "z2", "interval", 0, "hyrox");
  assert.ok(
    easy.every((s) => Number(s.zone.slice(1)) <= 2),
    "no z4 blocks in a z2-capped hyrox session",
  );
});

test("strength skips plyometrics when the session is capped below z3", () => {
  const easy = structuredSteps(50, "z2", "strength", 0, "strength");
  assert.ok(easy.every((s) => !/Plyometrics/i.test(s.name)), "no plyo on an easy day");
  const hard = structuredSteps(50, "z4", "strength", 0, "strength");
  assert.ok(hard.some((s) => /Plyometrics/i.test(s.name)), "plyo kept on a normal day");
});

// ---- Follow-up review: time budget enforced last ----

test("coach 120% cannot push a 30-minute budget to 38 minutes", () => {
  const p = prescribeToday({
    session: { sport: "run", title: "Easy run", type: "endurance", intensity: "z2", durationMin: 45 },
    adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z7" },
    profile: { intensityPct: 120 },
    timeBudgetMin: 30,
  });
  assert.ok(p.durationMin <= 30, `budget exceeded: ${p.durationMin}`);
});

// ---- Follow-up review: fueling unit label ----

test("post-fuel note states TOTAL grams, not g/kg/h", () => {
  const r = postFuelPersonalized({ durationMin: 120, intensity: "z4", weightKg: 70 });
  assert.ok(!/g\/kg\/h/.test(r.note), "misleading unit must be gone");
  assert.match(r.note, /84 g carbs TOTAL/);
});

// ---- Day-off protocol (owner spec) ----
import { dayOffProtocol, dayOffProtocolText } from "./day-off";

test("day-off protocol carries sleep, fuel, supplementation and visualization in both languages", () => {
  for (const lang of ["en", "es"] as const) {
    const p = dayOffProtocol(lang);
    const all = JSON.stringify(p);
    assert.match(all, /8 hours|8 horas/);
    assert.match(all, /creatin/i);
    assert.ok(p.essentials.length >= 4, "sleep, fuel, supplementation, movement");
    assert.strictEqual(p.visualizationFull.length, 8, "full 8-step visualization routine");
    const t = dayOffProtocolText(lang);
    assert.match(t, /VISUALIZATION \(2-5 min|VISUALIZACIÓN \(2-5 min/);
    assert.match(t, /Supplement|SUPLEMENTACIÓN/i);
  }
});
