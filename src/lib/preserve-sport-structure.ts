import { canonicalSession } from "./canonical-session";
/** Check-in may hold an explicit prescription, but must never replace its sport facts with generated prose. */
export function preserveSportStructure<T extends { verdict: string; durationMin: number; intensity: string; steps: unknown[]; why?: string; detail: { main: string }; [key: string]: any }>(workout: Record<string, any>, generated: T): T & { sportStructure?: unknown; sportStructureBudgetMin?: number; structureReviewRequired?: string } {
  let prior: Record<string, any>;
  try { prior = JSON.parse(workout.prescription || "null"); } catch { return generated; }
  if (!prior || prior.sportStructure === undefined) return generated;
  const budget = prior.sportStructureBudgetMin ?? prior.durationMin;
  const next = { ...generated, sportStructure: prior.sportStructure, sportStructureBudgetMin: budget };
  if (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0 || budget > 1440) {
    const reason = "Explicit sport structure has no valid declared duration budget. Review it before training.";
    return { ...next, verdict: "rest", durationMin: 0, steps: [], structureReviewRequired: reason, why: reason, detail: { ...generated.detail, main: reason } };
  }
  const checked = canonicalSession({ athleteId: workout.userId, workout: { ...workout, durationMin: budget, dayOff: false, planDay: undefined }, prescription: { sport: workout.sport, title: workout.title, verdict: "planned", durationMin: budget, sportStructure: prior.sportStructure }, dateLocal: "1970-01-01", timezone: "UTC" });
  const cap = Number(generated.intensity.slice(1));
  const requiresReview = checked.verdict !== "ready" || generated.verdict === "rest" || generated.durationMin < budget || checked.steps.some(s => Number(s.zone.slice(1)) > cap);
  if (requiresReview) {
    const reason = checked.verdict !== "ready" ? checked.reason : "The current time/intensity decision cannot retain this explicit sport structure unchanged. Review its lengths, sets, stations or components before training; no generic replacement was invented.";
    return { ...next, verdict: "rest", durationMin: 0, steps: [], structureReviewRequired: reason, why: reason, detail: { ...generated.detail, main: reason } };
  }
  // Keep its declared budget and explicit source, even if a general generator proposed more.
  return { ...next, durationMin: budget, steps: [], why: "Explicit sport structure retained within the current check-in limits. Follow its actual endpoints; non-time durations remain estimates." };
}
/** Plan edits invalidate admission, but same-sport edits do not erase author-supplied source facts. */
export function holdStructuredPlanEdit(raw: string | null, sport: string, title: string): string | null {
  let prior: Record<string, any>;
  try { prior = JSON.parse(raw || "null"); } catch { return null; }
  if (!prior?.sportStructure || (prior.sport !== undefined && prior.sport !== sport)) return null;
  const structureSport = prior.sportStructure.kind === "pool" || prior.sportStructure.kind === "openWater" ? "swim" : prior.sportStructure.kind;
  if (structureSport !== sport) return null;
  return JSON.stringify({ ...prior, title, verdict: "rest", durationMin: 0, steps: [], sportStructureBudgetMin: prior.sportStructureBudgetMin ?? prior.durationMin, structureReviewRequired: "The plan changed. Complete check-in and review the retained explicit sport structure before training." });
}
