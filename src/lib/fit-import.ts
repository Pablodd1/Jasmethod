import { createHash } from "node:crypto";
import { Decoder, Stream } from "@garmin/fitsdk";
import type { ImportedWorkout } from "./importers";
import { MAX_ACTIVITY_SECONDS, normalizeStreams, type ActivityStreams, type RawSample } from "./activity-streams";

/**
 * Incoming Garmin FIT ACTIVITY files (a completed activity recorded by a device), decoded with Garmin's
 * official SDK. A FIT is binary: it is never read as text.
 *
 * Validation, in order: size cap → ".FIT" header → CRC integrity of the whole file → decode without errors →
 * file type must be "activity" (a planned-workout, course or settings FIT is refused with its own reason) →
 * at least one session with a usable start and duration. A file failing any step imports nothing.
 *
 * Verified with synthetic activity files built by the same SDK's Encoder (src/lib/import-files.test.ts). No
 * real device file was available, so device-specific quirks (e.g. developer fields, multisport chains) are
 * untested; unknown message types are ignored, never guessed.
 *
 * GPS position fields are not read at all.
 */
export const MAX_FIT_BYTES = 40 * 1024 * 1024;

export interface FitActivity { workout: ImportedWorkout; streams: ActivityStreams | null; stravaMarked: boolean }
export type FitImportError = "too_large" | "not_fit" | "integrity_failed" | "decode_failed" | "not_activity" | "no_session";
export type FitImportResult =
  | { ok: true; activities: FitActivity[]; sessionsSkipped: number; warnings: string[] }
  | { ok: false; error: FitImportError };

const sportOf = (sport: unknown, subSport: unknown): ImportedWorkout["sport"] | null => {
  const s = String(sport ?? ""), sub = String(subSport ?? "");
  if (s === "running") return "run";
  if (s === "cycling") return "bike";
  if (s === "swimming") return "swim";
  if (s === "training" && /strength/.test(sub)) return "strength";
  return null;
};
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const within = (v: number | undefined, lo: number, hi: number) => (v !== undefined && v >= lo && v <= hi ? v : undefined);
const ms = (v: unknown): number => (v instanceof Date ? v.getTime() : NaN);

export function decodeFitActivity(bytes: Uint8Array): FitImportResult {
  if (bytes.length > MAX_FIT_BYTES) return { ok: false, error: "too_large" };
  let messages: Record<string, any[]>;
  try {
    const decoder = new Decoder(Stream.fromByteArray(bytes));
    if (!decoder.isFIT()) return { ok: false, error: "not_fit" };
    if (!decoder.checkIntegrity()) return { ok: false, error: "integrity_failed" };
    const read = decoder.read({ mergeHeartRates: true, convertDateTimesToDates: true });
    if (read.errors.length) return { ok: false, error: "decode_failed" };
    messages = read.messages as Record<string, any[]>;
  } catch { return { ok: false, error: "decode_failed" }; }

  const fileId = messages.fileIdMesgs?.[0];
  if (!fileId || fileId.type !== "activity") return { ok: false, error: "not_activity" };
  const sessions = messages.sessionMesgs ?? [];
  if (!sessions.length) return { ok: false, error: "no_session" };
  const records = messages.recordMesgs ?? [];
  const stravaMarked = String(fileId.manufacturer ?? "").toLowerCase() === "strava";
  const warnings: string[] = [];
  const idPart = createHash("sha256").update([fileId.manufacturer, fileId.product, fileId.serialNumber, ms(fileId.timeCreated)].map(String).join("|")).digest("hex").slice(0, 16);
  const activities: FitActivity[] = [];
  let skipped = 0;

  sessions.forEach((session, index) => {
    const start = ms(session.startTime);
    const timer = num(session.totalTimerTime) ?? num(session.totalElapsedTime);
    const sport = sportOf(session.sport, session.subSport);
    if (!Number.isFinite(start) || timer === undefined || timer < 30 || timer > MAX_ACTIVITY_SECONDS) { skipped++; return; }
    if (!sport) { skipped++; warnings.push(`unsupported_sport:${String(session.sport ?? "unknown")}`); return; }
    const elapsed = num(session.totalElapsedTime) ?? timer;
    const end = start + elapsed * 1000;
    const samples: RawSample[] = records.filter(r => { const t = ms(r.timestamp); return t >= start && t <= end + 1000; }).map(r => ({
      t: (ms(r.timestamp) - start) / 1000, hr: r.heartRate, power: r.power, cadence: r.cadence,
      speedMs: r.enhancedSpeed ?? r.speed, altitudeM: r.enhancedAltitude ?? r.altitude, distanceM: r.distance,
    }));
    const meters = num(session.totalDistance);
    activities.push({
      stravaMarked,
      streams: normalizeStreams(samples),
      workout: {
        externalId: `fit:${idPart}:${new Date(start).toISOString()}${index > 0 ? `#${index}` : ""}`,
        sport, date: new Date(start), durationMin: Math.max(1, Math.round(timer / 60)),
        distanceKm: meters !== undefined && meters > 0 ? Math.round(meters / 10) / 100 : undefined,
        avgHr: within(num(session.avgHeartRate), 25, 250), maxHr: within(num(session.maxHeartRate), 25, 260),
        avgPower: within(num(session.avgPower), 0, 2500), np: within(num(session.normalizedPower), 0, 2500), tss: within(num(session.trainingStressScore), 0, 2000), calories: within(num(session.totalCalories), 0, 30000),
        title: `${sport[0].toUpperCase()}${sport.slice(1)} Activity`,
        source: "fit", notes: stravaMarked ? "Original source: STRAVA (file export)." : undefined,
      },
    });
  });
  if (!activities.length) return { ok: false, error: "no_session" };
  return { ok: true, activities, sessionsSkipped: skipped, warnings };
}
