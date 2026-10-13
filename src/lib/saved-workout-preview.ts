import { canonicalSession, type TargetProfile } from "./canonical-session";
import { dateKey } from "./dates";
import { isSavedWorkoutPreview, validSavedSessionId, type SavedWorkoutPreview } from "./saved-workout-preview-contract";

/** Read saved structure only. Caller supplies evidence-validated anchors, never
 * raw profile estimates. No prose reconstruction, readiness, or fueling engine.
 */
export function savedWorkoutPreview(input: unknown, athleteId: string, timezone: string, profile: TargetProfile | null = null): SavedWorkoutPreview {
  const workout = input && typeof input === "object" && !Array.isArray(input) ? input as Record<string, any> : null;
  const unavailable = (reason = "The saved structure is unavailable. No steps or targets were guessed."): SavedWorkoutPreview => ({
    kind: "saved_plan_preview", sessionId: typeof workout?.id === "string" ? workout.id : "", available: false, reason, session: null,
  });
  try {
    if (!workout || workout.userId !== athleteId || workout.planned !== true || !validSavedSessionId(workout.id)) return unavailable();
    const canonical = canonicalSession({ athleteId, workout, prescription: workout.prescription, profile, dateLocal: dateKey(new Date(workout.date), timezone), timezone });
    if (canonical.verdict !== "ready") return unavailable(canonical.reason);
    const preview: SavedWorkoutPreview = {
      kind: "saved_plan_preview", sessionId: canonical.id, available: true,
      reason: "Saved plan preview only. This does not confirm session-day readiness, completed training, or device delivery. Profile references use currently validated benchmarks.",
      session: {
        title: canonical.title, sport: canonical.sport, dateLocal: canonical.dateLocal, timezone: canonical.timezone,
        durationMin: canonical.durationMin, exactTimeSeconds: canonical.exactTimeSeconds,
        steps: canonical.steps.map(({ name, seconds, zone, phase, endpoint, target, note, group, componentSport }) => ({
          name, seconds, zone, phase, endpoint, target, ...(note ? { note } : {}), ...(group ? { group } : {}), ...(componentSport ? { componentSport } : {}),
        })),
      },
    };
    return isSavedWorkoutPreview(preview) ? preview : unavailable();
  } catch { return unavailable(); }
}
