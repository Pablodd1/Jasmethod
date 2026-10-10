import { createHash } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ImportedWorkout } from "./importers";

// Local parsing only. A file preview never proves that the whole Garmin account
// was exported. Activities CSV and TCX carry activities, not wellness history.
export const GARMIN_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const GARMIN_FILE_MAX_RECORDS = 10_000;
export type GarminDistanceUnit = "km" | "mi" | "m" | "yd";
export interface GarminFileInput {
  filename: string;
  content: string | Uint8Array;
  timezone?: string;
  unitSystem?: "metric" | "imperial";
  distanceUnit?: GarminDistanceUnit;
  swimDistanceUnit?: GarminDistanceUnit;
  numberFormat?: "decimal-dot" | "decimal-comma";
  /** Test/server clock only; never derive from untrusted upload metadata. */
  now?: Date;
}
export interface GarminFileWorkout extends ImportedWorkout {
  source: "garmin";
  sourceRow: number;
  sourceDurationSeconds: number;
  sourceId?: string;
  /** Prior JMM file IDs are lookup-only aliases; they do not authorize rewrites. */
  legacyExternalIds?: string[];
  identity: "provider-id" | "start-sport";
  np?: number;
  tss?: number;
}
export interface GarminFileDiagnostic {
  row?: number;
  severity: "error" | "warning" | "skipped";
  code: string;
  message: string;
}
export interface GarminFileParseResult {
  format: "activities-csv" | "tcx" | "unsupported";
  workouts: GarminFileWorkout[];
  diagnostics: GarminFileDiagnostic[];
  totalRecords: number;
  rejectedRecords: number;
  skippedRecords: number;
  coverage: { start: string | null; end: string | null; accepted: number; completeArchive: false };
  fatal: boolean;
}
class ImportError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
function fail(code: string, message: string): never { throw new ImportError(code, message); }
const clean = (s: string) => s.trim().normalize("NFKC");
const key = (s: string) => clean(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
const unitFactors: Record<GarminDistanceUnit, number> = { km: 1, mi: 1.609344, m: 0.001, yd: 0.0009144 };
const units = new Set(Object.keys(unitFactors));
const missing = (value: string) => value === "" || value === "--" || value === "—";

function diagnostic(error: unknown, row?: number): GarminFileDiagnostic {
  return { row, severity: "error", code: error instanceof ImportError ? error.code : "INVALID_FILE", message: error instanceof ImportError ? error.message : "The file could not be parsed safely." };
}
function numeric(value: string, label: string, format: GarminFileInput["numberFormat"], max: number, min = 0): number | undefined {
  value = clean(value);
  if (missing(value)) return undefined;
  if (!format && /[.,]/.test(value)) fail("NUMBER_FORMAT_REQUIRED", `Choose the decimal format for ${label}; separators cannot be inferred safely.`);
  const dot = format !== "decimal-comma";
  const pattern = dot ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/ : /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  if (!pattern.test(value)) fail("INVALID_NUMBER", `Invalid ${label}; use the selected numeric format without extra text.`);
  const n = Number(dot ? value.replace(/,/g, "") : value.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) fail("NUMBER_OUT_OF_RANGE", `${label} is outside the supported range.`);
  return n;
}
function integerMetric(value: string, label: string, format: GarminFileInput["numberFormat"], max: number, min = 0): number | undefined {
  const n = numeric(value, label, format, max, min);
  if (n !== undefined && !Number.isInteger(n)) fail("INTEGER_REQUIRED", `${label} must be a whole number in this export.`);
  return n;
}
function storedMinutes(seconds: number, out: GarminFileParseResult, row: number): number {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes * 60 !== seconds) out.diagnostics.push({ row, severity: "warning", code: "DURATION_ROUNDED", message: "The app stores whole minutes; duration is rounded to the nearest minute (minimum 1). Original elapsed seconds are retained as source metadata." });
  return minutes;
}
function duration(value: string): number {
  const m = clean(value).match(/^(\d{1,3}):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/);
  if (!m) fail("INVALID_DURATION", "Time must be an elapsed duration in HH:MM:SS format, optionally with fractional seconds.");
  const seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4] || 0}`);
  if (seconds <= 0 || seconds > 31 * 86400) fail("INVALID_DURATION", "Duration must be positive and no longer than 31 days.");
  return seconds / 60;
}
interface DateParts { year: number; month: number; day: number; hour: number; minute: number; second: number; ms: number }
function partsMs(p: DateParts): number { return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, p.ms); }
function checkedParts(match: RegExpMatchArray): DateParts {
  const p = { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5], second: +(match[6] || 0), ms: +(match[7] || "0").padEnd(3, "0") };
  const d = new Date(partsMs(p));
  if (p.year < 1970 || p.year > 2100 || d.getUTCFullYear() !== p.year || d.getUTCMonth() + 1 !== p.month || d.getUTCDate() !== p.day || d.getUTCHours() !== p.hour || d.getUTCMinutes() !== p.minute || d.getUTCSeconds() !== p.second) fail("INVALID_DATE", "Invalid activity calendar date or time.");
  return p;
}
function absoluteDate(value: string): Date {
  const m = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/);
  if (!m) fail("TIMESTAMP_OFFSET_REQUIRED", "TCX and absolute timestamps require ISO date/time with Z or an explicit UTC offset.");
  const p = checkedParts(m), offset = m[8];
  let minutes = 0;
  if (offset !== "Z") {
    const hours = +offset.slice(1, 3), mins = +offset.slice(4, 6);
    if (hours > 14 || mins > 59 || (hours === 14 && mins !== 0)) fail("INVALID_DATE", "Invalid UTC offset.");
    minutes = (hours * 60 + mins) * (offset[0] === "+" ? 1 : -1);
  }
  return new Date(partsMs(p) - minutes * 60_000);
}
function localDateParser(timezone: string): (value: string) => Date {
  // UTC is a valid named zone; numeric offsets and abbreviations aren't substitutes
  // for an IANA zone that describes the export's DST rules.
  if (timezone !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)+$/.test(timezone)) fail("INVALID_TIMEZONE", "Choose an IANA timezone such as America/New_York or Europe/Madrid.");
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }); }
  catch { return fail("INVALID_TIMEZONE", "The selected IANA timezone is not recognized."); }
  const wallMs = (ms: number) => {
    const values: Record<string, number> = {};
    for (const part of formatter.formatToParts(ms)) if (part.type !== "literal") values[part.type] = Number(part.value);
    return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  };
  const offsetsByDay = new Map<string, number[]>();
  return (value: string) => {
    if (/(?:Z|[+-]\d{2}:\d{2})$/.test(clean(value))) return absoluteDate(value);
    const m = clean(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (!m) fail("INVALID_DATE", "Use an unambiguous YYYY-MM-DD HH:MM:SS activity date; report periods and locale-ambiguous dates are not supported.");
    const p = checkedParts(m), naive = partsMs(p), day = `${p.year}-${p.month}-${p.day}`;
    let offsets = offsetsByDay.get(day);
    if (!offsets) {
      const noon = Date.UTC(p.year, p.month - 1, p.day, 12);
      offsets = Array.from(new Set([-48, -24, 0, 24, 48].map(hours => { const sample = noon + hours * 3600_000; return wallMs(sample) - sample; })));
      offsetsByDay.set(day, offsets);
    }
    const matches = offsets.map(offset => naive - offset).filter(ms => wallMs(ms) === naive - p.ms);
    if (matches.length === 0) fail("LOCAL_TIME_NONEXISTENT", "This local time does not exist at a timezone transition. Export a timestamp with a UTC offset or review the source.");
    if (matches.length !== 1) fail("LOCAL_TIME_AMBIGUOUS", "This local time occurs twice at a timezone transition. Export a timestamp with a UTC offset or review the source.");
    return new Date(matches[0]);
  };
}

/** Strict RFC-4180 quoting, including embedded newlines. No partial recovery of a malformed file. */
function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  const field = () => { row.push(cell); cell = ""; closed = false; if (row.length > 200) fail("CSV_LIMIT", "CSV has too many columns (maximum 200)."); };
  const record = () => { field(); if (row.some(v => v.trim() !== "")) rows.push(row); row = []; if (rows.length > GARMIN_FILE_MAX_RECORDS + 1) fail("RECORD_LIMIT", "Import at most 10,000 activities per file."); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += ch;
    } else if (ch === ",") field();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; record(); }
    else if (ch === '"' && cell === "" && !closed) quoted = true;
    else if (ch === '"' || closed) fail("MALFORMED_CSV", "CSV quoting is malformed; re-export the original Activities CSV.");
    else cell += ch;
    if (cell.length > 16_384) fail("CSV_LIMIT", "A CSV field exceeds the 16 KiB limit.");
  }
  if (quoted) fail("MALFORMED_CSV", "CSV contains an unterminated quoted field.");
  if (cell !== "" || row.length || closed) record();
  return rows;
}
const aliases: Record<string, string> = {
  "activity type": "type", "tipo de actividad": "type", date: "date", fecha: "date", title: "title", titulo: "title", distance: "distance", distancia: "distance", time: "time", tiempo: "time",
  "activity id": "id", "id de actividad": "id", "id de la actividad": "id",
  calories: "calories", calorias: "calories", "avg hr": "avgHr", "average hr": "avgHr", "fc media": "avgHr", "frecuencia cardiaca media": "avgHr", "max hr": "maxHr", "fc maxima": "maxHr", "frecuencia cardiaca maxima": "maxHr",
  "avg power": "avgPower", "average power": "avgPower", "potencia media": "avgPower", "normalized power (np)": "np", "normalized power® (np®)": "np", "normalized power": "np", "potencia normalizada (np)": "np", "training stress score (tss)": "tss", "training stress score®": "tss", "training stress score": "tss",
};
function sportFor(raw: string): ImportedWorkout["sport"] {
  const type = key(raw);
  if (["running", "run", "trail running", "treadmill running", "track running", "virtual running", "carrera", "carrera en cinta", "carrera en pista", "carrera de montana"].includes(type)) return "run";
  if (["cycling", "biking", "bike", "road cycling", "mountain biking", "indoor cycling", "virtual cycling", "ciclismo", "ciclismo en carretera", "ciclismo de montana", "ciclismo en interiores"].includes(type)) return "bike";
  if (["swimming", "swim", "pool swimming", "lap swimming", "open water swimming", "natacion", "natacion en piscina", "natacion en aguas abiertas"].includes(type)) return "swim";
  if (["strength training", "strength", "entrenamiento de fuerza", "fuerza"].includes(type)) return "strength";
  return "other"; // Walking and unknown sports are never reclassified as running.
}
function identity(date: Date, sport: ImportedWorkout["sport"], sourceId?: string): Pick<GarminFileWorkout, "externalId" | "sourceId" | "identity"> {
  if (sourceId) return { externalId: `garmin-file:id:${sourceId}`, sourceId, identity: "provider-id" };
  return { externalId: `garmin-file:${createHash("sha256").update(`${date.toISOString()}|${sport}`).digest("hex")}`, identity: "start-sport" };
}
function checkNotFuture(date: Date, now: Date): void {
  if (!Number.isFinite(now.getTime())) fail("INVALID_CLOCK", "The import clock is invalid.");
  if (date.getTime() > now.getTime() + 5 * 60_000) fail("FUTURE_ACTIVITY", "This activity starts in the future; verify the date and export timezone.");
}
function readCsv(text: string, input: GarminFileInput, out: GarminFileParseResult): void {
  const rows = csvRows(text);
  if (rows.length === 0) fail("EMPTY_FILE", "The file is empty.");
  const columns = new Map<string, number>();
  let headerUnit: GarminDistanceUnit | undefined;
  rows[0].forEach((raw, i) => {
    let name = key(raw);
    const unit = name.match(/^(distance|distancia)\s*\((km|mi|m|yd)\)$/);
    if (unit) { name = unit[1]; headerUnit = unit[2] as GarminDistanceUnit; }
    const field = aliases[name];
    if (!field) return; // Garmin's additional summary metrics are not used.
    if (columns.has(field)) fail("DUPLICATE_HEADER", `CSV has more than one ${field} column.`);
    columns.set(field, i);
  });
  if (!["type", "date", "title", "distance", "time"].every(name => columns.has(name))) fail("UNSUPPORTED_CSV_SCHEMA", "Use Garmin Connect Activities → Export CSV with Activity Type, Date, Title, Distance and Time (or their Spanish equivalents). Reports/summary CSV files, including report16.csv, are not activity history.");
  if (!input.timezone) fail("TIMEZONE_REQUIRED", "Choose the IANA timezone used by this Activities CSV export.");
  if (input.unitSystem !== "metric" && input.unitSystem !== "imperial") fail("UNIT_SYSTEM_REQUIRED", "Choose the export's metric or imperial unit system before previewing it.");
  const parseDate = localDateParser(input.timezone);
  out.totalRecords = rows.length - 1;
  for (let i = 1; i < rows.length; i++) {
    const sourceRow = i + 1, cells = rows[i];
    try {
      if (cells.length !== rows[0].length) fail("COLUMN_COUNT_MISMATCH", "Row does not have the same number of columns as the header.");
      const get = (name: string) => columns.has(name) ? clean(cells[columns.get(name)!]) : "";
      const rawSport = get("type");
      if (!rawSport || ["total", "totals", "summary", "resumen", "totales"].includes(key(rawSport))) fail("SUMMARY_ROW", "This row is a summary or has no activity type.");
      const sport = sportFor(rawSport), date = parseDate(get("date")), durationMin = duration(get("time"));
      checkNotFuture(date, input.now ?? new Date());
      const rawDistance = get("distance"), withUnit = rawDistance.match(/^(.*?)\s+(km|mi|m|yd)$/i);
      const cellUnit = withUnit?.[2].toLowerCase() as GarminDistanceUnit | undefined;
      if (cellUnit && headerUnit && cellUnit !== headerUnit) fail("CONFLICTING_DISTANCE_UNITS", "Distance cell and column units disagree.");
      const distanceValue = numeric(withUnit ? withUnit[1] : rawDistance, "distance", input.numberFormat, 100_000_000);
      let distanceKm: number | undefined;
      if (distanceValue !== undefined) {
        const explicitUnit = cellUnit || headerUnit || (sport === "swim" ? input.swimDistanceUnit : input.distanceUnit);
        if (sport === "swim" && !explicitUnit) fail("SWIM_DISTANCE_UNIT_REQUIRED", "Choose the swimming distance unit (m, yd, km or mi); it cannot be inferred from the unit system or distance magnitude.");
        if (distanceValue > 0 && !explicitUnit && ["other", "strength"].includes(sport) && !["walking", "walk", "hiking", "hike", "caminar", "caminata", "senderismo"].includes(key(rawSport))) fail("DISTANCE_UNIT_REQUIRED", "Choose an explicit distance unit for this activity type; its distance convention is not known.");
        const distanceUnit = explicitUnit || (input.unitSystem === "imperial" ? "mi" : "km");
        distanceKm = distanceValue * unitFactors[distanceUnit];
        if (distanceKm > 100_000) fail("NUMBER_OUT_OF_RANGE", "Distance exceeds the supported activity range.");
      }
      const sourceId = get("id") || undefined;
      if (sourceId && !/^\d{1,30}$/.test(sourceId)) fail("INVALID_ACTIVITY_ID", "Activity ID must be the original numeric Garmin ID.");
      const avgHr = integerMetric(get("avgHr"), "average heart rate", input.numberFormat, 300, 1);
      const maxHr = integerMetric(get("maxHr"), "maximum heart rate", input.numberFormat, 300, 1);
      if (avgHr !== undefined && maxHr !== undefined && avgHr > maxHr) fail("INCONSISTENT_HEART_RATE", "Average heart rate exceeds maximum heart rate.");
      const workout: GarminFileWorkout = {
        ...identity(date, sport, sourceId), legacyExternalIds: [`garmin-csv:${cells[columns.get("date")!].trim()}:${(cells[columns.get("title")!] || rawSport).trim()}`], source: "garmin", sourceRow, sourceDurationSeconds: durationMin * 60, date, sport, durationMin: storedMinutes(durationMin * 60, out, sourceRow), distanceKm,
        title: (get("title") || rawSport).replace(/\s+/g, " ").slice(0, 300), avgHr, maxHr,
        avgPower: numeric(get("avgPower"), "average power", input.numberFormat, 10_000),
        np: numeric(get("np"), "normalized power", input.numberFormat, 10_000),
        tss: numeric(get("tss"), "training stress score", input.numberFormat, 10_000),
        calories: integerMetric(get("calories"), "calories", input.numberFormat, 1_000_000),
        raw: { format: "activities-csv", activityType: rawSport.slice(0, 100), timezone: input.timezone, sourceDurationSeconds: durationMin * 60 },
      };
      out.workouts.push(workout);
      if (sport === "other") out.diagnostics.push({ row: sourceRow, severity: "warning", code: "SPORT_OTHER", message: "Walking or an unrecognized activity type is preserved as other, not running." });
    } catch (e) { out.rejectedRecords++; out.diagnostics.push(diagnostic(e, sourceRow)); }
  }
}

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {};
const list = (value: unknown): unknown[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function scalar(value: unknown, label: string, optional = false): string {
  if (value === undefined && optional) return "";
  if (typeof value !== "string") fail("INVALID_TCX_FIELD", `TCX ${label} must occur once and contain a scalar value.`);
  return clean(value);
}
function readTcx(text: string, input: GarminFileInput, out: GarminFileParseResult): void {
  if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(text)) fail("UNSAFE_XML", "TCX cannot contain document types or entity declarations.");
  let depth = 0, nodes = 0;
  const markup = text.replace(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  for (const token of markup.matchAll(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g)) {
    if (++nodes > 300_000) fail("XML_LIMIT", "TCX contains too many XML elements.");
    if (/^<\//.test(token[0])) depth--;
    else if (!/^<[!?]/.test(token[0]) && !/\/>$/.test(token[0])) depth++;
    if (depth > 32) fail("XML_LIMIT", "TCX XML is too deeply nested.");
  }
  if (XMLValidator.validate(text) !== true) fail("MALFORMED_XML", "The TCX file is not well-formed XML.");
  const parsed = object(new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, removeNSPrefix: true, processEntities: false, trimValues: false }).parse(text));
  if (Object.keys(parsed).some(name => name !== "TrainingCenterDatabase" && name !== "?xml" && !(name === "#text" && typeof parsed[name] === "string" && !String(parsed[name]).trim()))) fail("MALFORMED_XML", "TCX must have one TrainingCenterDatabase document root.");
  const root = object(parsed.TrainingCenterDatabase);
  if (!Object.keys(root).length) fail("UNSUPPORTED_XML_SCHEMA", "Use a Training Center Database TCX activity export, not a course, workout or generic XML file.");
  const activities = list(object(root.Activities).Activity);
  if (activities.length === 0) fail("NO_ACTIVITIES", "The TCX contains no Activity records; planned workouts and courses are not completed activities.");
  if (activities.length > GARMIN_FILE_MAX_RECORDS) fail("RECORD_LIMIT", "Import at most 10,000 activities per file.");
  out.totalRecords = activities.length;
  activities.forEach((value, index) => {
    const sourceRow = index + 1;
    try {
      const activity = object(value), sportRaw = scalar(activity["@_Sport"], "Sport"), sport = sportFor(sportRaw);
      const date = absoluteDate(scalar(activity.Id, "Id"));
      checkNotFuture(date, input.now ?? new Date());
      const laps = list(activity.Lap);
      if (laps.length === 0 || laps.length > 10_000) fail("INVALID_TCX_LAPS", "A TCX activity needs 1–10,000 lap summaries with duration and distance.");
      let seconds = 0, distanceM = 0, calories = 0, weightedHr = 0, hrSeconds = 0, maxHr: number | undefined;
      let caloriesComplete = true, hrComplete = true, maxComplete = true;
      let lastStart = -Infinity;
      for (const raw of laps) {
        const lap = object(raw), start = absoluteDate(scalar(lap["@_StartTime"], "lap StartTime"));
        if (start.getTime() < date.getTime() || start.getTime() < lastStart) fail("INCONSISTENT_TCX_TIME", "TCX lap starts are before the activity or out of order.");
        lastStart = start.getTime();
        checkNotFuture(start, input.now ?? new Date());
        const lapSeconds = numeric(scalar(lap.TotalTimeSeconds, "lap TotalTimeSeconds"), "lap duration", "decimal-dot", 31 * 86400);
        const lapDistance = numeric(scalar(lap.DistanceMeters, "lap DistanceMeters"), "lap distance", "decimal-dot", 100_000_000);
        if (lapSeconds === undefined || lapDistance === undefined) fail("INVALID_TCX_LAPS", "Each TCX lap needs measured duration and distance.");
        seconds += lapSeconds; distanceM += lapDistance;
        const c = integerMetric(scalar(lap.Calories, "lap Calories", true), "calories", "decimal-dot", 1_000_000);
        if (c === undefined) caloriesComplete = false; else calories += c;
        const h = integerMetric(scalar(object(lap.AverageHeartRateBpm).Value, "lap average heart rate", true), "average heart rate", "decimal-dot", 300, 1);
        const max = integerMetric(scalar(object(lap.MaximumHeartRateBpm).Value, "lap maximum heart rate", true), "maximum heart rate", "decimal-dot", 300, 1);
        if (h === undefined) hrComplete = false; else { weightedHr += h * lapSeconds; hrSeconds += lapSeconds; }
        if (max === undefined) maxComplete = false; else maxHr = Math.max(maxHr ?? 0, max);
        if (h !== undefined && max !== undefined && h > max) fail("INCONSISTENT_HEART_RATE", "TCX average heart rate exceeds maximum heart rate.");
      }
      if (seconds <= 0 || seconds > 31 * 86400 || distanceM > 100_000_000 || calories > 1_000_000) fail("INVALID_TCX_TOTALS", "TCX activity totals are outside supported bounds.");
      out.workouts.push({ ...identity(date, sport), legacyExternalIds: [`tcx:${activity.Id as string}`], source: "garmin", sourceRow, sourceDurationSeconds: seconds, date, sport, title: `${sportRaw.slice(0, 100)} activity`, durationMin: storedMinutes(seconds, out, sourceRow), distanceKm: distanceM / 1000, calories: caloriesComplete ? calories : undefined, avgHr: hrComplete && hrSeconds > 0 ? Math.round(weightedHr / hrSeconds) : undefined, maxHr: maxComplete ? maxHr : undefined, raw: { format: "tcx", activityType: sportRaw.slice(0, 100), timing: "lap-summaries", sourceDurationSeconds: seconds, heartRateAggregation: "duration-weighted lap summaries" } });
      if (!caloriesComplete || !hrComplete || !maxComplete) out.diagnostics.push({ row: sourceRow, severity: "warning", code: "INCOMPLETE_TCX_METRICS", message: "Some lap calorie or heart-rate summaries are absent; incomplete activity metrics remain unavailable." });
      if (sport === "other") out.diagnostics.push({ row: sourceRow, severity: "warning", code: "SPORT_OTHER", message: "This TCX sport is preserved as other; it is not inferred from trackpoints." });
    } catch (e) { out.rejectedRecords++; out.diagnostics.push(diagnostic(e, sourceRow)); }
  });
}
function deduplicate(out: GarminFileParseResult): void {
  const byId = new Map<string, GarminFileWorkout>();
  const conflicts = new Set<string>();
  const fingerprint = (w: GarminFileWorkout) => JSON.stringify([w.date.toISOString(), w.sport, w.sourceDurationSeconds, w.distanceKm, w.avgHr, w.maxHr, w.avgPower, w.np, w.tss, w.calories]);
  for (const workout of out.workouts) {
    const previous = byId.get(workout.externalId);
    if (conflicts.has(workout.externalId)) { out.rejectedRecords++; out.diagnostics.push({ row: workout.sourceRow, severity: "error", code: "CONFLICTING_IDENTITY", message: "This activity identity has conflicting values in the same file; review the source." }); }
    else if (!previous) byId.set(workout.externalId, workout);
    else if (fingerprint(previous) === fingerprint(workout)) { out.skippedRecords++; out.diagnostics.push({ row: workout.sourceRow, severity: "skipped", code: "DUPLICATE_IN_FILE", message: "An identical activity already appears in this file." }); }
    else {
      conflicts.add(workout.externalId); byId.delete(workout.externalId); out.rejectedRecords += 2;
      for (const row of [previous.sourceRow, workout.sourceRow]) out.diagnostics.push({ row, severity: "error", code: "CONFLICTING_IDENTITY", message: "Activities with the same identity have conflicting values; neither will be imported." });
    }
  }
  out.workouts = Array.from(byId.values());
}

/** Pure, bounded preview parser; writes nothing and never expands archives. */
export function parseGarminFile(input: GarminFileInput): GarminFileParseResult {
  const out: GarminFileParseResult = { format: "unsupported", workouts: [], diagnostics: [], totalRecords: 0, rejectedRecords: 0, skippedRecords: 0, coverage: { start: null, end: null, accepted: 0, completeArchive: false }, fatal: false };
  try {
    if (!input || typeof input.filename !== "string" || !(typeof input.content === "string" || input.content instanceof Uint8Array)) fail("INVALID_INPUT", "Select a Garmin export file.");
    const bytes = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content;
    if (bytes.byteLength > GARMIN_FILE_MAX_BYTES) fail("FILE_TOO_LARGE", "Garmin files must be at most 10 MiB; split large activity exports.");
    if (bytes.byteLength === 0) fail("EMPTY_FILE", "The file is empty.");
    const extension = input.filename.toLowerCase().split(".").pop();
    if (extension === "zip" || (bytes[0] === 0x50 && bytes[1] === 0x4b)) fail("ZIP_UNSUPPORTED", "ZIP archives are not supported. Extract them yourself and select an Activities CSV or individual TCX file. Archive contents have not been inspected.");
    if (extension === "fit" || (bytes.length >= 12 && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === ".FIT")) fail("FIT_UNSUPPORTED", "Binary FIT import is not supported by this file preview. Export the activity as TCX or export the Activities list as CSV.");
    if (!["csv", "tcx", "xml"].includes(extension || "")) fail("UNSUPPORTED_FILE_TYPE", "Select an Activities .csv or a .tcx activity export.");
    if (input.numberFormat !== undefined && !["decimal-dot", "decimal-comma"].includes(input.numberFormat)) fail("INVALID_NUMBER_FORMAT", "Choose decimal-dot or decimal-comma format.");
    for (const unit of [input.distanceUnit, input.swimDistanceUnit]) if (unit !== undefined && !units.has(unit)) fail("INVALID_DISTANCE_UNIT", "Distance units must be km, mi, m or yd.");
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""); } catch { return fail("INVALID_ENCODING", "Use an original UTF-8 text export; binary and other encodings are not supported."); }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) fail("BINARY_CONTENT", "The selected file contains binary control data rather than a text export.");
    out.format = extension === "csv" ? "activities-csv" : "tcx";
    if (out.format === "activities-csv") readCsv(text, input, out); else readTcx(text, input, out);
    deduplicate(out);
    const dates = out.workouts.map(w => w.date.toISOString()).sort();
    out.coverage = { start: dates[0] || null, end: dates[dates.length - 1] || null, accepted: out.workouts.length, completeArchive: false };
    out.diagnostics.push({ severity: "warning", code: "PARTIAL_HISTORY", message: `Preview contains ${out.workouts.length} accepted, ${out.rejectedRecords} rejected and ${out.skippedRecords} skipped records. This file does not establish complete Garmin history and contains no wellness history.` });
  } catch (e) { out.fatal = true; out.workouts = []; out.diagnostics.push(diagnostic(e)); }
  return out;
}
