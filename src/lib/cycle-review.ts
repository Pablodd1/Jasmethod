import { ANCHOR_MAX_AGE_DAYS, type AnchorTest } from "./anchor-evidence";
import type { TargetProfile } from "./canonical-session";
import { addDaysKey, dateKey } from "./dates";
import { validCycleDateKey } from "./cycle-events";
import type { Sport } from "./science";

/** Product review cadence only, not a validated physiological adaptation interval. */
export const CYCLE_REVIEW_INTERVAL_DAYS = 28;
export type CycleBaselineStatus = "current" | "review_due" | "expired" | "missing";
export interface CycleBaselineReview {
  sport: Sport;
  label: string;
  value: number | null;
  source: "measured_test" | "estimated_from_5k_test" | "swim_field_test_reference" | "unavailable";
  testId: string | null;
  observedAt: string | null;
  observedAtInstant: string | null;
  reviewDueAt: string | null;
  expiresAt: string | null;
  expiresAtInstant: string | null;
  status: CycleBaselineStatus;
  reviewIntervalDays: number;
  note: string;
}
export function requiredCycleSports(goal: string): Sport[] {
  if (goal === "cycle") return ["bike"];
  if (goal === "swim-only") return ["swim"];
  if (["run-only", "track-sprint", "5k", "10k", "half-marathon", "marathon"].includes(goal)) return ["run"];
  if (goal === "hyrox") return ["run", "hyrox", "strength"];
  if (goal === "strength") return ["strength"];
  if (goal === "boxing") return ["boxing"];
  if (["sprint", "olympic", "half", "full"].includes(goal)) return ["swim", "bike", "run"];
  return [];
}
/** Only completed, explicitly applied tests matching the current profile establish
 * an anchor. Observations/reviews never create or renew a measured anchor. */
export function buildCycleBaselineReviews(options: {
  profile: TargetProfile | null | undefined;
  tests: readonly AnchorTest[];
  appliedIds: readonly string[];
  sports: readonly Sport[];
  now?: Date;
  timezone?: string;
}): CycleBaselineReview[] {
  const now = options.now ?? new Date(), timezone = options.timezone ?? "UTC";
  const today = dateKey(now, timezone);
  const labels: Partial<Record<Sport, string>> = { bike: "Cycling power", run: "Running threshold pace", swim: "Swimming CSS reference" };
  return [...new Set(options.sports)].map(sport => {
    const type = sport === "bike" ? "ftp" : sport === "run" ? "run5k" : sport === "swim" ? "swim" : null;
    const value = sport === "bike" ? options.profile?.ftp : sport === "run" ? options.profile?.runPaceBase : sport === "swim" ? options.profile?.swimPaceBase : null;
    const tests = options.tests.filter(test => type && test.type === type && options.appliedIds.includes(test.id)
      && test.completed && !test.skipped && test.result != null && Number.isFinite(test.result) && test.result > 0
      && Number.isFinite(test.date.getTime()) && test.date.getTime() <= now.getTime()
      && value != null && Number.isFinite(value) && Math.abs((sport === "run" ? Math.round(test.result / 5 * 1.06) : test.result) - value) < .01)
      .sort((a, b) => b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id));
    const test = tests[0];
    const observedAt = test ? dateKey(test.date, timezone) : null;
    const expires = test ? new Date(test.date.getTime() + ANCHOR_MAX_AGE_DAYS * 86400000) : null;
    const reviewDueAt = observedAt ? addDaysKey(observedAt, CYCLE_REVIEW_INTERVAL_DAYS) : null;
    const status: CycleBaselineStatus = !test ? "missing" : now.getTime() > expires!.getTime() ? "expired" : today >= reviewDueAt! ? "review_due" : "current";
    return {
      sport, label: labels[sport] ?? `${sport}: familiar movement and technique review`,
      value: test ? value! : null,
      source: !test ? "unavailable" : sport === "bike" ? "measured_test" : sport === "run" ? "estimated_from_5k_test" : "swim_field_test_reference",
      testId: test?.id ?? null, observedAt, observedAtInstant: test?.date.toISOString() ?? null, reviewDueAt,
      expiresAt: expires ? dateKey(expires, timezone) : null, expiresAtInstant: expires?.toISOString() ?? null,
      status, reviewIntervalDays: CYCLE_REVIEW_INTERVAL_DAYS,
      note: "Heuristic 28-day review cadence; 90-day anchor validity is unchanged. Comfortable observations use an existing session's minutes and never measure, renew or increase an anchor. A scheduled review is not completed evidence. Daily symptoms and recovery still govern; loaded, maximal-speed or unfamiliar skill progression needs qualified review.",
    };
  });
}
export function cycleBaselineStatus(review: CycleBaselineReview, key: string): CycleBaselineStatus {
  if (!validCycleDateKey(key)) throw new Error("Invalid baseline review date");
  if (!review.testId || !review.observedAt || key < review.observedAt) return "missing";
  // The expiry calendar day is conservatively treated as due/expired for future
  // schedules; daily target resolution still enforces the original exact instant.
  if (review.status === "expired" || (review.expiresAt && key >= review.expiresAt)) return "expired";
  return review.reviewDueAt && key >= review.reviewDueAt ? "review_due" : "current";
}
export function comfortableObservationDescription(sport: Sport) {
  const guidance = sport === "swim" ? "familiar swimming with pauses as needed"
    : ["run", "bike"].includes(sport) ? "comfortable speech and familiar, non-maximal movement"
      : "familiar, controlled technique only; no added load, maximal speed, jumps, sparring or unfamiliar movements";
  return `Non-maximal baseline observation and review: stay at a comfortable, sustainable effort with ${guidance}. Use only this existing session's time budget; shorten or stop as needed. Record actual minutes, effort, symptoms and recovery afterward. This does not measure VO2max, threshold, FTP or race ability, and does not renew an expiring anchor. Stop for symptoms; review before progressing.`;
}
