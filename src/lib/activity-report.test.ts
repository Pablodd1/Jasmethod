import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeActivityReport,
  computeStreak,
  fmtPace,
  findNotables,
  type ReportActivity,
} from "./activity-report";

const ACT: ReportActivity = {
  sport: "run",
  date: "2026-09-26T12:00:00Z",
  durationMin: 42,
  distanceKm: 9.66, // 6 mi at 6:20/km... actually 4:20/km ≈ 6:59/mi
  avgHr: 158,
  maxHr: 174,
  tss: 55,
  calories: 620,
  title: "Morning run",
};

const hist = (paceMinPerKm: number, daysAgo: number, hr = 150): any => ({
  date: new Date(Date.parse("2026-09-26T12:00:00Z") - daysAgo * 86400000),
  durationMin: paceMinPerKm * 8,
  distanceKm: 8,
  avgHr: hr,
  tss: 40,
});

test("fmtPace: metric and imperial formatting", () => {
  assert.equal(fmtPace(4.333, "metric"), "4:20/km");
  assert.equal(fmtPace(4.0, "imperial"), "6:26/mi");
});

test("streak: consecutive days including rest-day break logic", () => {
  const tz = "America/New_York";
  const dates = [
    "2026-09-26T12:00:00Z",
    "2026-09-25T12:00:00Z",
    "2026-09-24T12:00:00Z",
  ].map((d) => new Date(d));
  assert.equal(computeStreak(ACT.date, dates, tz), 3);
  // gap yesterday → streak 1 (today's own activity keeps it alive)
  assert.equal(
    computeStreak(
      ACT.date,
      [ACT.date, new Date("2026-09-24T12:00:00Z")],
      tz,
    ),
    1,
  );
});

test("fastest pace in 30 days: headline when every prior sample slower", () => {
  const same = [hist(5.5, 2), hist(5.3, 5), hist(5.8, 9), hist(5.4, 14), hist(5.6, 20)];
  const rep = computeActivityReport(
    ACT,
    same,
    { units: "metric" },
    9,
  );
  assert.ok(rep.headline.includes("Fastest run pace"), rep.headline);
  assert.ok(rep.headline.includes("9"), "streak day in headline");
  // body quantifies vs 30-day avg
  assert.ok(rep.body.includes("faster than your 30-day average"), rep.body);
});

test("slower-than-average run: honest, framed as easy day", () => {
  const same = [hist(3.8, 2), hist(3.9, 5), hist(3.7, 9), hist(3.8, 14), hist(3.9, 20)];
  const rep = computeActivityReport(ACT, same, { units: "metric" });
  assert.ok(!rep.headline.includes("Fastest"));
  assert.ok(rep.body.includes("slower than your 30-day average"), rep.body);
  assert.ok(rep.body.includes("easy/recovery"), rep.body);
});

test("adherence line when matched to planned session", () => {
  const rep = computeActivityReport(ACT, [], {
    units: "metric",
    planned: { title: "Z2 base run", durationMin: 35, intensity: "z2" },
  });
  assert.ok(rep.body.includes('Matched your planned session "Z2 base run"'), rep.body);
  assert.ok(rep.body.includes("longer than prescribed"), rep.body);
  const onTarget = computeActivityReport(ACT, [], {
    units: "metric",
    planned: { title: "Z2 base run", durationMin: 40 },
  });
  assert.ok(onTarget.body.includes("right on the prescribed duration"), onTarget.body);
});

test("recovery context with HRV vs baseline", () => {
  const rep = computeActivityReport(ACT, [], {
    units: "metric",
    recovery: { recoveryScore: 42, hrv: 48 },
    hrvBaseline: 59,
  });
  assert.ok(rep.body.includes("recovery of 42%"), rep.body);
  assert.ok(rep.body.includes("HRV 48 vs 59 baseline"), rep.body);
  assert.ok(rep.body.includes("keeping this controlled"), rep.body);
});

test("sparse history: no fake comparisons, welcoming headline", () => {
  const rep = computeActivityReport(ACT, [], { units: "metric" });
  assert.ok(rep.headline.includes("logged"), rep.headline);
  assert.ok(!rep.body.includes("30-day average"), rep.body);
});

test("longest detection", () => {
  const same = [hist(5.5, 2), hist(5.4, 5), hist(5.6, 9), hist(5.5, 14), hist(5.4, 20)];
  const long = { ...ACT, distanceKm: 15, durationMin: 90 };
  const n = findNotables(long, same);
  assert.ok(n.longest, "longest in 30d flagged");
  const rep = computeActivityReport(long, same, { units: "metric" });
  assert.ok(rep.headline.includes("Longest run in 30 days"), rep.headline);
});

test("imperial units render miles in headline/body", () => {
  const rep = computeActivityReport(ACT, [], { units: "imperial" });
  assert.ok(rep.body.includes("mi in"), rep.body);
});
