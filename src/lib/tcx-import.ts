import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ImportedWorkout } from "./importers";
import { normalizeStreams, type ActivityStreams, type RawSample, MAX_ACTIVITY_SECONDS } from "./activity-streams";

/**
 * Garmin TCX (Training Center XML) importer: summaries AND streams, parsed with a real XML parser.
 *
 * Replaces the previous regex parser, which (a) kept only the FIRST lap's calories, (b) invented a 1-minute
 * duration for a single-point file and (c) could not tell a TCX exported from Strava from a Garmin one.
 * Verified here against synthetic fixtures only (src/lib/import-files.test.ts); no real athlete export was
 * available, so Garmin/COROS/Strava dialect differences beyond the TCX schema are untested.
 *
 * Safety: a DOCTYPE or ENTITY declaration is rejected before parsing (TCX never needs one) and entity
 * processing is off, so the entity-expansion class of XML attacks is closed; no network or file access exists
 * in this module.
 */
export interface TcxActivity {
  workout: ImportedWorkout;
  streams: ActivityStreams | null;
  /** The file's metadata names Strava, so the record is treated as Strava-origin (kept out of AI features). */
  stravaMarked: boolean;
}
export interface TcxSkipped { noTrackpoints: number; tooShort: number; invalidTime: number; tooLong: number }
export type TcxResult =
  | { ok: true; activities: TcxActivity[]; skipped: TcxSkipped }
  | { ok: false; error: "not_tcx" | "doctype_rejected" | "parse_failed"; activities: []; skipped: TcxSkipped };

const MIN_SECONDS = 30;
const MAX_TRACKPOINTS = 200_000;
const emptySkipped = (): TcxSkipped => ({ noTrackpoints: 0, tooShort: 0, invalidTime: 0, tooLong: 0 });
const list = (value: unknown): any[] => (value == null ? [] : Array.isArray(value) ? value : [value]);
const num = (value: unknown): number | undefined => {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
/** `<HeartRateBpm><Value>150</Value></HeartRateBpm>` → 150 */
const bpm = (node: any) => num(node?.Value ?? node);

function sportOf(raw: string): ImportedWorkout["sport"] {
  const s = raw.toLowerCase();
  return s.includes("swim") ? "swim" : s.includes("running") ? "run" : s.includes("biking") || s.includes("cycling") ? "bike" : s.includes("strength") ? "strength" : "other";
}

export function parseTcxActivities(xml: string): TcxResult {
  const skipped = emptySkipped();
  const text = xml.charCodeAt(0) === 0xfeff ? xml.slice(1) : xml;
  if (!/<TrainingCenterDatabase[\s>]/.test(text)) return { ok: false, error: "not_tcx", activities: [], skipped };
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return { ok: false, error: "doctype_rejected", activities: [], skipped };
  if (XMLValidator.validate(text) !== true) return { ok: false, error: "parse_failed", activities: [], skipped };
  let root: any;
  try {
    root = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseAttributeValue: false, parseTagValue: false, processEntities: false, removeNSPrefix: true }).parse(text)?.TrainingCenterDatabase;
  } catch { return { ok: false, error: "parse_failed", activities: [], skipped }; }
  if (!root) return { ok: false, error: "not_tcx", activities: [], skipped };
  // Strava names itself in the file's metadata (Author/Creator), never in the sample data.
  const metadata = JSON.stringify([root.Author, ...list(root.Activities?.Activity).map(a => a.Creator)]);
  const stravaMarked = /strava/i.test(metadata);
  const knownDevice = /garmin|forerunner|fenix|edge|coros/i.test(metadata);
  const activities: TcxActivity[] = [];

  for (const activity of list(root.Activities?.Activity)) {
    const laps = list(activity.Lap);
    const points = laps.flatMap(lap => list(lap.Track).flatMap(track => list(track.Trackpoint)));
    if (!points.length) { skipped.noTrackpoints++; continue; }
    if (points.length > MAX_TRACKPOINTS) { skipped.tooLong++; continue; }

    const samples: (RawSample & { time: number })[] = [];
    for (const point of points) {
      const time = Date.parse(String(point.Time ?? ""));
      if (!Number.isFinite(time)) continue;
      const tpx = point.Extensions?.TPX ?? {};
      samples.push({ time, t: 0, hr: bpm(point.HeartRateBpm), power: num(tpx.Watts), cadence: num(point.Cadence ?? tpx.RunCadence),
        speedMs: num(tpx.Speed), altitudeM: num(point.AltitudeMeters), distanceM: num(point.DistanceMeters) });
    }
    if (samples.length < 1) { skipped.invalidTime++; continue; }
    samples.sort((a, b) => a.time - b.time);
    const startMs = samples[0].time;
    for (const sample of samples) sample.t = (sample.time - startMs) / 1000;
    const spanSeconds = samples[samples.length - 1].t;

    const lapSeconds = laps.map(lap => num(lap.TotalTimeSeconds));
    const timer = lapSeconds.length && lapSeconds.every(v => v !== undefined) ? lapSeconds.reduce((a, b) => a! + b!, 0)! : spanSeconds;
    if (timer < MIN_SECONDS) { skipped.tooShort++; continue; }
    if (timer > MAX_ACTIVITY_SECONDS) { skipped.tooLong++; continue; }

    const hrs = samples.map(s => s.hr).filter((v): v is number => typeof v === "number" && v >= 25 && v <= 250);
    const lapAvg = laps.map(lap => bpm(lap.AverageHeartRateBpm));
    const weighted = lapAvg.length && lapAvg.every(v => v !== undefined) && lapSeconds.every(v => v !== undefined) && lapSeconds.reduce((a, b) => a! + b!, 0)! > 0
      ? lapAvg.reduce((sum, v, i) => sum + v! * lapSeconds[i]!, 0) / lapSeconds.reduce((a, b) => a! + b!, 0)!
      : undefined;
    const candidateHr = weighted !== undefined ? Math.round(weighted) : hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : undefined;
    const avgHr = candidateHr !== undefined && candidateHr >= 25 && candidateHr <= 250 ? candidateHr : undefined;
    const lapMax = laps.map(lap => bpm(lap.MaximumHeartRateBpm)).filter((v): v is number => v !== undefined && v >= 25 && v <= 260);
    const maxHr = lapMax.length ? Math.max(...lapMax) : hrs.length ? Math.max(...hrs) : undefined;
    const watts = samples.map(s => s.power).filter((v): v is number => typeof v === "number" && v >= 0 && v <= 2500);
    const avgPower = watts.length ? Math.round(watts.reduce((a, b) => a + b, 0) / watts.length) : undefined;
    const lapCal = laps.map(lap => num(lap.Calories)).filter((v): v is number => v !== undefined);
    // Unknown stays unknown: a file with no calorie field reports no calories (not 0).
    const calories = lapCal.length === laps.length && lapCal.every(c => c >= 0 && c <= 30000) ? Math.round(lapCal.reduce((a, b) => a + b, 0)) : undefined;
    const lapDist = laps.map(lap => num(lap.DistanceMeters));
    const lastDistance = [...samples].reverse().find(s => typeof s.distanceM === "number")?.distanceM as number | undefined;
    const meters = lapDist.length && lapDist.every(v => v !== undefined) ? lapDist.reduce((a, b) => a! + b!, 0)! : lastDistance;

    const sport = sportOf(String(activity["@Sport"] ?? "other"));
    const id = String(activity.Id ?? "").trim() || `${new Date(startMs).toISOString()}-${sport}`;
    activities.push({
      stravaMarked,
      streams: normalizeStreams(samples),
      workout: {
        externalId: `tcx:${id}`, sport, date: new Date(startMs), durationMin: Math.max(1, Math.round(timer / 60)),
        distanceKm: meters !== undefined && meters > 0 ? Math.round(meters / 10) / 100 : undefined,
        avgHr, maxHr, avgPower, calories, title: `${sport[0].toUpperCase()}${sport.slice(1)} Activity`,
        source: stravaMarked ? "tcx" : knownDevice ? "garmin" : "uploaded_unknown", notes: stravaMarked ? "Original source: STRAVA (file export)." : undefined,
      },
    });
  }
  return { ok: true, activities, skipped };
}
