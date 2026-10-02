import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { normalizeSteps } from "../../lib/canonical-session";
import { canonicalBlocks, endpointLabel, isDailyTraining, plannedSeconds, type DailyTraining } from "./training-contract";
import { fitDownloadUrl, shareOrDownloadFit } from "./fit-transfer";
import { DailyTrainingScreen } from "./DailyTrainingScreen";

function fixture(sport: "run" | "swim" | "strength" = "run"): DailyTraining {
  const sample = JSON.parse(readFileSync(new URL("./sample-session.json", import.meta.url), "utf8"));
  sample.schemaVersion = 2;
  Object.assign(sample.session, { sport, verdict: "ready", sourceRevision: "a".repeat(64), capability: { available: sport === "run", mode: sport === "run" ? "native" : "unavailable", reason: "Device unverified", deviceTested: false }, totalMinutes: 20, durationIsEstimate: true });
  sample.sessions = [{ id: sample.session.id, title: sample.session.title, sport, startTime: null }];
  sample.blocks = canonicalBlocks(normalizeSteps([
    { name: "Measured distance block", seconds: 60, phase: "active", zone: "z2", endpoint: { type: "distance", meters: 22.86 }, target: { type: "open" }, note: "Keep technique controlled" },
    { name: "Repetitions", seconds: 120, phase: "active", zone: "z2", reps: 5, note: "Five actual repetitions", target: { type: "open" } },
    { name: "Manual end", seconds: 0, phase: "recovery", zone: "z1", endpoint: { type: "lap" }, target: { type: "open" } },
    { name: "Timed recovery", seconds: 30, phase: "recovery", zone: "z1", target: { type: "open" } },
  ], sport));
  return sample;
}

test("v2 UI preserves distance/reps/lap without turning estimates into time endpoints", () => {
  const plan = fixture();
  assert.equal(isDailyTraining(plan), true);
  assert.equal(plannedSeconds(plan.blocks), 30);
  assert.equal(plan.blocks[0].segments[0].seconds, null);
  assert.equal(plan.blocks[0].segments[0].estimatedSeconds, 60);
  assert.deepEqual(plan.blocks.map(b => b.segments[0].endpoint?.type), ["distance", "reps", "lap", "time"]);
  assert.equal(plan.blocks[0].segments[0].target.type, "open");
});

test("endpoint display converts imperial swim yards and run miles without changing storage", () => {
  const endpoint = { type: "distance" as const, meters: 22.86 };
  assert.equal(endpointLabel(endpoint, false, "swim"), "25 yd");
  assert.equal(endpointLabel(endpoint, true, "swim"), "22.86 m");
  assert.equal(endpointLabel({ type: "distance", meters: 1609.344 }, false, "run"), "1 mi");
  assert.equal(endpoint.meters, 22.86);
});

test("v2 guard rejects invalid endpoints/targets/revisions and malformed nested payloads without throwing", () => {
  for (const bad of [null, {}, { blocks: [null] }, { ...fixture(), blocks: [null] }, { ...fixture(), sessions: [null] }]) {
    assert.doesNotThrow(() => isDailyTraining(bad)); assert.equal(isDailyTraining(bad), false);
  }
  const p = fixture();
  p.blocks[0].segments[0].endpoint = { type: "distance", meters: Infinity };
  assert.equal(isDailyTraining(p), false);
  const guessed = fixture(); guessed.blocks[0].segments[0].seconds = 60;
  assert.equal(isDailyTraining(guessed), false);
  const target = fixture(); Object.assign(target.blocks[0].segments[0].target, { type: "power", low: 300, high: 200 });
  assert.equal(isDailyTraining(target), false);
  const stale = fixture(); stale.session.sourceRevision = "";
  assert.equal(isDailyTraining(stale), false);
});

test("rest and held plans stay visible, with no FIT capability or resurrected blocks", () => {
  const plan = fixture(); plan.blocks = []; plan.session.verdict = "blocked"; plan.session.capability!.available = false;
  assert.equal(isDailyTraining(plan), true);
  plan.session.capability!.available = true;
  assert.equal(isDailyTraining(plan), false);
});

test("rendered sport-aware screen hides running tables and labels estimates/endpoints", () => {
  // JSX transform in the test runtime uses the classic React namespace.
  (globalThis as any).React = React;
  const plan = fixture("swim"); plan.profile.unitSystem = "imperial";
  const html = renderToStaticMarkup(React.createElement(DailyTrainingScreen, { plan, onFocusReady: async () => {}, onCompletion: async () => {} }));
  assert.match(html, /25 yd/); assert.match(html, /5 reps/); assert.match(html, /Until lap button/);
  assert.match(html, /ESTIMATED TIME/); assert.match(html, /Planning estimate only/);
  assert.doesNotMatch(html, /Half marathon|Your zones|Every minute|effort by time/);
  assert.match(html, /Download workout/); assert.match(html, /disabled/);
  assert.match(html, /Garmin\/NewFiles/); assert.match(html, /role="status"/);
});

test("FIT URL binds the selected session and exact revision", () => {
  const url = new URL(fitDownloadUrl("session B/?", "b".repeat(64)), "https://fixture.example");
  assert.equal(url.searchParams.get("sessionId"), "session B/?");
  assert.equal(url.searchParams.get("expectedRevision"), "b".repeat(64));
});

test("share success/cancel/no API/rejected share have truthful outcomes and one fallback", async () => {
  const file = {} as File;
  let downloads = 0, shares = 0;
  const download = () => { downloads++; };
  assert.equal(await shareOrDownloadFit(file, "x", { download }), "downloaded");
  assert.equal(downloads, 1);
  assert.equal(await shareOrDownloadFit(file, "x", { canShare: () => true, share: async () => { shares++; }, download }), "shared");
  assert.equal(shares, 1); assert.equal(downloads, 1);
  assert.equal(await shareOrDownloadFit(file, "x", { canShare: () => true, share: async () => { throw new DOMException("Cancelled", "AbortError"); }, download }), "cancelled");
  assert.equal(downloads, 1);
  assert.equal(await shareOrDownloadFit(file, "x", { canShare: () => true, share: async () => { throw new DOMException("No activation", "NotAllowedError"); }, download }), "downloaded");
  assert.equal(downloads, 2);
});
