// Persisted, athlete-supplied nutrition evidence. This is not clinical approval.
// Freshness and exact-context matching below are conservative JMM review policy,
// not biological expiry dates or validated individualized nutrition thresholds.

export const NUTRITION_CONTEXT_VERSION = "nutrition-context-v1" as const;
export const NUTRITION_REVIEW_MAX_AGE_DAYS = 90;
export const NUTRITION_CONTEXT_MAX_BYTES = 16_384;
const DAY_MS = 86_400_000;
const SPORTS = ["run", "bike", "swim", "brick", "hyrox", "strength", "mobility", "recovery", "boxing"] as const;
const INTENSITIES = ["z1", "z2", "z3", "z4", "z5", "z6", "z7"] as const;
const GI_SYMPTOMS = ["none", "mild", "moderate", "severe"] as const;
type Sport = typeof SPORTS[number];
type Intensity = typeof INTENSITIES[number];
type GiSymptoms = typeof GI_SYMPTOMS[number];

export interface CarbohydratePracticeObservation {
  observedAt: string;
  sport: Sport;
  durationMin: number;
  intensity: Intensity;
  conditions: string;
  productMixture: string;
  toleratedGPerHour: number;
  targetGPerHour: number;
  giSymptoms: GiSymptoms;
  reviewedHighIntake: boolean;
}
export interface SweatMeasurementObservation {
  observedAt: string;
  sport: Sport;
  intensity: Intensity;
  context: string;
  sweatRateMlH: number;
  source: "measured";
}
export interface SessionTurnaround {
  sessionId: string;
  dateLocal: string;
  durationMin: number;
  intensity: Intensity;
  startTime: string | null;
  nextSessionInHours: number;
}
export interface NutritionContext {
  version: typeof NUTRITION_CONTEXT_VERSION;
  carbohydratePractice: CarbohydratePracticeObservation | null;
  sweatMeasurement: SweatMeasurementObservation | null;
  turnaround: SessionTurnaround | null;
}
export interface NutritionProfile {
  nutritionContext?: unknown;
  sweatRateMlH?: number | null;
  gutTrained?: boolean | null;
}
export interface NutritionSession {
  id: string;
  dateLocal: string;
  timezone: string;
  sport: string;
  durationMin: number;
  intensity: string;
  startTime?: string | null;
  // If current conditions are known, conflicting observations cannot certify
  // applicability. Missing conditions never become an invented match.
  conditions?: string | null;
  verdict?: "ready" | "rest" | "blocked";
}
export interface NutritionSessionContext {
  fueling: {
    gutTrained: boolean;
    carbohydratePractice?: Pick<CarbohydratePracticeObservation, "toleratedGPerHour" | "targetGPerHour" | "giSymptoms" | "reviewedHighIntake">;
    sweatMeasurement?: { observedAt: string; context: string; source: "measured" };
  };
  nextSessionInHours: number | null;
  status: "missing" | "invalid" | "current" | "review_required";
  reviewReasons: string[];
}

function fail(message: string): never { throw new Error(`Invalid nutrition context: ${message}`); }
function record(value: unknown, label: string, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some(key => !allowed.includes(key))) fail(`${label} contains an unsupported field`);
  return obj;
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(`${label} must contain 1–${max} characters`);
  return value.trim();
}
function number(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(`${label} must be a number from ${min} to ${max}`);
  return value;
}
function choice<T extends string>(value: unknown, label: string, choices: readonly T[]): T {
  if (typeof value !== "string" || !choices.includes(value as T)) fail(`${label} is unsupported`);
  return value as T;
}
function localDay(now: Date, timezone: string): string {
  if (!Number.isFinite(now.getTime())) fail("current date is invalid");
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { return fail("timezone is invalid"); }
}
function date(value: unknown, label: string, latest?: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(`${label} must be YYYY-MM-DD`);
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value || (latest && value > latest)) fail(`${label} is invalid or in the future`);
  return value;
}
function startTime(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) fail("turnaround startTime must be HH:mm or null");
  return value;
}

/** Strict write parser. Only explicit null means clear; omitted profile fields
 * should be omitted by the caller rather than passed here. */
export function parseNutritionContext(value: unknown, now = new Date(), timezone = "UTC"): NutritionContext | null {
  if (value === null) return null;
  if (typeof value === "string") {
    if (value.length > NUTRITION_CONTEXT_MAX_BYTES) fail("saved value is too large");
    try { value = JSON.parse(value); } catch { fail("saved value is not valid JSON"); }
    if (value === null) return null;
  }
  const v = record(value, "root", ["version", "carbohydratePractice", "sweatMeasurement", "turnaround"]);
  if (v.version !== NUTRITION_CONTEXT_VERSION) fail("unsupported version");
  const today = localDay(now, timezone);
  let carbohydratePractice: CarbohydratePracticeObservation | null = null;
  if (v.carbohydratePractice !== undefined && v.carbohydratePractice !== null) {
    const p = record(v.carbohydratePractice, "carbohydratePractice", ["observedAt", "sport", "durationMin", "intensity", "conditions", "productMixture", "toleratedGPerHour", "targetGPerHour", "giSymptoms", "reviewedHighIntake"]);
    if (p.reviewedHighIntake !== undefined && typeof p.reviewedHighIntake !== "boolean") fail("reviewedHighIntake must be boolean");
    carbohydratePractice = {
      observedAt: date(p.observedAt, "practice observation date", today),
      sport: choice(p.sport, "practice sport", SPORTS),
      durationMin: number(p.durationMin, "practice durationMin", 1, 1440),
      intensity: choice(p.intensity, "practice intensity", INTENSITIES),
      conditions: text(p.conditions, "practice conditions", 1000),
      productMixture: text(p.productMixture, "practice productMixture", 500),
      toleratedGPerHour: number(p.toleratedGPerHour, "toleratedGPerHour", 0, 120),
      targetGPerHour: number(p.targetGPerHour, "targetGPerHour", 0, 120),
      giSymptoms: choice(p.giSymptoms, "practice giSymptoms", GI_SYMPTOMS),
      reviewedHighIntake: p.reviewedHighIntake === true,
    };
  }
  let sweatMeasurement: SweatMeasurementObservation | null = null;
  if (v.sweatMeasurement !== undefined && v.sweatMeasurement !== null) {
    const m = record(v.sweatMeasurement, "sweatMeasurement", ["observedAt", "sport", "intensity", "context", "sweatRateMlH", "source"]);
    sweatMeasurement = {
      observedAt: date(m.observedAt, "sweat observation date", today),
      sport: choice(m.sport, "sweat sport", SPORTS),
      intensity: choice(m.intensity, "sweat intensity", INTENSITIES),
      context: text(m.context, "sweat context", 1000),
      sweatRateMlH: number(m.sweatRateMlH, "measured sweatRateMlH", 100, 3000),
      source: choice(m.source, "sweat source", ["measured"]),
    };
  }
  let turnaround: SessionTurnaround | null = null;
  if (v.turnaround !== undefined && v.turnaround !== null) {
    const t = record(v.turnaround, "turnaround", ["sessionId", "dateLocal", "durationMin", "intensity", "startTime", "nextSessionInHours"]);
    turnaround = {
      sessionId: text(t.sessionId, "turnaround sessionId", 200),
      // Future plans may be recorded, but only the matching current session can
      // consume them. This is a planned date, not a future observation.
      dateLocal: date(t.dateLocal, "turnaround dateLocal"),
      durationMin: number(t.durationMin, "turnaround durationMin", 1, 1440),
      intensity: choice(t.intensity, "turnaround intensity", INTENSITIES),
      startTime: startTime(t.startTime),
      nextSessionInHours: number(t.nextSessionInHours, "nextSessionInHours", 0, 168),
    };
  }
  return { version: NUTRITION_CONTEXT_VERSION, carbohydratePractice, sweatMeasurement, turnaround };
}

/** Fail closed on corrupt persisted data without turning the whole Today route
 * into a 500. Reasons describe the issue without echoing private free text. */
export function readNutritionContext(value: unknown, now = new Date(), timezone = "UTC"): { context: NutritionContext | null; status: "missing" | "valid" | "invalid"; issues: string[] } {
  if (value === undefined || value === null) return { context: null, status: "missing", issues: [] };
  try {
    const context = parseNutritionContext(value, now, timezone);
    return { context, status: context ? "valid" : "missing", issues: [] };
  } catch {
    return { context: null, status: "invalid", issues: ["Saved nutrition context is invalid. Review and save it again; advanced guidance is unavailable."] };
  }
}

/** One adapter for every canonical-session consumer. A legacy gutTrained
 * checkbox alone never enables higher intake or validates an observation. */
export function nutritionContextForSession(profile: NutritionProfile | null | undefined, session: NutritionSession, now = new Date()): NutritionSessionContext {
  const result: NutritionSessionContext = { fueling: { gutTrained: false }, nextSessionInHours: null, status: "missing", reviewReasons: [] };
  let today: string;
  try { today = localDay(now, session.timezone); } catch { return { ...result, status: "invalid", reviewReasons: ["Session timezone or current date is invalid; advanced nutrition context is unavailable."] }; }
  const state = readNutritionContext(profile?.nutritionContext, now, session.timezone);
  if (!state.context) return { ...result, status: state.status === "invalid" ? "invalid" : "missing", reviewReasons: state.issues.length ? state.issues : ["Dated nutrition practice and measurement context are not recorded; higher intake and short turnaround are not inferred."] };
  if (session.dateLocal !== today || (session.verdict !== undefined && session.verdict !== "ready")) return { ...result, status: "review_required", reviewReasons: ["Advanced nutrition context applies only to the matching current, ready session."] };
  if (typeof session.id !== "string" || !session.id.trim() || !SPORTS.includes(session.sport as Sport) || !INTENSITIES.includes(session.intensity as Intensity) || !Number.isFinite(session.durationMin) || session.durationMin <= 0 || session.durationMin > 1440) return { ...result, status: "invalid", reviewReasons: ["Session context is invalid; advanced nutrition guidance is unavailable."] };
  const fresh = (observedAt: string) => Date.parse(today) - Date.parse(observedAt) <= NUTRITION_REVIEW_MAX_AGE_DAYS * DAY_MS;
  const conditionsExplicitlyMatch = (observed: string) => typeof session.conditions === "string" && !!session.conditions.trim() && session.conditions.trim() === observed;
  const noKnownConditionsConflict = (observed: string) => !session.conditions?.trim() || conditionsExplicitlyMatch(observed);
  let needsReview = false;
  const p = state.context.carbohydratePractice;
  if (p) {
    if (fresh(p.observedAt) && p.sport === session.sport && p.intensity === session.intensity && p.durationMin === session.durationMin) {
      const matchedConditions = conditionsExplicitlyMatch(p.conditions);
      // Preserve restrictive tolerance/symptom evidence when current conditions
      // are unknown. Missing conditions cannot authorize intake above 60 g/h.
      const ceiling = matchedConditions ? 90 : 60;
      result.fueling.carbohydratePractice = { toleratedGPerHour: Math.min(p.toleratedGPerHour, ceiling), targetGPerHour: Math.min(p.targetGPerHour, ceiling), giSymptoms: p.giSymptoms, reviewedHighIntake: false };
      result.fueling.gutTrained = matchedConditions && p.giSymptoms === "none" && Math.min(p.toleratedGPerHour, p.targetGPerHour) > 60;
      if (!matchedConditions) {
        needsReview = true;
        result.reviewReasons.push("Current conditions are missing or do not explicitly match the practice observation. Guidance is capped at 60 g/h or the lower recorded tolerance/target; higher intake is unavailable.");
      }
      if (p.targetGPerHour > 90 || p.toleratedGPerHour > 90) {
        needsReview = true;
        result.reviewReasons.push("Intake above 90 g/h is unavailable in this workflow. The recorded reviewed-high-intake flag is self-reported and does not verify qualified individualized review.");
      }
    } else {
      result.reviewReasons.push(`Review carbohydrate practice: it must match sport, intensity and duration, have no known conditions conflict, and be within ${NUTRITION_REVIEW_MAX_AGE_DAYS} days under JMM review policy. This is an app review policy, not a biological threshold.`);
    }
  } else result.reviewReasons.push("Dated carbohydrate practice is missing; a gut-training checkbox does not establish a dose.");
  const m = state.context.sweatMeasurement;
  if (m) {
    if (fresh(m.observedAt) && m.sport === session.sport && m.intensity === session.intensity && m.sweatRateMlH === profile?.sweatRateMlH && noKnownConditionsConflict(m.context)) {
      result.fueling.sweatMeasurement = { observedAt: m.observedAt, context: m.context, source: "measured" };
      result.reviewReasons.push("Sweat measurement describes the supplied conditions; confirm they are representative. It does not establish a compulsory fluid-replacement volume.");
    } else result.reviewReasons.push(`Sweat rate remains reported: review measurement value, sport, intensity, conditions and the ${NUTRITION_REVIEW_MAX_AGE_DAYS}-day JMM review policy before treating it as measured in comparable conditions.`);
  }
  const t = state.context.turnaround;
  if (t) {
    if (t.sessionId === session.id && t.dateLocal === session.dateLocal && t.durationMin === session.durationMin && t.intensity === session.intensity && t.startTime === (session.startTime ?? null)) result.nextSessionInHours = t.nextSessionInHours;
    else result.reviewReasons.push("The saved turnaround belongs to a different session or timing. Review it after schedule or duration changes; a short recovery interval is not assumed.");
  }
  // A representative-conditions reminder alone does not invalidate matched
  // context; status reflects failed applicability checks rather than note count.
  const allPresentMatch = (!p || !!result.fueling.carbohydratePractice) && (!m || !!result.fueling.sweatMeasurement) && (!t || result.nextSessionInHours !== null);
  result.status = !p && !m && !t ? "missing" : allPresentMatch && !needsReview ? "current" : "review_required";
  return result;
}
