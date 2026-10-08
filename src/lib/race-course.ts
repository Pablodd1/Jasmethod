import { XMLParser, XMLValidator } from "fast-xml-parser";

export const RACE_GPX_MAX_BYTES = 5 * 1024 * 1024;
export const RACE_GPX_MAX_POINTS = 100_000;
export interface RaceCoursePoint {
  distanceM: number; latitude: number; longitude: number;
  elevationM: number | null; segmentIndex: number;
}
export interface RaceCourseSegment {
  startDistanceM: number; endDistanceM: number; distanceM: number;
  elevationChangeM: number | null; gradePct: number | null; trackSegmentIndex: number;
}
export interface RaceCourseResult {
  format: "gpx"; distanceM: number; ascentM: number | null; descentM: number | null;
  minElevationM: number | null; maxElevationM: number | null; elevationCoverage: number;
  profile: RaceCoursePoint[]; segments: RaceCourseSegment[];
  sourcePointCount: number; trackSegmentCount: number; gapCount: number;
  officialStatus: "unverified"; warnings: string[];
  method: { version: string; resampleM: number | null; smoothing: string; ascentMethod: string };
}
type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const arr = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function numeric(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "string" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error(`Invalid ${label} in course file.`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`Invalid ${label} in course file.`);
  return result;
}
export function raceCourseDistanceM(a: Pick<RaceCoursePoint, "latitude" | "longitude">, b: Pick<RaceCoursePoint, "latitude" | "longitude">): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (((b.longitude - a.longitude + 540) % 360) - 180) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
/** Local, bounded course-only parser. Does not fetch URLs or retain athlete extensions. */
export function parseRaceCourseGpx(xml: string): RaceCourseResult {
  if (typeof xml !== "string" || Buffer.byteLength(xml, "utf8") > RACE_GPX_MAX_BYTES) throw new Error("Course file must be at most 5 MiB.");
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml)) throw new Error("Course files cannot contain document types or entities.");
  // Guard deeply nested hostile input before invoking the XML parser.
  let depth = 0;
  const markup = xml.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  for (const token of markup.matchAll(/<[^>]*>/g)) {
    if (/^<\//.test(token[0])) depth--;
    else if (!/^<[!?]/.test(token[0]) && !/\/>$/.test(token[0])) depth++;
    if (depth > 32) throw new Error("Course XML is too deeply nested.");
  }
  if (XMLValidator.validate(xml) !== true) throw new Error("Course file is not valid XML.");
  const root = obj(new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, removeNSPrefix: true, processEntities: false }).parse(xml));
  const gpx = obj(root.gpx);
  if (gpx["@_version"] !== "1.1" && gpx["@_version"] !== "1.0") throw new Error("Use a GPX 1.0 or 1.1 course file.");
  const tracks = arr(gpx.trk), routes = arr(gpx.rte);
  if (tracks.length + routes.length !== 1) throw new Error("Select one track or route and export it as a separate GPX file.");
  const groups = tracks.length ? arr(obj(tracks[0]).trkseg).map(s => arr(obj(s).trkpt)) : [arr(obj(routes[0]).rtept)];
  if (groups.length > 100) throw new Error("Course has too many disconnected segments (maximum 100).");
  const pointCount = groups.reduce((n, points) => n + points.length, 0);
  if (pointCount > RACE_GPX_MAX_POINTS) throw new Error("Course file has too many points (maximum 100,000).");
  if (pointCount < 2 || groups.some(g => g.length < 2)) throw new Error("Every course segment needs at least two points.");
  const profile: RaceCoursePoint[] = [], segments: RaceCourseSegment[] = [];
  let distanceM = 0, coveredM = 0, ascent = 0, descent = 0, min = Infinity, max = -Infinity;
  for (let index = 0; index < groups.length; index++) {
    let previous: RaceCoursePoint | null = null;
    for (const raw of groups[index]) {
      const value = obj(raw);
      const point: RaceCoursePoint = {
        latitude: numeric(value["@_lat"], "latitude", -90, 90),
        longitude: numeric(value["@_lon"], "longitude", -180, 180),
        elevationM: value.ele === undefined ? null : numeric(value.ele, "elevation", -500, 9000),
        distanceM, segmentIndex: index,
      };
      if (point.elevationM !== null) { min = Math.min(min, point.elevationM); max = Math.max(max, point.elevationM); }
      if (previous) {
        const d = raceCourseDistanceM(previous, point);
        if (d > 0) {
          const delta = previous.elevationM !== null && point.elevationM !== null ? point.elevationM - previous.elevationM : null;
          const start = distanceM; distanceM += d;
          if (delta !== null) { coveredM += d; ascent += Math.max(0, delta); descent += Math.max(0, -delta); }
          segments.push({ startDistanceM: start, endDistanceM: distanceM, distanceM: d, elevationChangeM: delta, gradePct: delta === null ? null : 100 * delta / d, trackSegmentIndex: index });
        }
      }
      point.distanceM = distanceM;
      profile.push(point); previous = point;
    }
  }
  if (distanceM < 1) throw new Error("Course needs at least one meter of non-zero horizontal distance.");
  const complete = coveredM >= distanceM - 0.000001 && profile.every(p => p.elevationM !== null);
  const warnings = ["Imported course is unverified for the race edition.", "Elevation totals use raw, unsmoothed GPX samples and may include noise."];
  if (!complete) warnings.push("Elevation is missing: total ascent and descent are unavailable; missing values are not sea level.");
  if (groups.length > 1) warnings.push("Disconnected track segments are preserved; distances across gaps are excluded.");
  if (segments.some(s => Math.abs(s.gradePct ?? 0) > 50)) warnings.push("Very steep sample grades detected; review course elevation quality.");
  // Keep gap boundaries visible; decimate only the render profile, never metric segments.
  const every = Math.max(1, Math.ceil(profile.length / 1750));
  const renderProfile = profile.filter((p, i) => i % every === 0 || i === profile.length - 1 || profile[i - 1]?.segmentIndex !== p.segmentIndex || profile[i + 1]?.segmentIndex !== p.segmentIndex);
  return { format: "gpx", distanceM, ascentM: complete ? ascent : null, descentM: complete ? descent : null,
    minElevationM: Number.isFinite(min) ? min : null, maxElevationM: Number.isFinite(max) ? max : null,
    elevationCoverage: coveredM / distanceM, profile: renderProfile, segments, sourcePointCount: pointCount,
    trackSegmentCount: groups.length, gapCount: groups.length - 1, officialStatus: "unverified", warnings,
    method: { version: "gpx-raw-v1", resampleM: null, smoothing: "none", ascentMethod: "sum of signed adjacent elevation differences within each track segment" } };
}

/** Reduce adjacent 0.5-percentage-point grade buckets without flattening an uphill into a downhill.
 * This retains exact summed path distance and signed rise; grade is averaged only within a narrow bucket. Raw grades are checked before aggregation.
 * Never silently reconnect a GPX gap or treat missing elevation as a flat section.
 */
export function courseToScenarioSegments(course: RaceCourseResult, options: {headwindMps?: number; speedCapMps?: number | null; maxAbsGrade?: number} = {}): {distanceM:number;grade:number;headwindMps:number;speedCapMps:number|null}[] {
  const wind=options.headwindMps??0,cap=options.speedCapMps??null,maxGrade=options.maxAbsGrade??0.15;
  if(!Number.isFinite(maxGrade)||maxGrade<=0||maxGrade>0.45) throw new Error("Invalid model grade limit.");
  if(!Number.isFinite(wind)||Math.abs(wind)>50||cap!==null&&(!Number.isFinite(cap)||cap<0.1||cap>40)) throw new Error("Invalid course wind or speed cap.");
  if(course.gapCount>0) throw new Error("Disconnected course segments need review before whole-course projection.");
  const runs:{horizontalM:number;riseM:number;pathM:number;bucket:number}[]=[];
  for(const s of course.segments) {
    if(s.elevationChangeM===null||s.gradePct===null) throw new Error("Complete course elevation is needed for grade-based projection.");
    if(!Number.isFinite(s.distanceM)||s.distanceM<=0||!Number.isFinite(s.elevationChangeM)) throw new Error("Invalid course segment.");
    const grade=s.elevationChangeM/s.distanceM;
    if(Math.abs(grade)>maxGrade) throw new Error("A raw course section exceeds the selected sport's grade range. Review its elevation data.");
    // Half-percentage-point buckets bound simplification; never blend uphill and downhill.
    const bucket=Math.sign(grade)*(1+Math.floor(Math.abs(grade)/0.005)),last=runs[runs.length-1];
    const pathM=Math.hypot(s.distanceM,s.elevationChangeM);
    if(last&&last.bucket===bucket){last.horizontalM+=s.distanceM;last.riseM+=s.elevationChangeM;last.pathM+=pathM;}
    else runs.push({horizontalM:s.distanceM,riseM:s.elevationChangeM,pathM,bucket});
  }
  if(runs.length>1000) throw new Error("This course has too many raw grade changes for the model. Import a verified simplified elevation profile or use explicit manual course assumptions.");
  return runs.map(r=>{
    const grade=r.riseM/r.horizontalM;
    if(Math.abs(grade)>0.45) throw new Error("A course section exceeds the model grade range. Review its elevation data.");
    return {distanceM:r.pathM,grade,headwindMps:wind,speedCapMps:cap};
  });
}
