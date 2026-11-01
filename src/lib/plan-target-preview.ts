import { evidencedTargetProfile, type AnchorTest } from "./anchor-evidence";
import { normalizeSteps, type SessionSport, type TargetProfile } from "./canonical-session";
import type { WorkoutStep } from "./prescription";
import { plannedMechanicalWork, targetSpeedLabel } from "./session-metrics";
import { unitsOf } from "./units";

/** Display-only projection. Persist relative source steps, not these resolved
 * values. A future session may outlive the current reference's validity. */
export function planTargetPreview(input: { steps: WorkoutStep[]; sport: SessionSport; profile: TargetProfile;
  tests: AnchorTest[]; appliedIds: string[]; sessionDate: Date; now: Date; timezone: string; language?: string | null }) {
  const profile = evidencedTargetProfile({ ...input.profile, units: unitsOf(input.profile.units, input.language) }, input.tests, input.appliedIds,
    new Date(Math.max(input.now.getTime(), input.sessionDate.getTime())), input.timezone);
  const steps = normalizeSteps(input.steps, input.sport, profile);
  const field = input.sport === "bike" ? "ftp" : input.sport === "swim" ? "swimPaceBase" : "runPaceBase";
  return {
    steps: steps.map(step => ({ targetLabel: step.target.label,
      speedLabel: targetSpeedLabel(step.target, profile.units === "imperial" ? "imperial" : "metric"),
      reference: step.target.source === "profile_reference" ? profile.referenceEvidence[field] ?? null : null,
    })),
    mechanicalWork: plannedMechanicalWork(steps, input.sport),
  };
}
