import type { PlanningSetup } from "./planning-setup";
import type { cycleActivityEvidence } from "./training-cycle";

/** A reported baseline is a separate input, never a relabelled imported summary. */
export function cyclePlanningBasis(evidence: ReturnType<typeof cycleActivityEvidence>, setup: PlanningSetup, requested: unknown, isAthlete: boolean) {
  if (requested !== undefined && typeof requested !== "boolean") throw new Error("Invalid manual-baseline planning choice");
  const manual = requested === true;
  if (manual && (!isAthlete || setup.source !== "athlete_reported" || !setup.baselineWeeklyMinutes || !setup.baselineObservedAt))
    throw new Error("The athlete must confirm a separately reported recent baseline before manual-baseline planning.");
  if (evidence.derivedActivityPolicy.status !== "allowed" && !manual)
    throw new Error(evidence.derivedActivityPolicy.reason || "Imported activity cannot be analyzed. Review a separately reported baseline to preview provisional training; unknown load is not zero.");
  return {
    basis: manual ? "athlete_reported_baseline" as const : "available_activity" as const,
    activity: manual ? {
      ...evidence, reportedSessions:null, reportedMinutes:null, unknownDurationSessions:null,
      // Unknown work never becomes rest or room for an increased dose.
      historyReview:true, recoveryReview:true,
      note:"Provisional planning uses only the separately athlete-reported baseline. Imported history is not analyzed or treated as zero; actual load and recovery remain unknown. No capacity increase or execution approval is inferred. Complete daily review before training or export.",
    } : evidence,
  };
}
