import test from "node:test";
import assert from "node:assert/strict";
import { NUTRITION_CONTEXT_VERSION, NUTRITION_REVIEW_MAX_AGE_DAYS, NUTRITION_CONTEXT_MAX_BYTES, parseNutritionContext, readNutritionContext, nutritionContextForSession, type NutritionContext, type NutritionSession } from "./nutrition-context";

const now = new Date("2026-10-07T12:00:00.000Z");
function context(): NutritionContext {
  return {
    version: NUTRITION_CONTEXT_VERSION,
    carbohydratePractice: { observedAt: "2026-10-01", sport: "bike", durationMin: 180, intensity: "z4", conditions: "Cool indoor trainer", productMixture: "Glucose and fructose drink; all carbohydrate counted", toleratedGPerHour: 100, targetGPerHour: 100, giSymptoms: "none", reviewedHighIntake: true },
    sweatMeasurement: { observedAt: "2026-10-01", sport: "bike", intensity: "z4", context: "Cool indoor trainer", sweatRateMlH: 800, source: "measured" },
    turnaround: { sessionId: "workout-a", dateLocal: "2026-10-07", durationMin: 180, intensity: "z4", startTime: "07:00", nextSessionInHours: 3 },
  };
}
const session: NutritionSession = { id: "workout-a", dateLocal: "2026-10-07", timezone: "UTC", sport: "bike", intensity: "z4", durationMin: 180, startTime: "07:00", conditions: "Cool indoor trainer", verdict: "ready" };
const resolve = (c: unknown = context(), s: NutritionSession = session, scalarSweat = 800) => nutritionContextForSession({ nutritionContext: c, sweatRateMlH: scalarSweat, gutTrained: true }, s, now);

test("nutrition context parses objects and serialized values deterministically", () => {
  const c = context();
  assert.deepEqual(parseNutritionContext(c, now), c);
  assert.deepEqual(parseNutritionContext(JSON.stringify(c), now), c);
  assert.equal(parseNutritionContext(null, now), null);
  assert.equal(parseNutritionContext("null", now), null);
  assert.deepEqual(parseNutritionContext({ version: NUTRITION_CONTEXT_VERSION }, now), { version: NUTRITION_CONTEXT_VERSION, carbohydratePractice: null, sweatMeasurement: null, turnaround: null });
  const spaced = context(); spaced.carbohydratePractice!.conditions = "  Cool indoor trainer  ";
  assert.equal(parseNutritionContext(spaced, now)?.carbohydratePractice?.conditions, "Cool indoor trainer");
});

test("strict root validation rejects coercions, unsupported versions and fields", () => {
  for (const v of [undefined, "", "{", [], true, 1, { version: "future-version" }, { ...context(), unexpected: 1 }, " ".repeat(NUTRITION_CONTEXT_MAX_BYTES + 1)]) assert.throws(() => parseNutritionContext(v, now), /Invalid nutrition context/);
  assert.throws(() => parseNutritionContext({ ...context(), carbohydratePractice: [] }, now));
  assert.throws(() => parseNutritionContext({ ...context(), carbohydratePractice: { ...context().carbohydratePractice, medicalApproval: true } }, now));
});

test("practice requires a real date, sport, duration, intensity, conditions, mixture and symptoms", () => {
  const invalid: [string, unknown][] = [
    ["observedAt", "2026-02-30"], ["observedAt", "2026-10-08"], ["observedAt", "2026-10-01T00:00:00Z"],
    ["sport", "cycling"], ["intensity", "race"], ["durationMin", 0], ["durationMin", 1441], ["durationMin", "180"],
    ["conditions", " "], ["conditions", "x".repeat(1001)], ["productMixture", ""], ["productMixture", "x".repeat(501)],
    ["giSymptoms", "unknown"], ["reviewedHighIntake", "true"], ["reviewedHighIntake", 1],
    ["targetGPerHour", -1], ["targetGPerHour", 121], ["targetGPerHour", Infinity], ["targetGPerHour", "90"],
    ["toleratedGPerHour", NaN], ["toleratedGPerHour", null],
  ];
  for (const [field, value] of invalid) {
    const c: any = context(); c.carbohydratePractice[field] = value;
    assert.throws(() => parseNutritionContext(c, now), /Invalid nutrition context/, field);
  }
  const c: any = context(); delete c.carbohydratePractice.reviewedHighIntake;
  assert.equal(parseNutritionContext(c, now)?.carbohydratePractice?.reviewedHighIntake, false);
  c.carbohydratePractice.targetGPerHour = 0; c.carbohydratePractice.toleratedGPerHour = 0;
  assert.equal(parseNutritionContext(c, now)?.carbohydratePractice?.targetGPerHour, 0);
});

test("sweat measurement validates the value to which provenance belongs", () => {
  for (const [key, value] of [["source", "estimated"], ["context", ""], ["sweatRateMlH", 99], ["sweatRateMlH", 3001], ["sweatRateMlH", "800"], ["sport", "unknown"], ["observedAt", "2026-10-08"]]) {
    const c: any = context(); c.sweatMeasurement[key] = value;
    assert.throws(() => parseNutritionContext(c, now));
  }
});

test("turnaround validates session identity, calendar date and timing without a universal flag", () => {
  for (const [key, value] of [["sessionId", ""], ["dateLocal", "2026-02-30"], ["durationMin", 0], ["intensity", "hard"], ["startTime", "24:00"], ["startTime", "07:60"], ["startTime", undefined], ["nextSessionInHours", -1], ["nextSessionInHours", 169], ["nextSessionInHours", Infinity], ["nextSessionInHours", "3"]] as [string, unknown][]) {
    const c: any = context(); c.turnaround[key] = value;
    assert.throws(() => parseNutritionContext(c, now));
  }
  const c = context(); c.turnaround!.dateLocal = "2026-10-08"; c.turnaround!.startTime = null;
  assert.equal(parseNutritionContext(c, now)?.turnaround?.dateLocal, "2026-10-08", "a future plan is not a future observation");
  assert.throws(() => parseNutritionContext({ ...context(), nextSessionInHours: 3 }, now));
});

test("safe reads distinguish missing and corrupt values without exposing private text", () => {
  assert.equal(readNutritionContext(undefined, now).status, "missing");
  assert.equal(readNutritionContext(null, now).status, "missing");
  assert.equal(readNutritionContext(context(), now).status, "valid");
  const result = readNutritionContext("PRIVATE HEALTH NOTES malformed JSON", now);
  assert.equal(result.status, "invalid"); assert.equal(result.context, null);
  assert.doesNotMatch(result.issues.join(" "), /PRIVATE HEALTH/);
});

test("matching current context maps exactly to existing engine inputs", () => {
  const r = resolve();
  assert.equal(r.status, "review_required"); assert.equal(r.fueling.gutTrained, true);
  assert.deepEqual(r.fueling.carbohydratePractice, { toleratedGPerHour: 90, targetGPerHour: 90, giSymptoms: "none", reviewedHighIntake: false });
  assert.deepEqual(r.fueling.sweatMeasurement, { observedAt: "2026-10-01", context: "Cool indoor trainer", source: "measured" });
  assert.equal(r.nextSessionInHours, 3);
  assert.ok(!("productMixture" in r.fueling.carbohydratePractice!));
});

test("legacy gut checkbox or missing/corrupt context never authorizes higher intake", () => {
  for (const c of [undefined, null, "{", { ...context(), version: "future-version" }]) {
    const r = resolve(c === undefined ? null : c);
    assert.equal(r.fueling.gutTrained, false); assert.equal(r.fueling.carbohydratePractice, undefined);
    assert.equal(r.fueling.sweatMeasurement, undefined); assert.equal(r.nextSessionInHours, null);
  }
  assert.equal(nutritionContextForSession({ gutTrained: true }, session, now).fueling.gutTrained, false);
});

test("higher-intake eligibility requires exact sport, duration and intensity", () => {
  for (const patch of [{ sport: "run" }, { durationMin: 179 }, { durationMin: 181 }, { intensity: "z3" }]) {
    const r = resolve(context(), { ...session, ...patch });
    assert.equal(r.fueling.gutTrained, false); assert.equal(r.fueling.carbohydratePractice, undefined);
    assert.equal(r.status, "review_required");
  }
  assert.ok(resolve(context(), { ...session, conditions: "Cool indoor trainer" }).fueling.carbohydratePractice);
});

test("GI symptoms and absent reviewed intent remain engine restrictions", () => {
  const c = context(); c.carbohydratePractice!.giSymptoms = "moderate"; c.carbohydratePractice!.reviewedHighIntake = false;
  const r = resolve(c);
  assert.equal(r.fueling.gutTrained, false); assert.equal(r.fueling.carbohydratePractice?.giSymptoms, "moderate");
  assert.equal(r.fueling.carbohydratePractice?.reviewedHighIntake, false);
});

test("missing or conflicting current conditions cap intake while preserving lower tolerance and symptoms", () => {
  for (const conditions of [undefined, null, "", "Hot outdoor race"]) {
    const r = resolve(context(), { ...session, conditions });
    assert.equal(r.fueling.gutTrained, false);
    assert.deepEqual(r.fueling.carbohydratePractice, { toleratedGPerHour: 60, targetGPerHour: 60, giSymptoms: "none", reviewedHighIntake: false });
    assert.equal(r.status, "review_required");
    assert.match(r.reviewReasons.join(" "), /conditions are missing or do not explicitly match/);
    const c = context(); c.carbohydratePractice!.toleratedGPerHour = 30; c.carbohydratePractice!.targetGPerHour = 20; c.carbohydratePractice!.giSymptoms = "severe";
    const lower = resolve(c, { ...session, conditions });
    assert.deepEqual(lower.fueling.carbohydratePractice, { toleratedGPerHour: 30, targetGPerHour: 20, giSymptoms: "severe", reviewedHighIntake: false });
  }
});

test("self-reported high-intake review is retained but never forwarded as qualified review", () => {
  const c = context();
  assert.equal(parseNutritionContext(c, now)?.carbohydratePractice?.reviewedHighIntake, true);
  const r = resolve(c);
  assert.equal(r.fueling.carbohydratePractice?.reviewedHighIntake, false);
  assert.equal(r.fueling.carbohydratePractice?.targetGPerHour, 90);
  assert.equal(r.fueling.carbohydratePractice?.toleratedGPerHour, 90);
  assert.match(r.reviewReasons.join(" "), /does not verify qualified individualized review/);
  c.carbohydratePractice!.targetGPerHour = 80; c.carbohydratePractice!.toleratedGPerHour = 80;
  assert.equal(resolve(c).status, "current");
  assert.equal(resolve(c).fueling.carbohydratePractice?.targetGPerHour, 80);
});

test("90-day freshness is explicit app review policy with a calendar-day boundary", () => {
  assert.equal(NUTRITION_REVIEW_MAX_AGE_DAYS, 90);
  const c = context(); c.carbohydratePractice!.observedAt = "2026-07-09"; c.sweatMeasurement!.observedAt = "2026-07-09";
  assert.ok(resolve(c).fueling.carbohydratePractice); assert.ok(resolve(c).fueling.sweatMeasurement);
  c.carbohydratePractice!.observedAt = "2026-07-08"; c.sweatMeasurement!.observedAt = "2026-07-08";
  const r = resolve(c);
  assert.equal(r.fueling.gutTrained, false); assert.equal(r.fueling.carbohydratePractice, undefined); assert.equal(r.fueling.sweatMeasurement, undefined);
  assert.match(r.reviewReasons.join(" "), /app review policy, not a biological threshold/);
  assert.equal(r.nextSessionInHours, 3, "stale observation does not erase independently matched turnaround");
});

test("changing the numeric profile sweat value invalidates its measurement provenance", () => {
  assert.equal(resolve(context(), session, 900).fueling.sweatMeasurement, undefined);
  assert.equal(nutritionContextForSession({ nutritionContext: context() }, session, now).fueling.sweatMeasurement, undefined);
  assert.equal(resolve(context(), { ...session, sport: "run" }).fueling.sweatMeasurement, undefined);
  assert.equal(resolve(context(), { ...session, intensity: "z3" }).fueling.sweatMeasurement, undefined);
});

test("turnaround cannot survive another session, date, changed duration, intensity or start", () => {
  for (const patch of [{ id: "workout-b" }, { dateLocal: "2026-10-08" }, { durationMin: 120 }, { intensity: "z3" }, { startTime: "08:00" }, { startTime: null }]) assert.equal(resolve(context(), { ...session, ...patch }).nextSessionInHours, null);
  for (const interval of [0, 3, 4, 168]) {
    const c = context(); c.turnaround!.nextSessionInHours = interval;
    assert.equal(resolve(c).nextSessionInHours, interval, "engine owns the <4-hour decision; adapter preserves zero");
  }
  const c = context(); c.turnaround!.startTime = null;
  assert.equal(resolve(c, { ...session, startTime: null }).nextSessionInHours, 3);
});

test("blocked, rest, past and future sessions cannot activate advanced guidance", () => {
  for (const patch of [{ verdict: "blocked" as const }, { verdict: "rest" as const }, { dateLocal: "2026-10-06" }, { dateLocal: "2026-10-08" }]) {
    const r = resolve(context(), { ...session, ...patch });
    assert.equal(r.fueling.gutTrained, false); assert.equal(r.fueling.carbohydratePractice, undefined);
    assert.equal(r.fueling.sweatMeasurement, undefined); assert.equal(r.nextSessionInHours, null);
  }
});

test("observation dates use athlete-local day and invalid timezone fails safely", () => {
  const c = context(); c.carbohydratePractice!.observedAt = "2026-10-07";
  assert.throws(() => parseNutritionContext(c, new Date("2026-10-07T01:00:00Z"), "America/Los_Angeles"), /future/);
  assert.doesNotThrow(() => parseNutritionContext(c, new Date("2026-10-07T01:00:00Z"), "Asia/Tokyo"));
  const r = resolve(context(), { ...session, timezone: "Not/A_Timezone" });
  assert.equal(r.status, "invalid"); assert.equal(r.fueling.gutTrained, false);
});

test("parser and adapter do not mutate observations or fabricate measurement context", () => {
  const c = context(); const before = JSON.stringify(c);
  resolve(c); parseNutritionContext(c, now);
  assert.equal(JSON.stringify(c), before);
  c.carbohydratePractice = null; c.sweatMeasurement = null; c.turnaround = null;
  const r = resolve(c);
  assert.equal(r.fueling.gutTrained, false); assert.equal(r.fueling.sweatMeasurement, undefined); assert.equal(r.nextSessionInHours, null);
});
