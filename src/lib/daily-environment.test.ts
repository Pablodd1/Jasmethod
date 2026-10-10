import test from "node:test";
import assert from "node:assert/strict";
import { assessDailyEnvironment, DAILY_ENVIRONMENT_VERSION, dailyForecastSnapshot, dailyEnvironmentGuidance, dailyEnvironmentSummary, environmentRevisionContext, parseDailyEnvironmentInput, plannedEnvironmentInstant, readDailyEnvironmentRecord, type DailyEnvironmentRecord } from "./daily-environment";
import { canonicalSession } from "./canonical-session";
import { effectiveSessionFromRecords } from "./effective-prescription";
import { calendarDescription, gmailPlanHtml, telegramPlan } from "./plan-formats";

const now = new Date("2026-10-10T12:00:00Z");
const input = { setting: "outdoor", venueName: "PRIVATE_ACTUAL_VENUE", latitude: 25.7617, longitude: -80.1918, plannedLocal: "2026-10-10T09:00", timeZone: "America/New_York", venueConfirmed: true, requestForecast: true };
export function environmentFixture(patch: Partial<DailyEnvironmentRecord> = {}): DailyEnvironmentRecord {
  return { ...parseDailyEnvironmentInput(input), version: DAILY_ENVIRONMENT_VERSION, athleteId: "athlete", sessionId: "workout", observedOn: "2026-10-10", scheduleTime: "13:00", scheduleTimezone: "UTC", source: "athlete_reported", confirmedAt: "2026-10-10T11:55:00Z", plannedAt: "2026-10-10T13:00:00.000Z",
    forecast: { status: "fresh", requestedAt: "2026-10-10T13:00:00.000Z", fetchedAt: "2026-10-10T11:59:00Z", sourceUpdatedAt: "2026-10-10T11:00:00Z", coverageStart: "2026-10-10T12:00:00Z", coverageEnd: "2026-10-10T18:00:00Z", validAt: "2026-10-10T13:00:00Z", temperatureC: 30, humidityPct: 80, windMs: 4 }, ...patch };
}
const assess = (record: unknown = environmentFixture(), overrides: object = {}) => assessDailyEnvironment({ record, revision: "venue-1", athleteId: "athlete", sessionId: "workout", dateLocal: "2026-10-10", timezone: "UTC", startTime: "13:00", now, ...overrides });
test("explicit venue/time contract rejects inferred, forged, invalid and ambiguous inputs", () => {
  assert.equal(plannedEnvironmentInstant(parseDailyEnvironmentInput(input)), "2026-10-10T13:00:00.000Z");
  for (const change of [{ setting: false }, { venueConfirmed: "true" }, { venueName: "" }, { latitude: null }, { latitude: "25" }, { latitude: Infinity }, { plannedLocal: "2026-02-30T09:00" }, { timeZone: "Mars/City" }, { phoneLocation: { lat: 1 } }, { forecast: { temperatureC: 20 } }, { plannedLocal: null }, { timeZone: null }]) assert.throws(() => parseDailyEnvironmentInput({ ...input, ...change }), JSON.stringify(change));
  assert.throws(() => parseDailyEnvironmentInput({ ...input, plannedLocal: "2026-03-08T02:30" }), /does not exist/);
  assert.throws(() => parseDailyEnvironmentInput({ ...input, plannedLocal: "2026-11-01T01:30" }), /occurs twice/);
  assert.equal(plannedEnvironmentInstant({ plannedLocal: null, timeZone: "UTC" }), null);
  assert.equal(parseDailyEnvironmentInput({ ...input, setting: "unknown", venueName: null, venueConfirmed: false, requestForecast: false, latitude: null, longitude: null, plannedLocal: null, timeZone: null }).setting, "unknown");
});
test("forecast is tied to confirmed venue, session/athlete/date/time with explicit retrieval age and validity", () => {
  const value = assess(); assert.equal(value.status, "forecast"); assert.equal(value.forecastAgeMinutes, 1); assert.equal(value.validAt, "2026-10-10T13:00:00Z"); assert.deepEqual(value.conditions, { temperatureC: 30, humidityPct: 80, windMs: 4 });
  for (const overrides of [{ athleteId: "other" }, { sessionId: "other" }, { startTime: "14:00" }, { dateLocal: "2026-10-11" }, { timezone: "America/New_York" }, { now: new Date("2026-10-11T00:00Z") }]) assert.equal(assess(environmentFixture(), overrides).status, "unknown");
  for (const record of [null, "{", { version: "old" }, environmentFixture({ source: "gps" as any }), environmentFixture({ confirmedAt: "2026-10-10T13:00Z" }), environmentFixture({ venueConfirmed: false, requestForecast: false }), environmentFixture({ plannedLocal: null, plannedAt: null, requestForecast: false })]) assert.equal(assess(record).status, "unknown");
  assert.equal(readDailyEnvironmentRecord(environmentFixture(), "other", "workout"), null);
});
test("missing/stale/failed/out-of-window data never becomes zero or favorable conditions", () => {
  const record = environmentFixture();
  const cases = [ { status: "stale" }, { status: "provider_unavailable" }, { fetchedAt: null }, { fetchedAt: "2026-10-10T12:01:00Z" }, { fetchedAt: "2026-10-10T10:00:00Z" }, { validAt: "2026-10-10T10:59:59Z" }, { coverageEnd: "2026-10-10T12:59:59Z" }, { requestedAt: "2026-10-10T14:00:00Z" }, { temperatureC: null }, { humidityPct: null }, { windMs: null }, { temperatureC: "30" }, { humidityPct: -1 }, { windMs: Infinity } ];
  for (const forecast of cases) { const result = assess({ ...record, forecast: { ...record.forecast, ...forecast } }); assert.equal(result.status, "unknown", JSON.stringify(forecast)); assert.equal(result.conditions, null); }
  const zero = assess({ ...record, forecast: { ...record.forecast, temperatureC: 0, humidityPct: 0, windMs: 0 } }); assert.equal(zero.status, "forecast"); assert.equal(zero.conditions?.temperatureC, 0);
  assert.equal(assess(environmentFixture({ forecast: dailyForecastSnapshot() })).reason, "not_requested");
});
test("indoor remains unmeasured and never applies an outdoor forecast or legacy false flag", () => {
  const result = assess(environmentFixture({ setting: "indoor", requestForecast: false })); assert.equal(result.status, "indoor"); assert.equal(result.conditions, null); assert.equal(result.fetchedAt, null); assert.equal(result.validAt, null);
  assert.match(dailyEnvironmentGuidance(result), /unmeasured/); assert.match(dailyEnvironmentGuidance(result, "es"), /no están medidas/);
  assert.equal(assess({ indoor: false, temperature: 22, gps: { latitude: 25, longitude: -80 } }).status, "unknown");
});
function canonical(environment: ReturnType<typeof assess>, safety?: { status: "clear" | "hold" | "urgent" | "unknown"; reason: string }) {
  return canonicalSession({ athleteId: "athlete", workout: { id: "workout", userId: "athlete", title: "Easy", sport: "bike", durationMin: 1 }, prescription: { sport: "bike", durationMin: 1, steps: [{ name: "Easy", phase: "active", zone: "z2", seconds: 60 }] }, dateLocal: "2026-10-10", timezone: "UTC", profile: { ftp: 200 }, environment, safety });
}
test("canonical environment revision is stable while aging but invalidates changed evidence and stale state", () => {
  const fresh = assess(), later = assess(environmentFixture(), { now: new Date("2026-10-10T12:30Z") });
  assert.notEqual(fresh.forecastAgeMinutes, later.forecastAgeMinutes); assert.deepEqual(environmentRevisionContext(fresh), environmentRevisionContext(later)); assert.equal(canonical(fresh).revision, canonical(later).revision);
  const stale = assess(environmentFixture(), { now: new Date("2026-10-10T14:00Z") }); assert.equal(stale.status, "unknown"); assert.notEqual(canonical(fresh).revision, canonical(stale).revision);
  for (const context of [environmentFixture({ venueName: "Different venue" }), environmentFixture({ latitude: 26 }), environmentFixture({ setting: "indoor", requestForecast: false }), environmentFixture({ confirmedAt: "2026-10-10T11:56:00Z" })]) assert.notEqual(canonical(fresh).revision, canonical(assess(context)).revision);
  assert.deepEqual(canonical(fresh).steps, canonical(stale).steps); // no invented environmental watt/pace factor
  for (const status of ["hold", "urgent", "unknown"] as const) { const result = canonical(fresh, { status, reason: "Existing safety hold" }); assert.notEqual(result.verdict, "ready"); assert.deepEqual(result.steps, []); }
});
test("effective prescription carries same environmental evidence without clearing readiness holds", () => {
  const record = environmentFixture();
  const base = { userId: "athlete", timezone: "UTC", now, environment: { record, revision: "venue-1" }, workout: { id: "workout", userId: "athlete", date: new Date("2026-10-10"), startTime: "13:00", title: "Easy", sport: "bike", intensity: "z2", durationMin: 1, prescription: JSON.stringify({ sport: "bike", durationMin: 1, steps: [{ name: "Easy", phase: "active", zone: "z2", seconds: 60 }] }) }, profile: {}, planning: { ready: true, missing: [], review: [], ruleId: "fixture" }, checkin: { date: new Date("2026-10-10"), answers: JSON.stringify({ sleep: 5, soreness: 1, motivation: 5, energy: 5, stress: 1, sick: false, newPain: false, urgentSymptoms: false, availableMin: 60 }), adaptation: JSON.stringify({ verdict: "full", durationFactor: 1, intensityCap: "z7" }) } };
  const resolved = effectiveSessionFromRecords(base); assert.equal(resolved.canonical.environment?.status, "forecast"); assert.equal(resolved.canonical.verdict, "ready");
  const held = effectiveSessionFromRecords({ ...base, checkin: null }); assert.notEqual(held.canonical.verdict, "ready"); assert.deepEqual(held.canonical.steps, []); assert.equal(held.canonical.environment?.status, "forecast");
});
test("shared EN/ES summaries disclose forecast validity and keep private venue/coordinates out of channels", () => {
  const environment = assess();
  for (const language of ["en", "es"]) {
    const summary = dailyEnvironmentSummary(environment, language);
    assert.match(summary, /2026-10-10T11:59:00Z/); assert.match(summary, /2026-10-10T13:00:00Z/);
    assert.doesNotMatch(summary, /PRIVATE_ACTUAL_VENUE|25\.7617|-80\.1918|watt|WBGT|safe to train/);
    const s = { title: "Easy", sport: "bike", durationMin: 1, environment, language };
    for (const text of [calendarDescription(s), telegramPlan("Athlete", "Oct 10", [s]), gmailPlanHtml("Athlete", "Oct 10", [s]).html]) { assert.ok(text.includes(summary)); assert.doesNotMatch(text, /PRIVATE_ACTUAL_VENUE|25\.7617|-80\.1918/); }
  }
  for (const reason of ["missing", "provider_unavailable", "stale"] as const) assert.match(dailyEnvironmentGuidance({ ...environment, status: "unknown", conditions: null, reason }), /not assumed/);
});
