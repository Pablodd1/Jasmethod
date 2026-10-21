import test from "node:test";
import assert from "node:assert/strict";
import { normalizeStreams, type RawSample } from "./activity-streams";
import { analyseStreams, resample1Hz, rollingMean } from "./stream-analysis";

/** Synthetic activity: one sample per second, values from simple closed-form functions (answers checkable by hand). */
function streams(seconds: number, f: (t: number) => Partial<RawSample>, maxPoints = 100000) {
  const samples: RawSample[] = [];
  for (let t = 0; t < seconds; t++) samples.push({ t, ...f(t) });
  const s = normalizeStreams(samples, maxPoints);
  assert.ok(s);
  return s!;
}
const GARMIN = { source: "garmin" };
const near = (actual: number | null | undefined, expected: number, tolerance: number) => {
  assert.ok(typeof actual === "number", `expected a number, got ${actual}`);
  assert.ok(Math.abs((actual as number) - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);
};

test("constant 200 W for 1 h, FTP 250: NP=200, VI=1, IF=0.8, TSS=64 (hand-computed)", () => {
  const r = analyseStreams({ streams: streams(3600, () => ({ power: 200, hr: 140 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.power?.avgW, 200);
  near(r.power?.npW, 200, 0.5);
  near(r.power?.vi, 1, 0.005);
  near(r.power?.intensityFactor, 0.8, 0.002);
  near(r.power?.tss, 64, 0.3);
});

test("without an FTP the app does not guess one: NP is computed, IF and TSS stay null, and the note says why", () => {
  const r = analyseStreams({ streams: streams(3600, () => ({ power: 200 })), provenance: GARMIN });
  assert.ok(r.ok);
  if (!r.ok) return;
  near(r.power?.npW, 200, 0.5);
  assert.equal(r.power?.intensityFactor, null);
  assert.equal(r.power?.tss, null);
  assert.ok(r.notes.some(n => /no FTP/i.test(n)));
});

test("a 10-minute activity gets no NP/IF/TSS (needs 20 min) but still reports average power", () => {
  const r = analyseStreams({ streams: streams(600, () => ({ power: 220 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.power?.avgW, 220);
  assert.equal(r.power?.npW, null);
  assert.equal(r.power?.tss, null);
});

test("variable power: NP > average and VI > 1 (alternating 100/300 W has avg 200, NP above it)", () => {
  const r = analyseStreams({ streams: streams(3600, t => ({ power: Math.floor(t / 60) % 2 === 0 ? 100 : 300 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(r.ok);
  if (!r.ok) return;
  near(r.power?.avgW, 200, 1);
  assert.ok((r.power?.npW ?? 0) > 200 && (r.power?.npW ?? 0) < 300);
  assert.ok((r.power?.vi ?? 0) > 1);
});

test("a power-meter dropout is missing, not zero: average excludes it and 50% coverage disables power metrics", () => {
  const fewGaps = analyseStreams({ streams: streams(3600, t => ({ power: t % 20 === 0 ? undefined : 200 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(fewGaps.ok);
  if (fewGaps.ok) assert.equal(fewGaps.power?.avgW, 200); // would be 190 if dropouts were read as 0

  const half = analyseStreams({ streams: streams(3600, t => ({ power: t < 1800 ? 200 : undefined, hr: 140 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(half.ok);
  if (half.ok) {
    assert.equal(half.power, null);
    assert.ok(half.notes.some(n => /less than 80%/.test(n)));
  }
});

test("a long recording gap is never bridged by interpolation", () => {
  const t = [0, 1, 2, 3, 600, 601, 602];
  const v = [100, 100, 100, 100, 300, 300, 300];
  const grid = resample1Hz(t, v);
  assert.equal(grid[3], 100);
  assert.equal(grid[300], null);
  assert.equal(grid[600], 300);
});

test("rolling mean needs enough valid seconds in the window", () => {
  const series = [1, 1, 1, null, null, null, null, null, null, null];
  const out = rollingMean(series, 5, 0.8);
  assert.equal(out[4], null);
  assert.equal(out[2], null); // window not full yet
});

test("heart-rate zones use the athlete's own LTHR and the shared plan zone convention; no LTHR → no zones", () => {
  // LTHR 170: z1 ≤136, z2 ≤151.3, z3 ≤159.8 ...  100 s at 130 (z1), 100 s at 145 (z2), 100 s at 175 (z5: >170, ≤178.5)
  const s = streams(300, t => ({ hr: t < 100 ? 130 : t < 200 ? 145 : 175 }));
  const withLthr = analyseStreams({ streams: s, provenance: GARMIN, athlete: { lthr: 170 } });
  assert.ok(withLthr.ok);
  if (withLthr.ok) {
    assert.deepEqual(withLthr.hr?.secondsInZone, [100, 100, 0, 0, 100, 0, 0]);
    assert.equal(withLthr.hr?.maxBpm, 175);
  }
  const without = analyseStreams({ streams: s, provenance: GARMIN });
  assert.ok(without.ok);
  if (without.ok) {
    assert.equal(without.hr?.secondsInZone, null);
    assert.ok(without.notes.some(n => /lactate-threshold/i.test(n)));
  }
});

test("hard-effort detection finds a 5-minute block at 300 W (FTP 250) between 150 W blocks, with its start and average", () => {
  const r = analyseStreams({ streams: streams(1500, t => ({ power: t >= 600 && t < 900 ? 300 : 150, hr: t >= 600 && t < 900 ? 165 : 120 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.efforts.length, 1);
  const e = r.efforts[0];
  assert.equal(e.channel, "power");
  near(e.startS, 600, 3);
  near(e.durationS, 300, 6);
  near(e.avg, 300, 5);
  near(e.avgHrBpm, 165, 3);
  assert.equal(e.zone, 5); // 300/250 = 1.2 → upper bound of z5
});

test("efforts shorter than 60 s are not reported", () => {
  const r = analyseStreams({ streams: streams(1500, t => ({ power: t >= 600 && t < 640 ? 400 : 150 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.efforts.length, 0);
});

test("aerobic decoupling: constant 200 W with HR 140 → 147 between halves = 4.76% (1 − 140/147)", () => {
  const r = analyseStreams({ streams: streams(3600, t => ({ power: 200, hr: t < 1800 ? 140 : 147 })), provenance: GARMIN, athlete: { ftpW: 250 }, sport: "bike" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.decoupling?.basis, "power");
  near(r.decoupling?.percent, 4.76, 0.05);
});

test("decoupling is refused for short efforts, for intervals, and when HR coverage is thin", () => {
  const short = analyseStreams({ streams: streams(1800, () => ({ power: 200, hr: 140 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(short.ok);
  if (short.ok) { assert.equal(short.decoupling, null); assert.ok(short.notes.some(n => /at least 40 minutes/.test(n))); }

  const intervals = analyseStreams({ streams: streams(3600, t => ({ power: Math.floor(t / 120) % 2 ? 100 : 300, hr: 150 })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(intervals.ok);
  if (intervals.ok) { assert.equal(intervals.decoupling, null); assert.ok(intervals.notes.some(n => /not steady/.test(n))); }

  const noHr = analyseStreams({ streams: streams(3600, t => ({ power: 200, hr: t % 5 === 0 ? 140 : undefined })), provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(noHr.ok);
  if (noHr.ok) assert.equal(noHr.decoupling, null);
});

test("running decoupling uses speed when there is no power", () => {
  const r = analyseStreams({ streams: streams(3600, t => ({ speedMs: 3, hr: t < 1800 ? 150 : 156 })), provenance: GARMIN, sport: "run" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.decoupling?.basis, "speed");
  near(r.decoupling?.percent, 3.85, 0.05); // 1 − 150/156
});

test("Strava-origin and unknown-origin activities are refused before any number is computed", () => {
  const s = streams(3600, () => ({ power: 200, hr: 140 }));
  for (const provenance of [{ source: "strava" }, { source: "intervals", notes: "Original source: STRAVA." }, { source: "tcx", externalId: "strava:123" }]) {
    const r = analyseStreams({ streams: s, provenance, athlete: { ftpW: 250 } });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "strava_restricted");
  }
  for (const provenance of [{}, { source: "mystery" }, { source: "intervals" }]) {
    const r = analyseStreams({ streams: s, provenance, athlete: { ftpW: 250 } });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "unknown_provenance");
  }
});

test("no streams / too-short recordings are refused, never fabricated", () => {
  const none = analyseStreams({ streams: null, provenance: GARMIN });
  assert.equal(none.ok, false);
  if (!none.ok) assert.equal(none.reason, "no_streams");
  const short = analyseStreams({ streams: streams(60, () => ({ hr: 120 })), provenance: GARMIN });
  assert.equal(short.ok, false);
  if (!short.ok) assert.equal(short.reason, "too_short");
});

test("a decimated series is analysed and flagged as reduced", () => {
  const dense = streams(7200, () => ({ power: 200, hr: 140 }), 3600);
  assert.equal(dense.reduced, true);
  const r = analyseStreams({ streams: dense, provenance: GARMIN, athlete: { ftpW: 250 } });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.streamsReduced, true);
  near(r.power?.avgW, 200, 0.5);
  near(r.power?.intensityFactor, 0.8, 0.01);
  assert.ok(r.notes.some(n => /reduced/.test(n)));
});
