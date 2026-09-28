import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedSeconds, isDailyTraining } from "./training-contract";
import type { Block, DailyTraining } from "./training-contract";
import { readFileSync } from "node:fs";

// The kit's own sample must validate against its runtime guard.
test("sample-session.json satisfies isDailyTraining guard", () => {
  const sample = JSON.parse(
    readFileSync(new URL("./sample-session.json", import.meta.url), "utf8"),
  );
  assert.equal(isDailyTraining(sample), true);
});

test("plannedSeconds: 15+5+5×(4+2)+10 = 60 minutes (kit acceptance)", () => {
  const blocks: Block[] = [
    { id: "a", title: "Warm up", repeat: 1, segments: [{ id: "a1", seconds: 900, kind: "prep", title: "w", instruction: "i", target: { label: "Z1", paceLowSecondsPerMile: null, paceHighSecondsPerMile: null, rpeLow: 2, rpeHigh: null, heartRateBpm: null } }] },
    { id: "b", title: "Build", repeat: 1, segments: [{ id: "b1", seconds: 300, kind: "prep", title: "b", instruction: "i", target: { label: "Z2", paceLowSecondsPerMile: null, paceHighSecondsPerMile: null, rpeLow: 3, rpeHigh: null, heartRateBpm: null } }] },
    { id: "c", title: "Main", repeat: 5, segments: [
      { id: "c1", seconds: 240, kind: "work", title: "on", instruction: "i", target: { label: "Z4", paceLowSecondsPerMile: null, paceHighSecondsPerMile: null, rpeLow: 7, rpeHigh: null, heartRateBpm: null } },
      { id: "c2", seconds: 120, kind: "recover", title: "off", instruction: "i", target: { label: "Z1", paceLowSecondsPerMile: null, paceHighSecondsPerMile: null, rpeLow: 2, rpeHigh: null, heartRateBpm: null } },
    ] },
    { id: "d", title: "Cool down", repeat: 1, segments: [{ id: "d1", seconds: 600, kind: "cool", title: "c", instruction: "i", target: { label: "Z1", paceLowSecondsPerMile: null, paceHighSecondsPerMile: null, rpeLow: 2, rpeHigh: null, heartRateBpm: null } }] },
  ];
  assert.equal(plannedSeconds(blocks), 3600);
});

test("guard rejects fabricated/malformed payloads (no silent guessing)", () => {
  assert.equal(isDailyTraining(null), false);
  assert.equal(isDailyTraining({ schemaVersion: 2 }), false);
  const sample = JSON.parse(
    readFileSync(new URL("./sample-session.json", import.meta.url), "utf8"),
  );
  const badDensity = { ...sample, session: { ...sample.session, density: { ...sample.session.density, score: 12 } } };
  assert.equal(isDailyTraining(badDensity), false);
  const noGuidance = { ...sample, guidance: { ...sample.guidance, focus: { title: "x" } } };
  assert.equal(isDailyTraining(noGuidance), false);
});

test("pace guard: missing paces stay null — the screen shows —, never a guess", () => {
  const sample = JSON.parse(
    readFileSync(new URL("./sample-session.json", import.meta.url), "utf8"),
  ) as DailyTraining;
  sample.profile.paces.mile = { secondsPerMile: null, measuredAt: null, status: "missing", missingReason: "Add a benchmark" };
  assert.equal(isDailyTraining(sample), true);
  assert.equal(sample.profile.paces.mile.secondsPerMile, null);
});
