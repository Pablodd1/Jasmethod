import test from "node:test";
import assert from "node:assert/strict";
import { buildInput, buildMetadata, draftFromSnapshot, freshDraft, freshLeg, parseProfile } from "./race-scenario-draft";
import { calculateScenario, parseRaceScenarioInput } from "./race-scenario";
import { parseRaceScenarioMetadata } from "./race-scenario-metadata";
import type { RaceScenarioAnchor } from "./race-scenario-evidence";

const now = new Date("2026-10-08T12:00:00Z");
function draft() {
  const result = freshDraft();
  result.name = "Synthetic manual 5K";
  result.date = "2026-11-01";
  Object.assign(result.legs[0], { distanceKm: "5", courseMode: "flat", baselineValue: "300", observedAt: "2026-10-01", protocol: "5 km observed effort", context: "Synthetic fixture, not athlete data", target: "310", targetConfirmed: true });
  return result;
}

test("form serializes a dated manual reference without inventing event start time, HR or fuel", () => {
  const form = draft(), input = buildInput(form, []);
  assert.equal(parseRaceScenarioInput(input, now).ok, true);
  assert.equal(input.startAt, null);
  assert.equal(parseRaceScenarioMetadata(buildMetadata(form)).eventDate, "2026-11-01");
  const result = calculateScenario(input, now);
  assert.equal(result.durationSeconds, 1550);
  assert.equal(result.legs[0].hrTargetBpm, null);
  assert.equal(result.carbohydrateGrams, null);
});

test("course choice is explicit and manual profiles preserve uphill and downhill signs", () => {
  const empty = freshDraft(); empty.date = "2026-11-01";
  assert.throws(() => buildInput(empty, []), /choose a course/);
  const form = draft(); form.legs[0].courseMode = "manual"; form.legs[0].manualProfile = "0, 12\n1, 24\n2, 15";
  const leg = buildInput(form, []).legs[0];
  assert.ok(leg.segments[0].grade > 0); assert.ok(leg.segments[1].grade < 0);
  assert.ok(leg.distanceM > 2000);
  assert.equal(parseProfile("0, 2\n0, 4").points.length, 0);
  assert.equal(parseProfile("0, 2\n1,").points.length, 0);
  assert.equal(parseProfile("1, 2\n2, 4").points.length, 0);
});

test("saved copy retains exact mixed segment wind/caps and per-leg profile/provenance", () => {
  const form = draft(); form.legs[0].courseMode = "manual"; form.legs[0].manualProfile = "0, 12\n1, 24\n2, 15";
  const input = buildInput(form, []), metadata = buildMetadata(form);
  input.legs[0].segments[0].headwindMps = 2; input.legs[0].segments[1].headwindMps = -1;
  input.legs[0].segments[0].speedCapMps = 4;
  metadata.weatherEvidence = { provider: "Fixture", sourceUrl: "https://example.com", licenseUrl: "https://example.com/license", retrievedAt: null, validAt: null, kind: "historical_summary", attribution: "Synthetic provenance" };
  const restored = draftFromSnapshot({ input, metadata }), roundtrip = buildInput(restored, []);
  assert.deepEqual(roundtrip.legs[0].segments, input.legs[0].segments);
  assert.deepEqual(buildMetadata(restored).courses?.[0].profile, metadata.courses?.[0].profile);
  assert.equal(buildMetadata(restored).weatherEvidence?.attribution, "Synthetic provenance");
  assert.equal(restored.legs[0].targetConfirmed, false);
  assert.equal(restored.legs[0].intensityConfirmed, false);
  assert.equal(restored.coordinatesReviewed, false);
});

test("saved stale benchmark cannot silently become a manual observation", () => {
  const form = draft(); form.legs[0].anchorId = "missing";
  assert.throws(() => buildInput(form, []), /no longer available/);
  const anchor: RaceScenarioAnchor = { id: "missing", kind: "benchmark", sport: "run", metric: "pace", value: 300, unit: "sec/km", observedAt: "2026-10-01T12:00:00Z", context: "Fixture", source: "Fixture", usable: false, reason: "Review needed" };
  assert.throws(() => buildInput(form, [anchor]), /no longer available/);
  anchor.usable = true; anchor.reason = null;
  const input = buildInput(form, [anchor]);
  assert.equal(input.legs[0].baseline?.source, "benchmark");
  assert.equal(input.legs[0].baseline?.observedAt, anchor.observedAt);
});

test("date-only event remains metadata and partial event time fails instead of guessing", () => {
  const form = draft(); form.startTime = "07:30";
  assert.throws(() => buildInput(form, []), /UTC offset/);
  form.offset = "-04:00";
  assert.equal(buildInput(form, []).startAt, "2026-11-01T07:30:00-04:00");
});

test("unsafe official URLs fail before preview", () => {
  for (const url of ["javascript:alert(1)", "https://user:pass@example.com"]) {
    const form = draft(); form.officialUrl = url;
    assert.throws(() => buildInput(form, []), /ordinary HTTP/);
  }
});

test("triathlon retains independent leg course profiles and swimming has no road segments", () => {
  const form = draft(); form.eventType = "triathlon";
  const bike = freshLeg("bike"); Object.assign(bike, { distanceKm: "40", courseMode: "manual", manualProfile: "0, 20\n20, 100\n40, 20" });
  const swim = freshLeg("swim"); swim.distanceKm = "1.5";
  form.legs = [swim, bike, form.legs[0]];
  const metadata = parseRaceScenarioMetadata(buildMetadata(form));
  assert.equal(metadata.courses?.length, 2);
  assert.equal(metadata.courses?.[0].legId, "bike");
  assert.equal(metadata.courses?.[1].legId, "run");
  assert.deepEqual(buildInput(form, []).legs[0].segments, []);
});

test("loaded provider weather becomes explicit manual context and preserves attribution", () => {
  const form = draft(), input = buildInput(form, []), metadata = buildMetadata(form);
  input.weather = { kind: "forecast", source: "Synthetic MET sample", issuedAt: "2026-10-08T10:00:00Z", validFrom: "2026-10-08T10:00:00Z", validTo: "2026-10-10T10:00:00Z", temperatureC: 20, humidityPct: 50, windMps: 2 };
  metadata.weatherEvidence = { provider: "MET Norway", sourceUrl: "https://api.met.no/", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", retrievedAt: "2026-10-08T11:00:00Z", validAt: "2026-10-08T12:00:00Z", kind: "forecast", attribution: "Based on data from MET Norway" };
  const restored = draftFromSnapshot({ input, metadata });
  assert.equal(restored.weatherKind, "manual");
  assert.equal(restored.temperatureC, "20");
  assert.equal(buildMetadata(restored).weatherEvidence?.licenseUrl, metadata.weatherEvidence.licenseUrl);
});

test("saved time multiplier retains input precision instead of rounding the scenario",()=>{const form=draft(),input=buildInput(form,[]);input.legs[0].timeMultiplier=1.123456789;const restored=draftFromSnapshot({input,metadata:buildMetadata(form)});assert.equal(buildInput(restored,[]).legs[0].timeMultiplier,input.legs[0].timeMultiplier);});
