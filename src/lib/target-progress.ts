import { dateKey } from "./dates";
import { type PlanningTarget, parsePlanningTarget, setupNumber } from "./planning-target";

export const TARGET_PROGRESS_VERSION = "target-progress-v1";
// Reuse the launch's 90-day evidence window. This is a freshness policy, not
// a claim that capacity remains constant or that any test predicts success.
export const TARGET_BENCHMARK_MAX_AGE_DAYS = 90;
export type ProgressUnit = "sec/km" | "min/km" | "sec/mi" | "min/mi" | "sec/100m" | "min/100m" | "sec/100yd" | "min/100yd" | "km/h" | "mph" | "m/s" | "W";
const PACE_DISTANCE: Partial<Record<ProgressUnit, number>> = {"sec/km":1000,"min/km":1000,"sec/mi":1609.344,"min/mi":1609.344,"sec/100m":100,"min/100m":100,"sec/100yd":91.44,"min/100yd":91.44};
export const PROGRESS_UNITS: ProgressUnit[] = ["sec/km","min/km","sec/mi","min/mi","sec/100m","min/100m","sec/100yd","min/100yd","km/h","mph","m/s","W"];
/** Exact dimensional conversion only. Minutes are decimal minutes, never m.ss. */
export function convertProgressValue(value: number, from: ProgressUnit, to: ProgressUnit): number {
  if (!Number.isFinite(value) || value <= 0 || !PROGRESS_UNITS.includes(from) || !PROGRESS_UNITS.includes(to)) throw Error("Use a finite positive measurement with supported units");
  if (from === "W" || to === "W") {
    if (from !== to) throw Error("Power cannot be converted to pace or speed");
    return value;
  }
  const distance = PACE_DISTANCE[from];
  const speed = distance ? distance / (value * (from.startsWith("min/") ? 60 : 1)) : from === "km/h" ? value / 3.6 : from === "mph" ? value * 1609.344 / 3600 : value;
  const targetDistance = PACE_DISTANCE[to];
  const result = targetDistance ? targetDistance / speed / (to.startsWith("min/") ? 60 : 1) : to === "km/h" ? speed * 3.6 : to === "mph" ? speed * 3600 / 1609.344 : speed;
  if (!Number.isFinite(result) || result <= 0) throw Error("Measurement is outside supported numeric bounds");
  return result;
}
export function convertProgressRange(low: number, high: number, from: ProgressUnit, to: ProgressUnit): [number, number] {
  if (low > high) throw Error("Measurement range must be ordered");
  const converted = [convertProgressValue(low, from, to), convertProgressValue(high, from, to)];
  return [Math.min(...converted), Math.max(...converted)];
}
export type ProgressSource = "athlete_reported" | "coach_entered" | "saved_benchmark_source_unverified";
export interface ProgressObservation {
  id: string;
  metric: "pace" | "power" | "speed";
  sport: PlanningTarget["sport"];
  context: NonNullable<PlanningTarget["context"]>;
  contextDescription?: string;
  value: number;
  unit: ProgressUnit;
  observedAt: string;
  enteredAt: string | null;
  source: ProgressSource;
  sourceRecord: "benchmark" | "manual_report";
  label: string;
  formula?: string;
  note?: string;
  supersedesId?: string;
}
export interface ProgressBenchmark {
  id: string; date: Date; type: string; result: number | null; skipped: boolean; completed: boolean;
  source?: ProgressSource; enteredAt?: string | null;
}
export interface ProgressComparison {
  observation: ProgressObservation;
  currentValue: number;
  targetValue: number;
  unit: ProgressUnit;
  remainingGap: number;
  status: "below_target" | "at_or_beyond_target";
  ageDays: number;
}
export interface TargetProgress {
  version: typeof TARGET_PROGRESS_VERSION;
  target: PlanningTarget | null;
  targetSource: "athlete_reported" | "coach_set" | null;
  targetSavedAt: string | null;
  planningWeeks: number | null;
  horizon: {targetDate: string | null; daysRemaining: number | null; state: "unknown" | "future" | "today" | "past"};
  benchmark: ProgressComparison | null;
  reported: ProgressComparison | null;
  benchmarkReason: string | null;
  reportedReason: string | null;
  observations: ProgressObservation[];
  supersededIds: string[];
  limitations: string[];
}
export const TARGET_PROGRESS_LIMITATIONS = [
  "A target is an aspiration, not evidence of current capacity. The gap is arithmetic, not a probability or predicted completion date.",
  "Benchmarks and manual reports retain their original context. A 5 km average is not a measured sustainable threshold; reported results are not verified sensor measurements.",
  "Numeric target-driven progression requires qualified coaching review. A baseline-only plan does not promise to achieve this target.",
];
export function benchmarkObservation(test: ProgressBenchmark): ProgressObservation | null {
  if (!test.completed || test.skipped || test.result == null || !Number.isFinite(test.result) || !Number.isFinite(test.date.getTime())) return null;
  const base = {id: test.id, observedAt:test.date.toISOString(), enteredAt:test.enteredAt ?? null, source:test.source ?? "saved_benchmark_source_unverified" as const, sourceRecord:"benchmark" as const};
  if (test.type === "run5k" && test.result >= 600 && test.result <= 7200) return {...base,metric:"pace",sport:"run",context:"run5k",value:test.result/5,unit:"sec/km",label:"Reported 5 km average pace",formula:"5 km total seconds / 5; exact distance-average conversion, not a threshold estimate"};
  if (test.type === "ftp" && test.result >= 20 && test.result <= 700) return {...base,metric:"power",sport:"bike",context:"ftp",value:test.result,unit:"W",label:"Reported cycling FTP test"};
  if (test.type === "swim" && test.result >= 30 && test.result <= 600) return {...base,metric:"pace",sport:"swim",context:"swim_threshold",value:test.result,unit:"sec/100m",label:"Reported swim threshold/CSS pace"};
  return null; // CP, LTHR, other sports and unknown tests are not interchangeable.
}
function sameContext(target: PlanningTarget, observation: ProgressObservation) {
  return target.sport === observation.sport && target.context === observation.context && (target.context !== "custom" || target.contextDescription === observation.contextDescription)
    && (target.metric === "power" ? observation.metric === "power" : ["pace","speed"].includes(target.metric) && ["pace","speed"].includes(observation.metric));
}
function compare(target: PlanningTarget, observation: ProgressObservation, now: Date, timezone: string): ProgressComparison {
  const currentValue = convertProgressValue(observation.value, observation.unit, target.unit!);
  const rawGap = target.metric === "pace" ? currentValue - target.value! : target.value! - currentValue;
  // Relative tolerance prevents exact unit conversions from inventing a tiny gap.
  const remainingGap = Math.abs(rawGap) <= 1e-10 * Math.max(currentValue,target.value!) ? 0 : rawGap;
  return {observation,currentValue,targetValue:target.value!,unit:target.unit!,remainingGap:Math.max(0,remainingGap),status:remainingGap <= 0 ? "at_or_beyond_target" : "below_target",ageDays:calendarDays(observation.observedAt,now,timezone)};
}
function calendarDays(observedAt: string, now: Date, timezone: string) {
  const observedKey = /^\d{4}-\d{2}-\d{2}$/.test(observedAt) ? observedAt : dateKey(new Date(observedAt),timezone);
  return (Date.parse(dateKey(now,timezone))-Date.parse(observedKey))/86400000;
}
export function buildTargetProgress(input: {target: PlanningTarget | null; targetSource?: TargetProgress["targetSource"]; targetSavedAt?: string | null; planningWeeks?: number | null; benchmarks: ProgressBenchmark[]; reports?: ProgressObservation[]; now?: Date; timezone?: string}): TargetProgress {
  const {target} = input, now = input.now ?? new Date(), timezone = input.timezone ?? "UTC";
  const daysRemaining = target?.targetDate ? (Date.parse(target.targetDate)-Date.parse(dateKey(now,timezone)))/86400000 : null;
  const reports = input.reports ?? [];
  const superseded = new Set(reports.map(r=>r.supersedesId).filter(Boolean));
  const observations = [...input.benchmarks.map(benchmarkObservation).filter((v): v is ProgressObservation=>v!==null),...reports].sort((a,b)=>b.observedAt.localeCompare(a.observedAt)||(b.enteredAt??"").localeCompare(a.enteredAt??"")||b.id.localeCompare(a.id));
  const view: TargetProgress = {version:TARGET_PROGRESS_VERSION,target,targetSource:input.targetSource??null,targetSavedAt:input.targetSavedAt??null,planningWeeks:input.planningWeeks??null,horizon:{targetDate:target?.targetDate??null,daysRemaining,state:daysRemaining===null?"unknown":daysRemaining<0?"past":daysRemaining===0?"today":"future"},benchmark:null,reported:null,benchmarkReason:null,reportedReason:null,observations,supersededIds:[...superseded] as string[],limitations:[...TARGET_PROGRESS_LIMITATIONS]};
  for (const [kind,field,reason] of [["benchmark","benchmark","benchmarkReason"],["manual_report","reported","reportedReason"]] as const) {
    if (!target || target.value == null || !target.unit) {view[reason]="No numeric target selected. Fitness and completion are not inferred from a performance number.";continue;}
    if (!target.context) {view[reason]="Choose the target's test or measurement context before comparing unlike results.";continue;}
    const relevant = observations.filter(o=>o.sourceRecord===kind&&!superseded.has(o.id)&&sameContext(target,o));
    if (!relevant.length) {view[reason]=kind==="benchmark"?"No completed benchmark matches this sport, metric and test context. Other sports and threshold proxies are not substituted.":"No manual report matches this target's sport and measurement context.";continue;}
    const usable = relevant.filter(o=>Number.isFinite(Date.parse(o.observedAt))&&(/^\d{4}-\d{2}-\d{2}$/.test(o.observedAt)||Date.parse(o.observedAt)<=now.getTime())&&calendarDays(o.observedAt,now,timezone)>=0&&calendarDays(o.observedAt,now,timezone)<=TARGET_BENCHMARK_MAX_AGE_DAYS);
    if (!usable.length) {view[reason]=`Matching evidence is stale (older than ${TARGET_BENCHMARK_MAX_AGE_DAYS} days), future-dated or invalid. Report a recent relevant result only if safe; no test is required to use baseline-only planning.`;continue;}
    view[field]=compare(target,usable[0],now,timezone);
  }
  return view;
}
export function parseProgressReport(value: unknown, target: PlanningTarget | null, now = new Date(), timezone = "UTC"): Omit<ProgressObservation,"id"|"source"|"enteredAt"> {
  if (!value || typeof value!=="object" || Array.isArray(value)) throw Error("Invalid measurement report");
  if (!target || target.value==null || !target.unit || !target.context) throw Error("Save a numeric target with explicit test or measurement context first");
  const v=value as Record<string,unknown>;
  if (v.contextConfirmed!==true) throw Error("Confirm that the reported result uses the same sport and measurement context as this target");
  if (typeof v.unit!=="string" || !PROGRESS_UNITS.includes(v.unit as ProgressUnit)) throw Error("Choose supported measurement units");
  const unit=v.unit as ProgressUnit;
  const result=setupNumber(v.value,"reported result",0.000001,1000000,false);
  const canonical=convertProgressValue(result,unit,target.unit);
  parsePlanningTarget({...target,value:canonical},now,timezone,true); // matching metric-specific sanity limits, never clamp
  if (typeof v.observedAt!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.observedAt) || !Number.isFinite(Date.parse(v.observedAt)) || new Date(v.observedAt).toISOString().slice(0,10)!==v.observedAt || v.observedAt>dateKey(now,timezone)) throw Error("Enter an actual observation date that is not in the future");
  if (v.note!=null && typeof v.note!=="string") throw Error("Measurement note must be text");
  if (v.supersedesId!=null && (typeof v.supersedesId!=="string" || !v.supersedesId.trim())) throw Error("Invalid correction reference");
  if (v.supersedesId && (typeof v.note!=="string" || !v.note.trim())) throw Error("Explain the correction; the original report remains in history");
  return {metric:target.metric as ProgressObservation["metric"],sport:target.sport,context:target.context,...(target.contextDescription?{contextDescription:target.contextDescription}:{}),value:result,unit,observedAt:v.observedAt,sourceRecord:"manual_report",label:"Separately reported result",...(typeof v.note==="string"?{note:v.note.trim().slice(0,1000)}:{}),...(typeof v.supersedesId==="string"?{supersedesId:v.supersedesId}:{})};
}
