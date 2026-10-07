import test from "node:test";
import assert from "node:assert/strict";
import { Decoder, Stream } from "@garmin/fitsdk";
import {
  buildProtocol,
  TRAINING_PROTOCOLS,
  PROTOCOL_VERSION,
  type ProtocolId,
  type ProtocolSport,
} from "./protocols";
import { prescribeToday } from "./adaptive";
import { baseWorkout } from "./prescription";
import { buildFitWorkout, workoutToFitSpec } from "./fit-export";
import { reviewProtocolSchedule } from "./protocol-scheduling";
import { currentHrvReadiness } from "./coach-readiness";
import { fallbackBriefing } from "./coach";

const spec = (
  id: ProtocolId,
  sport: ProtocolSport = "bike",
  minutes = 60,
  level = "advanced",
) => ({ id, sport, minutes, level, version: PROTOCOL_VERSION });
const full = { verdict: "full", durationFactor: 1, intensityCap: "z7" };

test("each protocol preserves whole sets, recoveries and its time budget across supported sports", () => {
  for (const protocol of TRAINING_PROTOCOLS)
    for (const sport of protocol.sports)
      for (const minutes of [25, 30, 40, 50, 90]) {
        let p;
        try {
          p = buildProtocol(spec(protocol.id, sport, minutes));
        } catch (e) {
          assert.match((e as Error).message, /at least/);
          continue;
        }
        assert.ok(p.durationMin <= minutes);
        assert.equal(p.durationMin % 1, 0);
        assert.equal(
          p.steps.reduce((s, step) => s + step.seconds, 0),
          p.durationMin * 60,
        );
        assert.ok(
          p.steps.every((s) => s.seconds > 0 && s.target?.type === "open"),
        );
        if (protocol.id !== "aerobic-base")
          assert.equal(
            p.steps.filter((s) => s.phase === "active").length - 1,
            p.steps.filter((s) => s.phase === "recovery").length,
          );
      }
  assert.throws(
    () => buildProtocol(spec("anaerobic-capacity", "run")),
    /supported/,
  );
  assert.throws(
    () => buildProtocol(spec("anaerobic-capacity", "bike", 60, "beginner")),
    /aerobic base/,
  );
});

test("aerobic power is exactly 4 x 4 with three 3-minute recoveries when time permits", () => {
  const p = buildProtocol(spec("aerobic-power", "run", 40));
  assert.deepEqual(
    p.steps.filter((s) => s.phase === "active").map((s) => s.seconds),
    [240, 240, 240, 240],
  );
  assert.deepEqual(
    p.steps.filter((s) => s.phase === "recovery").map((s) => s.seconds),
    [180, 180, 180],
  );
  assert.equal(p.durationMin, 40);
  const reduced = buildProtocol(spec("aerobic-power", "run", 40), 34);
  assert.equal(reduced.steps.filter((s) => s.phase === "active").length, 3);
  assert.ok(
    reduced.steps
      .filter((s) => s.phase === "recovery")
      .every((s) => s.seconds === 180),
  );
});

test("readiness reductions retain the original protocol, pause power, and do not compound", () => {
  const protocol = spec("power", "strength", 40);
  const p = buildProtocol(protocol);
  const session = { ...p, protocol, durationMin: p.durationMin };
  const original = JSON.stringify(session);
  const trimmed = prescribeToday({
    session,
    adaptation: { verdict: "trim", durationFactor: 0.85, intensityCap: "z4" },
  });
  assert.equal(trimmed.protocol, undefined);
  assert.equal(trimmed.sport, "mobility");
  assert.equal(trimmed.intensity, "z1");
  assert.match(trimmed.title, /paused/);
  const restored = prescribeToday({
    session: baseWorkout({ originalPlan: original }),
    adaptation: full,
  });
  assert.deepEqual(restored.steps, p.steps);
  assert.equal(
    prescribeToday({
      session: { ...session, title: "My power practice" },
      adaptation: full,
    }).title,
    "My power practice",
  );
  const rest = prescribeToday({
    session,
    adaptation: { verdict: "rest", durationFactor: 0, intensityCap: "z1" },
  });
  assert.equal(rest.durationMin, 0);
  assert.deepEqual(rest.steps, []);
  const short = prescribeToday({
    session: { ...session, durationMin: 10 },
    adaptation: full,
  });
  assert.equal(short.protocol, undefined);
  assert.ok(short.durationMin <= 10);
});

test("undone check-in cannot resurrect a protocol for FIT and strength export is gated", () => {
  const p = buildProtocol(spec("hypertrophy", "strength", 60));
  const workout = { ...p, lthr: 170, ftp: 250, prescription: null, originalPlan: JSON.stringify(p) };
  assert.throws(() => buildFitWorkout(workoutToFitSpec(workout)), /check-in/);
  const resolved = workoutToFitSpec({ ...workout, prescription: JSON.stringify(p) });
  assert.equal(resolved.steps.filter(s => s.endpoint.type === "reps").length, 12);
  assert.ok(resolved.steps.every(s => s.target.type === "open"));
  assert.throws(() => buildFitWorkout(resolved), /exercise\/set/);
});

test("schedule review counts other sports, prevents adding intensity, and handles week boundaries", () => {
  const selected = {
    id: "selected",
    sport: "bike",
    type: "endurance",
    intensity: "z2",
    durationMin: 60,
    date: new Date("2026-09-12T04:00Z"),
  };
  const nearby = [8, 10].map((d) => ({
    ...selected,
    id: String(d),
    sport: "run",
    intensity: "z5",
    date: new Date(`2026-09-${d.toString().padStart(2, "0")}T04:00Z`),
  }));
  const opts = {
    selected,
    candidate: { ...selected, intensity: "z5" },
    nearby,
    timezone: "America/New_York",
    level: "advanced",
    protocolId: "aerobic-power" as const,
  };
  assert.ok(
    reviewProtocolSchedule(opts).blocks.some((s) =>
      s.includes("already contains 2"),
    ),
  );
  assert.equal(
    reviewProtocolSchedule({
      ...opts,
      selected: { ...selected, intensity: "z5" },
    }).blocks.length,
    0,
  );
  assert.equal(
    reviewProtocolSchedule({ ...opts, candidate: selected }).blocks.length,
    0,
  );
});

test("old or incomparable HRV cannot generate a current readiness verdict", () => {
  const now = new Date("2026-09-07T15:00Z");
  const metrics = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(`2026-09-0${i + 1}T04:00Z`),
    hrv: 55 + i,
    hrvType: "rmssd",
    source: "whoop",
  }));
  assert.ok(currentHrvReadiness(metrics, "America/New_York", now));
  assert.equal(
    currentHrvReadiness(metrics.slice(0, 6), "America/New_York", now),
    null,
  );
  assert.equal(
    currentHrvReadiness(
      metrics.map((m, i) => ({ ...m, hrvType: i === 6 ? "sdnn" : "rmssd" })),
      "America/New_York",
      now,
    ),
    null,
  );
  const c = {
    name: "Test",
    profile: {},
    zones: null,
    readiness: null,
    latestMetric: null,
    todaySession: null,
    planName: null,
    bloodFlags: [],
    dnaHighlights: [],
  };
  assert.equal(fallbackBriefing(c).headline, "CHECK PLAN");
  assert.equal(
    fallbackBriefing({
      ...c,
      profile: { injured: true },
      readiness: { score: 90, advice: "high" },
    }).headline,
    "RECOVERY REVIEW",
  );
});
