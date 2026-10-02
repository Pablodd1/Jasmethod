import { Encoder, Profile } from "@garmin/fitsdk";
import { createHash } from "node:crypto";
import { canonicalSession, requireExportable, type CanonicalSession, type TargetProfile } from "./canonical-session";

// Compatibility adapter for already-resolved saved prescriptions. No generation,
// protocol reconstruction or generic fallback is allowed in an exporter.
export function workoutToFitSpec(w: { title: string; sport: string; durationMin: number; prescription?: string | null; originalPlan?: string | null; type?: string; id?: string; userId?: string } & TargetProfile, _detail?: { zone?: string | null }): CanonicalSession {
  return canonicalSession({ athleteId: w.userId || "fixture", workout: w, prescription: w.prescription, profile: w, dateLocal: "1970-01-01", timezone: "UTC" });
}
function utf8(value: string, maxBytes: number) {
  let out = "";
  for (const char of value) { if (Buffer.byteLength(out + char, "utf8") > maxBytes) break; out += char; }
  return out;
}
export function fitWorkoutName(spec: CanonicalSession): string {
  const identity = createHash("sha256").update(`${spec.athleteId}:${spec.id}:${spec.revision}`).digest("hex").slice(0, 10);
  return utf8(`JMM-${identity} ${spec.title}`, 80);
}
export function buildFitWorkout(spec: CanonicalSession, created = new Date()): Uint8Array {
  requireExportable(spec);
  const encoder = new Encoder();
  const serialNumber = parseInt(createHash("sha256").update(`${spec.athleteId}:${spec.id}:${spec.revision}`).digest("hex").slice(0, 8), 16) % 0xfffffffe + 1;
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "workout", manufacturer: "development", product: 1, serialNumber, timeCreated: created } as any);
  encoder.onMesg(Profile.MesgNum.WORKOUT, { wktName: fitWorkoutName(spec), sport: spec.capability.fitSport!, subSport: "generic", numValidSteps: spec.steps.length } as any);
  spec.steps.forEach((step, i) => {
    const endpoint = step.endpoint;
    const durationType = endpoint.type === "lap" ? "open" : endpoint.type;
    // SDK 21.214 main fields take raw ms / cm. Subfield keys are ignored by Encoder.
    const durationValue = endpoint.type === "time" ? Math.round(endpoint.seconds * 1000)
      : endpoint.type === "distance" ? Math.round(endpoint.meters * 100)
      : endpoint.type === "reps" ? endpoint.reps : 0;
    const target = step.target;
    const targetType = target.type === "pace" ? "speed" : target.type;
    let low: number | undefined, high: number | undefined;
    if (target.type === "pace") { low = Math.round(1000000 / target.high!); high = Math.round(1000000 / target.low!); }
    else if (target.type === "speed") { low = Math.round(target.low! * 1000); high = Math.round(target.high! * 1000); }
    else if (target.type === "power") { low = target.low! + 1000; high = target.high! + 1000; }
    else if (target.type === "heartRate") { low = target.low! + 100; high = target.high! + 100; }
    const fullNotes = [step.group, step.note, target.label, "Full guidance in JMM. Device support unverified."].filter(Boolean).join(" | ");
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, {
      messageIndex: i, wktStepName: utf8(step.name, 80), durationType, durationValue,
      intensity: step.phase, targetType, targetValue: 0,
      ...(low !== undefined ? { customTargetValueLow: low, customTargetValueHigh: high } : {}),
      notes: Buffer.byteLength(fullNotes, "utf8") > 240 ? `${utf8(fullNotes, 187)} [Truncated; full guidance in JMM.]` : fullNotes,
    } as any);
  });
  return encoder.close();
}
