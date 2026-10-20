import { fromZonedTime } from "date-fns-tz";

/**
 * Garmin Connect "Activities.csv" (bulk export from Activities → All Activities → Export CSV).
 *
 * What was verified (synthetic fixtures in src/lib/import-files.test.ts; NO real export was available):
 *  - the English column names the previous importer used ("Activity Type", "Date", "Time", "Avg HR", ...);
 *  - quoted fields with embedded commas and newlines, doubled quotes, UTF-8 BOM, CRLF.
 * What is NOT verified, and therefore refused rather than guessed:
 *  - non-English headers (a Spanish-language Garmin account exports localized headers; the old importer
 *    silently imported 0 rows from them). The result reports `unrecognized_columns` so the athlete is told
 *    to use a TCX export instead. Add aliases only from a real sample.
 *  - decimal-comma numbers ("54,09"): the old importer stripped every comma and turned them into 5409.
 *    Such values are now `null` (unknown) and counted, never converted.
 * Local timestamps in the file carry no offset; they are interpreted in the athlete's saved timezone (the old
 * importer used the server's timezone, which moved early-morning activities to the previous day).
 */

export interface GarminActivity {
  date: Date;
  sport: "swim" | "bike" | "run";
  title: string;
  durationMin: number;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgPower: number | null;
  np: number | null;
  tss: number | null;
  calories: number | null;
  externalId: string;
}
export type CsvSkipReason = "unsupported_activity_type" | "bad_date" | "bad_duration" | "blank_row";
export interface GarminCsvResult {
  ok: boolean;
  error?: "empty" | "unrecognized_columns";
  /** Header names seen (column titles only, never row values), capped, so the athlete can report a mismatch. */
  foundColumns: string[];
  activities: GarminActivity[];
  rows: number;
  skipped: Record<CsvSkipReason, number>;
  /** Activity types that were not imported, with counts (e.g. "Strength Training": 4). */
  unsupportedTypes: Record<string, number>;
  /** Numeric cells that were unknown or unusable and became null instead of a guessed number. */
  ambiguousNumbers: number;
  implausibleValues: number;
}

/** RFC 4180-style tokenizer over the whole text so quoted newlines survive. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') { if (body[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && body[i + 1] === "\n") i++; row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const REQUIRED = { type: "Activity Type", date: "Date", time: "Time" } as const;
const norm = (s: string) => s.trim().replace(/\s+/g, " ");

/** "1,620" and "54.09" parse; "54,09" (decimal comma) and "--" do not. Returns null when unknown. */
export function parseGarminNumber(raw: string | undefined): { value: number | null; ambiguous: boolean } {
  const text = (raw ?? "").replace(/^'/, "").trim();
  if (text === "" || text === "--" || text === "—") return { value: null, ambiguous: false };
  if (/^-?\d+(\.\d+)?$/.test(text)) return { value: Number(text), ambiguous: false };
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) return { value: Number(text.replace(/,/g, "")), ambiguous: false };
  return { value: null, ambiguous: true };
}

const inRange = (v: number | null, lo: number, hi: number) => v !== null && v >= lo && v <= hi;

export function parseGarminActivitiesCsvDetailed(csv: string, timeZone = "UTC"): GarminCsvResult {
  const result: GarminCsvResult = { ok: false, foundColumns: [], activities: [], rows: 0, ambiguousNumbers: 0, implausibleValues: 0,
    skipped: { unsupported_activity_type: 0, bad_date: 0, bad_duration: 0, blank_row: 0 }, unsupportedTypes: {} };
  const table = parseCsvRows(csv);
  if (!table.length || table.every(r => r.every(c => c.trim() === ""))) return { ...result, error: "empty" };
  const header = table[0].map(norm);
  result.foundColumns = header.slice(0, 40).map(h => h.slice(0, 60));
  const col = (name: string) => header.findIndex(h => h === name);
  const iType = col(REQUIRED.type), iDate = col(REQUIRED.date), iTime = col(REQUIRED.time);
  if (iType < 0 || iDate < 0 || iTime < 0) return { ...result, error: "unrecognized_columns" };
  const iTitle = col("Title"), iDist = col("Distance"), iCal = col("Calories"), iAvgHr = col("Avg HR"), iMaxHr = col("Max HR"), iAvgPwr = col("Avg Power");
  const iNP = header.findIndex(h => h.startsWith("Normalized Power")), iTss = header.findIndex(h => h.startsWith("Training Stress Score"));
  result.ok = true;

  const read = (cells: string[], index: number, lo: number, hi: number): number | null => {
    if (index < 0) return null;
    const { value, ambiguous } = parseGarminNumber(cells[index]);
    if (ambiguous) { result.ambiguousNumbers++; return null; }
    if (value !== null && !inRange(value, lo, hi)) { result.implausibleValues++; return null; }
    return value;
  };

  for (const cells of table.slice(1)) {
    if (cells.every(c => c.trim() === "")) { result.skipped.blank_row++; continue; }
    result.rows++;
    const type = (cells[iType] || "").trim();
    // Running only: walking and hiking are not running load, and other types have no model here yet.
    const sport: GarminActivity["sport"] | null = /swim/i.test(type) ? "swim" : /cycling|bike|biking/i.test(type) ? "bike" : /run|jog/i.test(type) && !/walk/i.test(type) ? "run" : null;
    if (!sport) { result.skipped.unsupported_activity_type++; const key = type.slice(0, 60) || "(blank)"; result.unsupportedTypes[key] = (result.unsupportedTypes[key] ?? 0) + 1; continue; }
    const dateText = (cells[iDate] || "").trim();
    const dm = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/.exec(dateText);
    let date: Date | null = null;
    if (dm) { const d = fromZonedTime(`${dm[1]}T${dm[2]}:${dm[3] ?? "00"}`, timeZone); date = Number.isFinite(d.getTime()) ? d : null; }
    if (!date) { result.skipped.bad_date++; continue; }
    const tm = /^(\d+):(\d{2}):(\d{2})(?:\.\d+)?$/.exec((cells[iTime] || "").trim());
    const seconds = tm ? +tm[1] * 3600 + +tm[2] * 60 + +tm[3] : NaN;
    if (!Number.isFinite(seconds) || seconds < 30 || seconds > 72 * 3600) { result.skipped.bad_duration++; continue; }

    const rawDistance = read(cells, iDist, 0, sport === "swim" ? 100_000 : 5000);
    // Garmin writes swims in METRES ("1,620") and run/bike in km ("54.09").
    const distanceKm = rawDistance === null ? null : sport === "swim" ? Math.round(rawDistance) / 1000 : rawDistance;
    const title = (cells[iTitle] || type).trim();
    result.activities.push({
      date, sport, title, durationMin: Math.max(1, Math.round(seconds / 60)), distanceKm,
      avgHr: read(cells, iAvgHr, 25, 250), maxHr: read(cells, iMaxHr, 25, 260), avgPower: read(cells, iAvgPwr, 0, 2500),
      np: read(cells, iNP, 0, 2500), tss: read(cells, iTss, 0, 2000), calories: read(cells, iCal, 0, 30000),
      // Unchanged format so a re-import updates, rather than duplicates, rows stored by the previous importer.
      externalId: `garmin-csv:${dateText}:${title}`,
    });
  }
  return result;
}
