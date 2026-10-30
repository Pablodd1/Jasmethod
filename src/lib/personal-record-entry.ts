import { clockSeconds, clockText } from "./metric-entry";

export const RECORD_SPORTS = ["run", "bike", "swim", "triathlon", "hyrox", "strength"] as const;
export const RECORD_METRICS = ["time", "pace", "speed", "power", "distance", "load", "reps"] as const;
export type RecordDraft = { sport: string; metric: string; label: string; result: string; distance: string; distanceUnit: string; date: string; units: string };
export function personalRecordEntry(draft: RecordDraft, today: string) {
  if (!draft || ["sport","metric","label","result","distance","distanceUnit","date","units"].some(key=>typeof (draft as any)[key]!=="string")) throw Error("Supply the result fields with their units.");
  if (!RECORD_SPORTS.includes(draft.sport as any) || !RECORD_METRICS.includes(draft.metric as any)) throw Error("Choose a sport and result type.");
  const label = draft.label.trim();
  if (!label) throw Error("Name the race, distance or station (for example 5K or SkiErg 1000 m).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Number.isFinite(Date.parse(draft.date)) || new Date(draft.date).toISOString().slice(0,10) !== draft.date || draft.date > today) throw Error("Enter the actual result date, not a future date.");
  let unit: string, value: number;
  if (draft.metric === "time" || draft.metric === "pace") {
    value = clockSeconds(draft.result) / 60;
    unit = draft.metric === "time" ? "min" : draft.units;
    if (draft.metric === "pace" && !["min/km", "min/mi", "min/100m", "min/100yd"].includes(unit)) throw Error("Choose pace units.");
  } else {
    if (!/^\d+(?:[.,]\d+)?$/.test(draft.result.trim())) throw Error("Enter a positive result with its units.");
    value = Number(draft.result.replace(",", "."));
    unit = draft.metric === "speed" ? draft.units : draft.metric === "power" ? "W" : draft.metric === "load" ? draft.units : draft.metric === "reps" ? "reps" : draft.distanceUnit;
    if (draft.metric === "speed" && !["km/h", "mph"].includes(unit)) throw Error("Choose speed units.");
    if (draft.metric === "load" && !["kg", "lb"].includes(unit)) throw Error("Choose load units.");
  }
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000 || (draft.metric === "time" && value > 10080) || (draft.metric === "pace" && value > 120)) throw Error("Review the result and units.");
  if (draft.metric === "reps" && !Number.isInteger(value)) throw Error("Repetitions must be a whole number.");
  if (!["km", "mi", "m"].includes(draft.distanceUnit)) throw Error("Choose distance units.");
  let distance = "";
  if (draft.distance.trim() && draft.metric !== "distance") {
    if (!/^\d+(?:[.,]\d+)?$/.test(draft.distance.trim()) || Number(draft.distance.replace(",", ".")) <= 0) throw Error("Enter a positive distance.");
    distance = ` · ${draft.distance.replace(",", ".")} ${draft.distanceUnit}`;
  }
  const fullLabel = `${draft.sport} · ${label}${distance} · ${draft.metric}`;
  if (fullLabel.length > 60) throw Error("Use a shorter result name (maximum 60 characters including sport and distance).");
  return {label:fullLabel, value, unit, date:draft.date};
}
export function personalRecordText(value: number, unit: string) {
  const duration=(seconds:number)=>{if(seconds<3600)return clockText(seconds);const [minutes,remainder]=clockText(seconds%3600).split(":");return `${Math.floor(seconds/3600)}:${minutes.padStart(2,"0")}:${remainder}`;};
  if (unit === "sec") return duration(value);
  if (unit === "min") return duration(value * 60);
  if (unit.startsWith("min/")) return `${clockText(value * 60)}/${unit.slice(4)}`;
  return `${value} ${unit}`;
}
