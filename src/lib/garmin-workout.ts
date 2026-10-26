import { requireExportable, SessionResolutionError, type CanonicalSession } from "./canonical-session";

/** Training API 2.0 wire units differ from FIT. Never parse prescription prose. */
export function garminWorkoutPayload(session: CanonicalSession) {
  requireExportable(session);
  if (!["run", "bike"].includes(session.sport) || session.capability.mode !== "native")
    throw new SessionResolutionError("Direct Garmin publication currently supports structured running and cycling. Use the reviewed file or app instructions for this sport.");
  if (session.steps.length > 100) throw new SessionResolutionError("Garmin's single-sport limit is 100 steps; no steps were removed.");
  if (session.title.length > 128) throw new SessionResolutionError("Shorten the workout title before publishing.");
  const sport = session.sport === "run" ? "RUNNING" : "CYCLING";
  const steps = session.steps.map((step, index) => {
    const description = [step.name, step.group, step.note, step.target.label].filter(Boolean).join(" · ");
    if (description.length > 512) throw new SessionResolutionError("A step exceeds Garmin's description limit; full guidance was not truncated.");
    const endpoint = step.endpoint;
    if (!["time", "distance", "lap"].includes(endpoint.type)) throw new SessionResolutionError("This step's endpoint is not supported for direct Garmin publication.");
    const target = step.target;
    let targetType = "OPEN", targetValueLow: number | null = null, targetValueHigh: number | null = null;
    if (target.type !== "open") {
      if (!["pace", "speed", "heartRate", "power"].includes(target.type) || target.low == null || target.high == null || !Number.isFinite(target.low) || !Number.isFinite(target.high) || target.low > target.high)
        throw new SessionResolutionError("Unresolved Garmin step target.");
      targetType = target.type === "heartRate" ? "HEART_RATE" : target.type === "power" ? "POWER" : "PACE";
      if (target.type === "pace") {
        if (target.low <= 0) throw new SessionResolutionError("Invalid pace target.");
        // Canonical pace is seconds/km; Garmin PACE is metres/second.
        targetValueLow = 1000 / target.high; targetValueHigh = 1000 / target.low;
      } else { targetValueLow = target.low; targetValueHigh = target.high; if (target.type === "speed") targetType = "SPEED"; }
    }
    return { type: "WorkoutStep", stepOrder: index + 1,
      intensity: ({warmup:"WARMUP",active:"ACTIVE",recovery:"RECOVERY",cooldown:"COOLDOWN"} as const)[step.phase],
      description, durationType: endpoint.type === "time" ? "TIME" : endpoint.type === "distance" ? "DISTANCE" : "OPEN",
      durationValue: endpoint.type === "time" ? endpoint.seconds : endpoint.type === "distance" ? endpoint.meters : null,
      durationValueType: endpoint.type === "distance" ? "METER" : null,
      targetType, targetValue: null, targetValueLow, targetValueHigh, targetValueType: null };
  });
  return { workoutName: session.title, description: `JMM prescription ${session.id}; revision ${session.revision}. Follow the current JMM safety review.`,
    sport, workoutProvider: "JasMiamiMethod", workoutSourceId: "JasMiamiMethod", segments: [{ segmentOrder: 1, sport, steps }] };
}
export type GarminWorkoutPayload = ReturnType<typeof garminWorkoutPayload>;
