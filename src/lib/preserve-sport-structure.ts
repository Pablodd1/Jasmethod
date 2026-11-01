import { canonicalSession } from "./canonical-session";
import { buildCoachingPrescription, validCoachingMetadata } from "./coaching-prescription";

/** A recipe marker alone is not permission to replace explicit author facts.
 * Both source identity and saved structure must reproduce the deterministic
 * coaching recipe exactly before its bounded regeneration can be admitted. */
function reproducibleCoachingStructure(workout:Record<string,any>,prior:Record<string,any>,generated:Record<string,any>):boolean {
  let source:Record<string,any>;
  try { source=JSON.parse(workout.originalPlan || 'null'); } catch { return false; }
  if(!source || source.cycleVersion!=='bounded-cycle-v1' || source.sport!==workout.sport
    || !['strength','hyrox','brick'].includes(source.sport) || !validCoachingMetadata(source.coaching,source.sport)
    || !Number.isInteger(source.durationMin) || source.durationMin<=0 || source.durationMin>1440
    || !/^z[1-7]$/.test(source.intensity) || prior.structureReviewRequired!==undefined
    || !['planned','full','easy','trim'].includes(prior.verdict) || prior.sport!==source.sport
    || !Number.isInteger(prior.durationMin) || prior.durationMin<=0 || prior.durationMin>source.durationMin
    || !/^z[1-7]$/.test(prior.intensity) || Number(prior.intensity.slice(1))>Number(source.intensity.slice(1))
    || (prior.sportStructureBudgetMin!==undefined && prior.sportStructureBudgetMin!==prior.durationMin)
    || JSON.stringify(prior.coaching)!==JSON.stringify(source.coaching)
    || JSON.stringify(generated.coaching)!==JSON.stringify(source.coaching)) return false;
  try {
    const rebuilt=buildCoachingPrescription(source.sport,prior.durationMin,prior.intensity,source.coaching,prior.verdict==='easy');
    return !rebuilt.paused && rebuilt.sportStructure!==undefined && JSON.stringify(rebuilt.sportStructure)===JSON.stringify(prior.sportStructure);
  } catch { return false; }
}
/** Check-in may hold an explicit prescription, but must never replace its sport facts with generated prose. */
export function preserveSportStructure<T extends { verdict: string; durationMin: number; intensity: string; steps: unknown[]; why?: string; detail: { main: string }; [key: string]: any }>(workout: Record<string, any>, generated: T): T & { sportStructure?: unknown; sportStructureBudgetMin?: number; structureReviewRequired?: string } {
  let prior: Record<string, any>;
  try { prior = JSON.parse(workout.prescription || "null"); } catch { return generated; }
  if (!prior || prior.sportStructure === undefined) return generated;
  if(reproducibleCoachingStructure(workout,prior,generated)) {
    if(generated.verdict==='rest' && generated.durationMin===0 && generated.steps.length===0) {
      const next={...generated};delete next.sportStructure;delete next.sportStructureBudgetMin;
      return next;
    }
    let source:Record<string,any>;
    try {source=JSON.parse(workout.originalPlan);}catch {source={};}
    const withinBounds=['planned','full','easy','trim'].includes(generated.verdict)
      && Number.isInteger(generated.durationMin) && generated.durationMin>0 && generated.durationMin<=source.durationMin
      && /^z[1-7]$/.test(generated.intensity) && Number(generated.intensity.slice(1))<=Number(source.intensity.slice(1));
    if(withinBounds) try {
      const rebuilt=buildCoachingPrescription(workout.sport,generated.durationMin,generated.intensity,source.coaching,generated.verdict==='easy');
      const checked=canonicalSession({athleteId:workout.userId,workout:{...workout,durationMin:generated.durationMin,dayOff:false,planDay:undefined},prescription:{sport:workout.sport,title:workout.title,verdict:'planned',durationMin:generated.durationMin,sportStructure:generated.sportStructure},dateLocal:'1970-01-01',timezone:'UTC'});
      if(!rebuilt.paused && rebuilt.sportStructure!==undefined && JSON.stringify(rebuilt.sportStructure)===JSON.stringify(generated.sportStructure)
        && checked.verdict==='ready' && !checked.steps.some(s=>Number(s.zone.slice(1))>Number(generated.intensity.slice(1)))) {
        return {...generated,sportStructureBudgetMin:generated.durationMin,why:'Reviewed coaching recipe regenerated as complete components within the current time and intensity limits.'};
      }
    }catch { /* Retain the existing explicit-structure hold below. */ }
  }
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
  const structureSport = prior.sportStructure.kind === "pool" || prior.sportStructure.kind === "openWater" ? "swim" : prior.sportStructure.kind === "endurance" ? sport : prior.sportStructure.kind;
  if (structureSport !== sport) return null;
  return JSON.stringify({ ...prior, title, verdict: "rest", durationMin: 0, steps: [], sportStructureBudgetMin: prior.sportStructureBudgetMin ?? prior.durationMin, structureReviewRequired: "The plan changed. Complete check-in and review the retained explicit sport structure before training." });
}
