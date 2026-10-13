/** A saved reference is not evidence of a measurement. Imports never replace it here. */
export const ONBOARDING_ANCHORS = [
  { field: "lthr", en: "Threshold heart rate", es: "Frecuencia cardíaca umbral", unit: "bpm", min: 60, max: 230 },
  { field: "maxHr", en: "Maximum heart rate", es: "Frecuencia cardíaca máxima", unit: "bpm", min: 80, max: 240 },
  { field: "ftp", en: "Cycling FTP", es: "FTP ciclismo", unit: "W", min: 20, max: 700 },
  { field: "runPaceBase", en: "Running threshold pace", es: "Ritmo umbral de carrera", unit: "sec/km", min: 120, max: 1200 },
  { field: "swimPaceBase", en: "Swimming threshold pace", es: "Ritmo umbral de natación", unit: "sec/100m", min: 30, max: 600 },
] as const;

export function missingOnboardingAnchors(profile: Record<string, unknown>) {
  return ONBOARDING_ANCHORS.filter(({ field }) => profile[field] == null || profile[field] === "");
}

export type ManualPersonalBest = { label: string; value: number; unit: string; date: string };
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Invalid saved records are a review blocker, never an empty list to overwrite. */
export function readManualPersonalBests(raw: unknown): ManualPersonalBest[] | null {
  if (raw == null || raw === "") return [];
  if (typeof raw === "string" && raw.length > 40_000) return null;
  try {
    const rows: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(rows) || rows.length > 50) return null;
    if (rows.some(row => !isRecord(row) || typeof row.label !== "string" || !row.label.trim() || row.label.length > 60 || typeof row.value !== "number" || !Number.isFinite(row.value) || typeof row.unit !== "string" || row.unit.length > 20 || typeof row.date !== "string" || row.date.length > 10)) return null;
    return rows as ManualPersonalBest[];
  } catch { return null; }
}

export function appendManualPersonalBest(raw: unknown, input: {label:string;value:string;unit:string;date:string}, today: string): string {
  const rows = readManualPersonalBests(raw);
  if (!rows) throw Error("Saved personal bests could not be verified. Review them in your profile before adding another.");
  const label = input.label.trim();
  const value = Number(input.value);
  if (!label || label.length > 60 || !input.value.trim() || !Number.isFinite(value) || value <= 0 || !input.unit || input.unit.length > 20) throw Error("Add a label, a positive result and its units, or leave the personal best empty.");
  if (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0,10) !== input.date || input.date > today)) throw Error("Use the actual result date, or leave it unknown.");
  if (rows.some(row => row.label.trim().toLowerCase() === label.toLowerCase())) throw Error("That personal best is already saved. You can edit it later in your profile.");
  if (rows.length >= 50) throw Error("Your profile already has 50 personal bests. Review them before adding another.");
  return JSON.stringify([...rows, {label,value,unit:input.unit,date:input.date}]);
}

type RecordedResult = {id:string;name:string;distance:string;resultMin:number|null;date:Date;source:string|null};
/** These are actual stored race results, not predictions, goals or activity-derived PB estimates. */
export function onboardingRaceResults(rows: RecordedResult[], now = new Date()) {
  return rows.filter(row => Number.isFinite(row.resultMin) && Number(row.resultMin) > 0 && Number.isFinite(row.date.getTime()) && row.date <= now)
    .map(row => ({id:row.id,name:row.name,distance:row.distance,minutes:row.resultMin!,date:row.date.toISOString(),source:row.source,kind:row.source === "manual" ? "manual" as const : row.source ? "imported" as const : "unverified" as const}));
}

export function observationKind(source: string, method?: string | null) {
  if (source === "manual" || method === "manual_entry") return "manual";
  if (method === "derived" || method === "estimated") return "estimated";
  if (method === "provider_profile_reported") return "reported";
  if (method === "optical_sensor" || method === "chest_strap") return "measured";
  return "imported";
}
