import { Encoder, Profile } from "@garmin/fitsdk";
import { createHash } from "node:crypto";
import { buildZip, type ZipEntry } from "./zip";
import { poolLengthMeters, SWIM_STROKES } from "./sport-structure";
import { canonicalSession, requireExportable, fitFilename, companionInstruction, SessionResolutionError, type CanonicalSession, type TargetProfile } from "./canonical-session";

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
  if (spec.capability.mode === "split") throw new SessionResolutionError("This brick requires separate component FIT files and a transition manifest (.ZIP), not a single multisport FIT.");
  const encoder = new Encoder();
  const serialNumber = parseInt(createHash("sha256").update(`${spec.athleteId}:${spec.id}:${spec.revision}`).digest("hex").slice(0, 8), 16) % 0xfffffffe + 1;
  encoder.onMesg(Profile.MesgNum.FILE_ID, { type: "workout", manufacturer: "development", product: 1, serialNumber, timeCreated: created } as any);
  encoder.onMesg(Profile.MesgNum.WORKOUT, { wktName: fitWorkoutName(spec), sport: spec.capability.fitSport!, subSport: spec.capability.fitSubSport ?? "generic", numValidSteps: spec.steps.length, ...(spec.sportStructure?.kind === "pool" ? { poolLength: poolLengthMeters(spec.sportStructure.poolLength), poolLengthUnit: spec.sportStructure.poolLength.unit === "yd" ? "statute" : "metric" } : {}) } as any);
  spec.steps.forEach((step, i) => {
    const companion = spec.capability.mode === "generic" && ["strength", "hyrox"].includes(spec.sport);
    const endpoint = companion && ["reps", "distance"].includes(step.endpoint.type) ? { type: "lap" as const } : step.endpoint;
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
    const fullNotes = [companion ? companionInstruction(step) : null, step.group, step.note, target.label, "Full guidance in JMM. Device support unverified."].filter(Boolean).join(" | ");
    encoder.onMesg(Profile.MesgNum.WORKOUT_STEP, {
      messageIndex: i, wktStepName: utf8(step.name, 80), durationType, durationValue,
      intensity: spec.sportStructure?.kind === "pool" && step.phase === "recovery" ? "rest" : step.phase, targetType, targetValue: target.type === "swimStroke" ? SWIM_STROKES.indexOf(target.stroke!) : 0,
      ...(low !== undefined ? { customTargetValueLow: low, customTargetValueHigh: high } : {}),
      notes: Buffer.byteLength(fullNotes, "utf8") > 240 ? `${utf8(fullNotes, 187)} [Truncated; full guidance in JMM.]` : fullNotes,
    } as any);
  });
  return encoder.close();
}

/** Split exports are a separate artifact format; never disguise ZIP bytes as .FIT. */
export function sessionFitEntries(spec: CanonicalSession, created = new Date()): ZipEntry[] {
  requireExportable(spec);
  if (spec.capability.mode !== "split") return [{ name: fitFilename(spec), data: buildFitWorkout(spec, created) }];
  if (spec.sportStructure?.kind !== "brick" || !spec.components?.length) throw new SessionResolutionError("Missing explicit brick component structure.");
  const files = spec.components.map((component, index) => ({ name: `${String(index + 1).padStart(2, "0")}-${fitFilename(component)}`, data: buildFitWorkout(component, created) }));
  const manifest = {
    schemaVersion: 1, sessionId: spec.id, sourceRevision: spec.revision, title: spec.title, dateLocal: spec.dateLocal, timezone: spec.timezone,
    format: "ordered-component-workouts", deviceTested: false,
    instructions: "Start each component file manually in order. Transition instructions are not encoded into a single multisport workout. Inspect all steps on a compatible device before training.",
    components: spec.components.map((component, i) => ({ order: i + 1, componentId: spec.sportStructure!.kind === "brick" ? spec.sportStructure!.components[i].id : "", filename: files[i].name, sport: component.sport, title: component.title, revision: component.revision, steps: component.steps })),
    transitions: spec.sportStructure.transitions,
  };
  return [...files, { name: "transition-manifest.json", data: JSON.stringify(manifest, null, 2) + "\n" }, { name: "README.txt", data: `JMM ordered brick export\n${spec.title}\nRevision: ${spec.revision}\n\n${manifest.instructions}\n\n${spec.sportStructure.transitions.map((t, i) => `${i + 1}. After ${t.afterComponentId}: ${t.instruction} (${t.endpoint.type === "time" ? `${t.endpoint.seconds} s` : "manual transition"})`).join("\n")}\n\nDevice compatibility, USB transfer and execution are unverified. This is not a Garmin Connect activity upload or a validated single-file multisport workout. No watch receipt is claimed.\n` }];
}
export function buildSessionDownload(spec: CanonicalSession, created = new Date()): { bytes: Uint8Array; filename: string; contentType: string } {
  const entries = sessionFitEntries(spec, created);
  return spec.capability.mode === "split"
    ? { bytes: buildZip(entries, created), filename: fitFilename(spec).replace(/\.fit$/, "-components.zip"), contentType: "application/zip" }
    : { bytes: entries[0].data as Uint8Array, filename: entries[0].name, contentType: "application/octet-stream" };
}
