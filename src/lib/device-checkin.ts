import { dateKey } from "./dates";
import { createHash } from "node:crypto";
import type { DailyInputContext } from "./daily-input-context";

const SOURCES = new Set(["whoop", "oura", "apple", "apple_health", "garmin", "garmin_direct", "coros"]);
export const DEVICE_REVIEW_VERSION = "device-checkin-v1";

/** Server-only proof from an owner-scoped database read, never a client readiness flag.
 * These readings replace a questionnaire, not symptoms or medical clearance. */
export function deviceCheckinEvidence(context: DailyInputContext | null | undefined, athleteId: string, now = new Date()) {
  if (!context || context.athleteId !== athleteId || context.dateLocal !== dateKey(now, context.timezone) || context.readStatus !== "available" || context.bounded.observationsTruncated || context.bounded.workoutsTruncated || context.activity.requiresReconciliation || context.activity.derivedActivityPolicy.status !== "allowed") return null;
  if ([context.metrics.hrvRmssd, context.metrics.hrvSdnn].some(m => m.status === "conflicting")) return null;
  const readings = [context.metrics.sleepHours, context.metrics.restingHr,
    context.metrics.hrvRmssd.status === "usable" ? context.metrics.hrvRmssd : context.metrics.hrvSdnn];
  const selected = readings.map(m => m.selected);
  if (readings.some(m => m.status !== "usable") || selected.some(r => !r || !SOURCES.has(r.source) || !["measured", "provider_reported"].includes(r.classification) || r.aiEligibility !== "allowed" || r.observedDay !== context.dateLocal || r.freshness !== "fresh" || Date.parse(r.observedAt) > now.getTime() || now.getTime() - Date.parse(r.observedAt) > 36 * 3600000)) return null;
  if (new Set(selected.map(r => r!.source)).size !== 1) return null;
  const revision = createHash("sha256").update(JSON.stringify({ version: DEVICE_REVIEW_VERSION, athleteId, timezone: context.timezone, date: context.dateLocal, readings: selected, activity: context.activity, completedWorkouts: context.completedWorkouts, executionFeedback: context.executionFeedback })).digest("hex");
  return { version: DEVICE_REVIEW_VERSION, revision, source: selected[0]!.source, dateLocal: context.dateLocal };
}

/** Revalidate saved consent against current measurements on reads and exports. */
export function verifiedDeviceReview(answers: any, context: DailyInputContext | null | undefined, athleteId: string, now = new Date()): boolean {
  const saved = answers?.inputMetadata?.deviceReview;
  const evidence = deviceCheckinEvidence(context, athleteId, now);
  const recorded = Date.parse(answers?.inputMetadata?.recordedAt);
  return !!evidence && saved?.version === DEVICE_REVIEW_VERSION && saved.athleteId === athleteId && saved.recoveryUnchanged === true && saved.revision === evidence.revision && saved.dateLocal === evidence.dateLocal && Number.isFinite(recorded) && recorded <= now.getTime() && now.getTime() - recorded < 24 * 3600000;
}

/** A short confirmation cannot erase previously reported limitations. */
export function deviceReviewRequiresManual(answers: any, adaptation?: any, availableMin?: number): boolean {
  if (!answers) return false;
  if (["sick", "newPain", "urgentSymptoms", "painAffectsMovement"].some(k => answers[k] === true)) return true;
  if (["sleep", "soreness", "motivation", "energy", "stress"].some(k => answers[k] != null && answers[k] !== "")) return true;
  if (adaptation && (adaptation.safetyStatus !== "clear" || adaptation.verdict !== "full" || adaptation.durationFactor !== 1)) return true;
  return typeof availableMin === "number" && typeof answers.availableMin === "number" && availableMin > answers.availableMin;
}
