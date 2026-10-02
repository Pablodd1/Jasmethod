import { TRAINING_PROTOCOLS, PROTOCOL_VERSION } from "./protocols";
const sports = ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "boxing"];
/** Reject corrupt source plans before a generator can normalize them into a workout. */
export function checkinPrescriptionInputError(workout: { originalPlan?: string | null; [key: string]: unknown }): string | null {
  let source: Record<string, any> = workout;
  if (workout.originalPlan != null) {
    try { source = JSON.parse(workout.originalPlan); } catch { return "Saved base plan is malformed. Review the session before generating a replacement."; }
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) return "Saved base plan is not a session object.";
  if (!sports.includes(source.sport) || typeof source.title !== "string" || !source.title.trim() || typeof source.type !== "string" || !source.type.trim()) return "Session sport, title or type is missing or unsupported.";
  if (!Number.isInteger(source.durationMin) || source.durationMin < 0 || source.durationMin > 1440) return "Session duration is invalid.";
  if (typeof source.intensity !== "string" || !/^z[1-7]$/.test(source.intensity)) return "Session intensity must be reviewed before generating a prescription.";
  if (source.protocol != null) {
    const p = source.protocol;
    const protocol = TRAINING_PROTOCOLS.find((candidate) => candidate.id === p.id);
    if (!protocol || p.version !== PROTOCOL_VERSION || p.sport !== source.sport || !protocol.sports.includes(p.sport) || !Number.isInteger(p.minutes) || p.minutes <= 0 || p.minutes > 1440) return "Saved protocol structure or version is invalid.";
  }
  return null;
}
