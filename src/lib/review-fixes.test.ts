import { test } from "node:test";
import assert from "node:assert";
import { parseTrainingCommand, applyTrainingCommand } from "./training-commands";
import { adaptSession } from "./adaptive";
import { generatePlan } from "./science";

// ---- Review-findings regression: chat must not mutate on questions/negations ----

test("parser: questions are never commands (review repro: 'What is a rest day?')", () => {
  for (const q of [
    "What is a rest day?",
    "how do zones work?",
    "why is my HRV low?",
    "¿qué es un día de descanso?",
    "should I train today?",
  ]) {
    assert.strictEqual(
      parseTrainingCommand(q).command,
      "NO_CHANGE",
      `"${q}" must not trigger a command`,
    );
  }
});

test("parser: negated actions are never commands (review repro: 'Do not cancel my workout')", () => {
  for (const q of [
    "Do not cancel my workout",
    "don't skip the session",
    "never remove the last set",
  ]) {
    assert.strictEqual(
      parseTrainingCommand(q).command,
      "NO_CHANGE",
      `"${q}" must not trigger a command`,
    );
  }
});

test("parser: explicit rest intent still works", () => {
  assert.strictEqual(parseTrainingCommand("make it a rest day").command, "REST_DAY");
  assert.strictEqual(parseTrainingCommand("I'm sick").command, "REST_DAY");
  assert.strictEqual(parseTrainingCommand("cancel today's workout").command, "REST_DAY");
  assert.strictEqual(parseTrainingCommand("I need a rest day").command, "REST_DAY");
});

test("parser: question WITH imperative carries the command", () => {
  assert.strictEqual(
    parseTrainingCommand("can you make it easier?").command,
    "REDUCE_INTENSITY",
  );
});

// ---- Review-findings regression: command application consistency ----

test("applyTrainingCommand: REST_DAY sets durationMin to 20 (was stale 60)", () => {
  const p = { session: { title: "Tempo", mainSet: ["4×5min"], totalQualityMeters: 300, type: "tempo", durationMin: 60 } };
  const r = applyTrainingCommand(p, { command: "REST_DAY", confidence: 0.9, originalText: "rest day" }, {});
  assert.ok(r.allowed);
  assert.strictEqual(r.adjusted.session.durationMin, 20);
});

test("applyTrainingCommand: CHANGE_DURATION respects readiness caps", () => {
  const p = { session: { title: "Easy", mainSet: ["z2"], totalQualityMeters: 0, type: "endurance", durationMin: 45 } };
  const cmd = { command: "CHANGE_DURATION" as const, value: 180, confidence: 0.9, originalText: "3 hours" };
  const low = applyTrainingCommand(JSON.parse(JSON.stringify(p)), cmd, { readinessScore: 40 });
  assert.ok(!low.allowed, "low readiness must reject 180 min");
  const high = applyTrainingCommand(JSON.parse(JSON.stringify(p)), cmd, { readinessScore: 85 });
  assert.ok(high.allowed, "high readiness may accept 180 min");
});

// ---- Review-findings regression: menstrual flag no longer auto-penalizes ----

test("adaptSession: menstrual flag alone does not reduce the score (McNulty 2020)", () => {
  const base = { sleep: 4, soreness: 2, energy: 4, stress: 2, motivation: 4, menstrual: false } as any;
  const withFlag = { ...base, menstrual: true } as any;
  assert.strictEqual(adaptSession(withFlag).score, adaptSession(base).score);
});

// ---- Review-findings regression: plan generator integer + budget guarantees ----

test("plan generator: every session is integer minutes and the week fits its budget", () => {
  // Reproduced review case: 8h amateur half-distance plan overshot to 9.8h.
  const weeks = generatePlan({
    weeks: 12,
    level: "amateur",
    distance: "half",
    weeklyHours: 8,
    startDate: new Date(),
  });
  assert.ok(weeks.length === 12);
  const distFactor = 1.0; // half
  for (const w of weeks) {
    for (const s of w.sessions)
      assert.ok(
        Number.isInteger(s.minutes) && s.minutes > 0,
        `week ${w.week}: fractional/zero minutes (${s.minutes}) on ${s.title}`,
      );
    const sum = w.sessions.reduce((a, s) => a + s.minutes, 0);
    assert.strictEqual(
      w.totalMinutes,
      sum,
      `week ${w.week}: reported totalMinutes must equal the summed sessions`,
    );
    // Budget: 8h × 60 × volume factor, +8 min rounding tolerance across sessions
    const budgetMax = 8 * 60 * distFactor * 1.15 + 8 * w.sessions.length;
    assert.ok(
      sum <= budgetMax,
      `week ${w.week}: ${sum} min exceeds budget ${Math.round(budgetMax)} min`,
    );
  }
});
