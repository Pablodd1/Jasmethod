import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  INTERVALS_ALLOWED_UPSTREAM, STRAVA_AI_NOTICE, StravaRestrictedError, assertAiEligible, filterForAi,
  intervalsUpstreamFromNotes, isAiEligible, isStravaOrigin, provenanceOf,
} from "./strava-provenance";
import { personalCoachFacts, type ManualCoachActual } from "./coach-personal-context";

test("direct Strava rows are restricted by source, external id prefix or original source", () => {
  assert.equal(provenanceOf({ source: "strava" }), "strava");
  assert.equal(provenanceOf({ source: "Strava " }), "strava");
  assert.equal(provenanceOf({ source: "manual", externalId: "strava:123" }), "strava");
  assert.equal(provenanceOf({ source: "garmin", originalSource: "STRAVA" }), "strava");
});

test("a Strava activity relayed through Intervals.icu stays Strava, however the importer labelled it", () => {
  assert.equal(provenanceOf({ source: "intervals", externalId: "intervals:i1", notes: "Imported via Intervals.icu. Original source: STRAVA." }), "strava");
  assert.equal(provenanceOf({ source: "garmin", notes: "Original source: STRAVA." }), "strava");
});

test("Intervals rows are allowed only with a recorded, whitelisted upstream; otherwise unknown", () => {
  assert.equal(provenanceOf({ source: "intervals", notes: "Imported via Intervals.icu. Original source: COROS." }), "allowed");
  assert.equal(provenanceOf({ source: "intervals", notes: "Imported via Intervals.icu. Original source: GARMIN_CONNECT." }), "unknown", "Onward Garmin permission must be separately verified");
  assert.equal(provenanceOf({ source: "intervals", notes: "Imported via Intervals.icu." }), "unknown");
  assert.equal(provenanceOf({ source: "intervals", notes: "Original source: SOMETHING_NEW." }), "unknown");
  assert.equal(provenanceOf({ source: "intervals" }), "unknown");
});

test("unknown or missing provenance is restricted, never assumed safe", () => {
  assert.equal(provenanceOf({}), "unknown");
  assert.equal(provenanceOf({ source: null, externalId: null }), "unknown");
  assert.equal(provenanceOf({ source: "mystery-app" }), "unknown");
  assert.equal(isAiEligible({ source: "mystery-app" }), false);
});

test("verified JMM starter sources are allowed but never override an upstream Strava marker", () => {
  for (const source of ["starter", "starter-rest"]) {
    assert.equal(provenanceOf({ source }), "allowed");
    assert.equal(provenanceOf({ source, notes: "Original source: STRAVA" }), "strava");
    assert.equal(provenanceOf({ source, externalId: "strava:123" }), "strava");
    assert.equal(provenanceOf({ source, originalSource: "STRAVA" }), "strava");
  }
});

test("the athlete's own entries and file imports are eligible", () => {
  for (const source of ["manual", "garmin", "coros", "apple", "whoop", "fit", "tcx"]) assert.equal(provenanceOf({ source }), "allowed", source);
});

test("words that merely contain 'strava' fragments are not mistaken for it, and 'strava' alone is", () => {
  assert.equal(isStravaOrigin({ source: "stravaganza" }), false);
  assert.equal(isStravaOrigin({ source: "strava" }), true);
});

test("filterForAi keeps only known-allowed rows and counts what it dropped", () => {
  const rows = [{ id: 1, source: "manual" }, { id: 2, source: "strava" }, { id: 3, source: "intervals" }, { id: 4, source: "intervals", notes: "Original source: STRAVA." }, { id: 5, source: "garmin" }];
  const { kept, excluded } = filterForAi(rows);
  assert.deepEqual(kept.map(r => r.id), [1, 5]);
  assert.deepEqual(excluded, { strava: 2, unknown: 1 });
});

test("assertAiEligible fails closed for one record", () => {
  assert.doesNotThrow(() => assertAiEligible({ source: "manual" }));
  assert.throws(() => assertAiEligible({ source: "strava" }), (e: unknown) => e instanceof StravaRestrictedError && e.provenance === "strava");
  assert.throws(() => assertAiEligible({}), (e: unknown) => e instanceof StravaRestrictedError && e.provenance === "unknown");
});

test("the upstream whitelist is identical to the one used by the Intervals importer", () => {
  const text = readFileSync(new URL("./intervals-ingest.ts", import.meta.url), "utf8");
  const match = /const allowedSources = new Set\(\[([^\]]+)\]\)/.exec(text);
  assert.ok(match, "allowedSources declaration not found in intervals-ingest.ts");
  const importer = match[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean).sort();
  assert.deepEqual([...INTERVALS_ALLOWED_UPSTREAM].sort(), importer);
  assert.ok(!INTERVALS_ALLOWED_UPSTREAM.includes("STRAVA" as never));
});

test("the existing external-AI fact builder never emits a Strava-origin or relayed row", () => {
  const base = { planned: false, completed: true, matchedPlanId: null, actualDurationMin: 45, durationMin: 45, actualSport: "run", sport: "run", rpe: 5 } as const;
  const rows: ManualCoachActual[] = [
    { ...base, date: "2026-10-18", source: "manual", externalId: null },
    { ...base, date: "2026-10-17", source: "strava", externalId: "strava:1" },
    { ...base, date: "2026-10-16", source: "manual", externalId: "strava:2" },
    { ...base, date: "2026-10-15", source: "intervals", externalId: "intervals:3" },
  ];
  const facts = personalCoachFacts(null, false, rows, "2026-10-19");
  assert.deepEqual(facts.recentManualActuals.map(r => r.date), ["2026-10-18"]);
  assert.ok(facts.excluded.includes("strava_and_derived_values"));
});

test("intervalsUpstreamFromNotes reads the token the importer writes", () => {
  assert.equal(intervalsUpstreamFromNotes("Imported via Intervals.icu. Original source: garmin_connect. Device: x"), "GARMIN_CONNECT");
  assert.equal(intervalsUpstreamFromNotes(null), null);
});

test("the athlete notice claims only AI exclusion, in both languages", () => {
  for (const text of Object.values(STRAVA_AI_NOTICE)) assert.doesNotMatch(text, /analytics|análisis|never used|nunca/i);
  assert.match(STRAVA_AI_NOTICE.en, /AI features do not receive/);
  assert.match(STRAVA_AI_NOTICE.es, /IA de JMM no reciben/);
});
