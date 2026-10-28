import { prisma } from "./db";
import { addDaysKey, dateKey, localDate } from "./dates";
import { activityActualMinutes, groupActivityEvidence, type ActivityDecision, type ActivityEvidenceRow } from "./activity-evidence";
import { readActivityDecisions } from "./activity-reconciliation";
import { applyExecutionFeedback, type ExecutionFeedback } from "./execution-feedback";
import type { Adaptation } from "./adaptive";
import { INTERVALS_ALLOWED_UPSTREAM, intervalsUpstreamFromNotes, provenanceOf } from "./strava-provenance";
import { derivedActivityPolicy } from "./derived-activity-policy";

export const DAILY_INPUT_CONTEXT_VERSION = "daily-input-context-v1";
export const DAILY_INPUT_LIMIT = 100;
const rules = {
  sleepHours: { type: "sleep_hours", unit: "h", min: 0, max: 24 },
  hrvRmssd: { type: "hrv_rmssd", unit: "ms", min: 1, max: 300 },
  hrvSdnn: { type: "hrv_sdnn", unit: "ms", min: 1, max: 300 },
  restingHr: { type: "resting_hr", unit: "bpm", min: 25, max: 150 },
} as const;
export type DailyMetricKey = keyof typeof rules;
export interface DailyInputObservation {
  id: string; userId: string; observedAt: Date | string; createdAt?: Date | string | null;
  metricType: string; value: number; unit: string | null; source: string;
  measurementMethod?: string | null; qualityFlag?: string | null;
  originalSource?: string | null;
}
export interface DailyInputWorkout extends ActivityEvidenceRow {
  id: string; userId: string; createdAt?: Date | string | null;
  notes?: string | null; originalSource?: string | null;
}
export interface DailyInputConnector { provider: string; status: string; lastSyncAt: Date | string | null }
type MetricStatus = "usable" | "missing" | "stale" | "conflicting" | "invalid";
const millis = (value: Date | string | null | undefined) => value == null ? NaN : new Date(value).getTime();
const iso = (value: Date | string | null | undefined) => Number.isFinite(millis(value)) ? new Date(value!).toISOString() : null;
const token = (value: string | null | undefined) => value && /^[a-zA-Z0-9_-]{1,50}$/.test(value) ? value : null;
const providers = new Set(["manual","manual_sport_local","plan","garmin","garmin_direct","coros","apple","apple_health","whoop","oura","strava","intervals","tcx","fit","file","garmin_csv","jmm","app"]);
const upstreamSources = new Set<string>([...INTERVALS_ALLOWED_UPSTREAM,"STRAVA",...Array.from(providers,source=>source.toUpperCase())]);
const methods = new Set(["manual_entry","derived","estimated","optical_sensor","chest_strap","device_sync","provider_profile_reported","uploaded_file"]);
const providerSource = (value: string | null | undefined) => value && providers.has(value.toLowerCase()) ? value.toLowerCase() : "unknown";
const upstreamSource = (value: string | null | undefined) => value && upstreamSources.has(value.toUpperCase()) ? value.toUpperCase() : null;
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
function classification(source: string, method: string | null | undefined) {
  if (["manual","manual_sport_local"].includes(source) || method === "manual_entry") return "self_reported" as const;
  if (method === "derived" || method === "estimated") return "estimated" as const;
  if (method === "optical_sensor" || method === "chest_strap") return "measured" as const;
  if (method === "device_sync" || method === "provider_profile_reported") return "provider_reported" as const;
  return "unverified" as const;
}
function metricValue(row: DailyInputObservation, timezone: string, today: string) {
  const method = row.measurementMethod && methods.has(row.measurementMethod) ? row.measurementMethod : null, source = providerSource(row.source);
  const originalSource = upstreamSource(row.originalSource);
  return {
    id: row.id, value: row.value, unit: row.unit!, source, originalSource,
    observedAt: iso(row.observedAt)!, observedDay: dateKey(new Date(row.observedAt), timezone),
    // The schema stores observation time, not sensor time or its precision.
    measurementTimePrecision: "unknown" as const,
    importedAt: iso(row.createdAt), importTimeBasis: "observation_created_at" as const,
    measurementMethod: method, quality: token(row.qualityFlag), classification: classification(source, method),
    freshness: dateKey(new Date(row.observedAt), timezone) === today ? "fresh" as const : "stale" as const,
    aiEligibility: provenanceOf({ source: row.source, originalSource: row.originalSource }),
    limitations: [
      "Observation time is the stored record time; exact sensor measurement time is not established.",
      ...(originalSource ? [] : ["Original upstream source is not stored for this observation."]),
      ...(iso(row.createdAt) ? ["Import time is this observation's creation time, not a separate provider retrieval receipt."] : ["Import time is unavailable."]),
      ...(method === "uploaded_file" ? ["Uploaded file measurement method is unverified."] : []),
    ],
  };
}
function metricContext(key: DailyMetricKey, rows: DailyInputObservation[], timezone: string, today: string, truncated = false) {
  const rule = rules[key], matching = rows.filter(row => row.metricType === rule.type);
  const rangeValid = matching.filter(row => row.qualityFlag === "ok" && row.unit === rule.unit && number(row.value, rule.min, rule.max) !== null);
  const valid = rangeValid.filter(row=>provenanceOf(row)==="allowed");
  // A corrected record from the same source/method/day replaces its older
  // candidate for this read only. Source observations are never edited.
  const sources = new Set<string>();
  const fresh = valid.filter(row => dateKey(new Date(row.observedAt), timezone) === today).filter(row => {
    const key = JSON.stringify([row.source, row.originalSource ?? null, row.measurementMethod ?? null]);
    if (sources.has(key)) return false;
    sources.add(key); return true;
  });
  const conflicting = new Set(fresh.map(row => row.value)).size > 1;
  const status: MetricStatus = conflicting ? "conflicting" : truncated ? "invalid" : fresh.length ? "usable" : valid.length ? "stale" : matching.length ? "invalid" : "missing";
  const provenanceRestricted = status === "invalid" && rangeValid.some(row=>provenanceOf(row)!=="allowed");
  const reason = truncated ? "The observation read limit was reached. Unread measurements may disagree; current values require review and cannot answer numeric questions."
    : status === "usable" ? "A usable observation is available for today's local date. This does not answer subjective recovery or safety questions."
    : status === "conflicting" ? "Current sources disagree. Review the readings or enter your correction; no average or preferred provider was invented."
    : status === "stale" ? "Only observations from an earlier local date are available. Refresh or optionally report a current value."
    : provenanceRestricted ? "The stored reading has Strava-origin or unknown-origin provenance. It remains raw history, but cannot support coaching analysis or answer this numeric question. Its removal is not evidence of normal recovery."
    : status === "invalid" ? "Available observations have missing quality, incompatible units or out-of-range values. They cannot answer this question."
    : "No usable observation is available. Missing data is not zero or normal.";
  return { status, selected: status === "usable" ? metricValue(fresh[0], timezone, today) : null,
    latest: rangeValid.length ? metricValue(rangeValid[0], timezone, today) : null,
    conflicts: conflicting ? fresh.map(row => metricValue(row, timezone, today)) : [],
    rejectedCount: matching.length - valid.length, provenanceRestricted, reason };
}
export interface DailyInputContextOptions {
  athleteId: string; timezone: string; now?: Date;
  observations?: readonly DailyInputObservation[]; completedWorkouts?: readonly DailyInputWorkout[];
  activityDecisions?: readonly ActivityDecision[]; connectors?: readonly DailyInputConnector[];
  observationsTruncated?: boolean; workoutsTruncated?: boolean;
  observationsUnavailable?: boolean;
}
function duplicateReview(rows: readonly DailyInputWorkout[], reconciled: ReturnType<typeof groupActivityEvidence<DailyInputWorkout>>) {
  const groups: { recordIds:string[];reason:string;proposedAction:"review"|"retain_linked_records" }[]=[];
  const identities=new Map<string,DailyInputWorkout[]>();
  for(const row of rows) if(row.source && row.externalId) {
    const key=JSON.stringify([row.userId,row.source,row.externalId]);
    identities.set(key,[...(identities.get(key) ?? []),row]);
  }
  for(const members of identities.values()) {
    const recordIds=[...new Set(members.map(row=>row.id))];
    const linked=reconciled.groups.some(group=>!group.unresolved&&recordIds.every(id=>group.members.some(row=>row.id===id)));
    const explicitlySeparate=reconciled.appliedDecisions.some(decision=>decision.kind==="different_sessions"&&recordIds.every(id=>decision.members.some(member=>member.id===id)));
    if(recordIds.length>1&&!linked&&!explicitlySeparate)groups.push({recordIds,reason:"Distinct stored records share the same provider activity identifier. Retain both until reviewed; no primary record or cleanup is selected.",proposedAction:"review"});
  }
  for(const group of reconciled.groups) if(group.members.length>1) groups.push({recordIds:group.members.map(row=>row.id),reason:"Existing plan links, corroboration or an explicit reconciliation already relate these source records. Retain each record and its provenance; a planned and completed session are related records.",proposedAction:"retain_linked_records"});
  for(const members of reconciled.pending)groups.push({recordIds:members.map(row=>row.id),reason:"Possible cross-provider copies are unresolved. Review identity before counting a total; overlapping sessions are not automatically duplicates.",proposedAction:"review"});
  return {groups,destructiveChanges:0 as const};
}
/** Read-only athlete-view context. Never pass this object into an AI prompt:
 * it can contain restricted Strava-origin or unknown-origin personal records.
 * No observation here establishes medical clearance or extra training dose. */
export function buildDailyInputContext(input: DailyInputContextOptions) {
  const now = input.now ?? new Date(), today = dateKey(now, input.timezone);
  const observationsUnavailable = input.observationsUnavailable === true;
  const observationStart = localDate(addDaysKey(today, -13), input.timezone).getTime();
  const workoutStart = localDate(addDaysKey(today, -1), input.timezone).getTime();
  const ownObservations = [...(observationsUnavailable ? [] : input.observations ?? [])].filter(row => row.userId === input.athleteId && Number.isFinite(millis(row.observedAt)) && millis(row.observedAt) >= observationStart && millis(row.observedAt) <= now.getTime())
    .sort((a,b) => millis(b.observedAt) - millis(a.observedAt) || (millis(b.createdAt) || 0) - (millis(a.createdAt) || 0) || a.id.localeCompare(b.id));
  const observations = ownObservations.slice(0, DAILY_INPUT_LIMIT);
  const observationsTruncated = input.observationsTruncated === true || ownObservations.length > DAILY_INPUT_LIMIT;
  const metrics = Object.fromEntries((Object.keys(rules) as DailyMetricKey[]).map(key => [key, metricContext(key, observations, input.timezone, today, observationsTruncated)])) as Record<DailyMetricKey, ReturnType<typeof metricContext>>;
  const ownWorkouts = [...(input.completedWorkouts ?? [])].filter(row => row.userId === input.athleteId && Number.isFinite(millis(row.date)) && millis(row.date) >= workoutStart && millis(row.date) <= now.getTime()
    && (row.completed || row.actualDurationMin != null || row.feedbackStatus != null || row.feedbackAt != null))
    .sort((a,b) => millis(b.date) - millis(a.date) || a.id.localeCompare(b.id));
  const workouts = ownWorkouts.slice(0, DAILY_INPUT_LIMIT);
  const activityPolicy = derivedActivityPolicy(workouts);
  const reconciled = groupActivityEvidence(workouts, input.activityDecisions);
  const duplicates = duplicateReview(workouts,reconciled);
  const duplicateReviewRequired=duplicates.groups.some(group=>group.proposedAction==="review");
  const summaries = reconciled.groups.map(group => {
    const primary = group.primary;
    const policy = derivedActivityPolicy(group.members);
    const outcome = primary.feedbackStatus ?? (group.members.some(row => row.completed) ? "completed" : "unknown");
    const durationMinutes = policy.status !== "allowed" ? activityActualMinutes(primary) : group.unresolved ? null : group.budgetMinutes;
    const rpe = Number.isInteger(primary.rpe) ? number(primary.rpe, 0, 10) : null;
    const sourceRecords = group.members.map(row => ({ id: row.id, source: providerSource(row.source),
      originalSource: upstreamSource(row.originalSource) ?? upstreamSource(intervalsUpstreamFromNotes(row.notes)),
      observedAt: iso(row.date), importedAt: row.planned === false ? iso(row.createdAt) : null,
      measurementTimePrecision: "unknown" as const, importTimeBasis: row.planned === false ? "workout_created_at" as const : "not_imported_record" as const,
      recordKind: row.planned ? "planned_record" as const : "actual_record" as const,
      classification: row.planned ? "planned" as const : ["manual","manual_sport_local"].includes(row.source||"") ? "self_reported" as const : "provider_reported" as const,
      aiEligibility: provenanceOf(row) }));
    return { id: primary.id, recordIds: group.members.map(row => row.id), sport: token(primary.actualSport || primary.sport) ?? "unknown",
      dateLocal: dateKey(new Date(primary.date), input.timezone), observedAt: iso(primary.date),
      outcome, outcomeBasis: primary.feedbackStatus ? "explicit_report" as const : "stored_completion" as const,
      durationMinutes, rpe, selection: group.selection, requiresReconciliation: group.unresolved, sourceRecords,
      derivedActivityPolicy: policy, durationBasis: policy.status !== "allowed" ? "source_record" as const : "reconciled_evidence" as const,
      questions: { durationMinutes: durationMinutes === null && !group.unresolved, rpe: outcome !== "skipped" && rpe === null },
      comparison: policy.status === "allowed" && group.members.some(row => row.planned) ? {
        plannedMinutes: group.members.find(row => row.planned)?.durationMin ?? null,
        actualMinutes: durationMinutes,
        differenceMinutes: durationMinutes !== null && group.members.find(row => row.planned)?.durationMin != null ? durationMinutes - group.members.find(row => row.planned)!.durationMin! : null,
      } : null,
    };
  });
  const executionFeedback: ExecutionFeedback[] = activityPolicy.status !== "allowed" ? [] : summaries.map(summary => ({ id: summary.id, feedbackStatus: summary.outcome,
    actualDurationMin: summary.durationMinutes, rpe: summary.rpe, date: summary.observedAt!,
    feedbackAt: workouts.find(row => row.id === summary.id)?.feedbackAt ?? null }));
  const workoutsTruncated = input.workoutsTruncated === true || ownWorkouts.length > DAILY_INPUT_LIMIT;
  return { version: DAILY_INPUT_CONTEXT_VERSION, dateLocal: today, timezone: input.timezone, metrics,
    readStatus: observationsUnavailable ? "unavailable" as const : "available" as const,
    dataAvailability: { observations: observationsUnavailable ? "unavailable" as const : "available" as const,
      limitations: observationsUnavailable ? ["Optional measurement storage is unavailable. Saved workout history remains available; current measurements are unknown."] : observationsTruncated ? ["The observation read limit was reached. Stored readings remain visible, but current numeric evidence is incomplete."] : [] },
    objectiveFields: { sleepHours: metrics.sleepHours.status !== "usable", hrv: metrics.hrvRmssd.status !== "usable" && metrics.hrvSdnn.status !== "usable", restingHr: metrics.restingHr.status !== "usable" },
    questions: { sleepQuality: true, soreness: true, energy: true, stress: true, motivation: true,
      illness: true, newPain: true, urgentSymptoms: true, availableMinutes: true,
      reason: "Sleep duration is not sleep quality. Imported measurements or readiness scores do not answer current symptoms, subjective recovery or available time." },
    completedWorkouts: summaries, executionFeedback,
    activity: { rawRecordCount: workouts.length, groupCount: summaries.length, unresolvedGroups: reconciled.unresolvedGroups,
      reportedMinutes: activityPolicy.status === "allowed" && !workoutsTruncated && !duplicateReviewRequired && !reconciled.unresolvedGroups && summaries.length && summaries.every(row => row.durationMinutes !== null) ? summaries.reduce((sum,row) => sum + row.durationMinutes!,0) : null,
      coverage: "unknown" as const, requiresReconciliation: reconciled.unresolvedGroups > 0 || duplicateReviewRequired,
      derivedActivityPolicy: activityPolicy,
      reason: activityPolicy.reason ?? "Only recorded work is known. No imported activity does not mean no training or a rest day." },
    sync: (input.connectors ?? []).slice(0,20).map(connector => ({ provider: providerSource(connector.provider),
      status: connector.status === "error" ? "failed" : connector.status === "connected" ? "connected" : "unavailable", lastSyncAt: iso(connector.lastSyncAt),
      reason: connector.status === "error" ? "The latest connection state reports a sync failure. Stored measurements retain their own dates and quality." : "Provider contact does not establish current measurements or complete activity history." })),
    bounded: { observationsTruncated, workoutsTruncated }, duplicateReview: duplicates,
    questionBasis: "imported_evidence_only" as const,
    freshnessPolicy: "same_local_day" as const,
    usage: "athlete_view_and_existing_local_execution_only" as const,
  };
}
export type DailyInputContext = ReturnType<typeof buildDailyInputContext>;
/** Reuse the existing conservative execution decision service; never create a
 * second readiness score or increase duration/intensity from a completion. */
export function applyDailyExecutionContext(adaptation: Adaptation, context: DailyInputContext) {
  const policy = context.activity.derivedActivityPolicy;
  if (policy.status !== "allowed") return {
    adaptation: adaptation.verdict === "rest" || ["unknown","hold","urgent"].includes(adaptation.safetyStatus ?? "") ? adaptation : {
      ...adaptation, score:0, scoreAvailable:false, verdict:"rest" as const, durationFactor:0, intensityCap:"z1",
      safetyStatus:"unknown" as const, ruleId:"derived-activity-policy-v1:insufficient", message:policy.reason!,
    }, inputs:[], notes:[policy.reason!],
  };
  return applyExecutionFeedback(adaptation, context.executionFeedback);
}
type DailyInputReader = Pick<typeof prisma, "metricObservation" | "workout" | "connector" | "auditLog">;
export async function readDailyInputContext(athleteId: string, timezone: string, db: DailyInputReader = prisma, now = new Date()) {
  const today = dateKey(now, timezone), end = localDate(addDaysKey(today,1), timezone);
  const [observationRead, completedWorkouts, connectors, activityDecisions] = await Promise.all([
    db.metricObservation.findMany({ where: { userId: athleteId, metricType: { in: Object.values(rules).map(rule => rule.type) }, observedAt: { gte: localDate(addDaysKey(today,-13),timezone), lte: now } }, orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: DAILY_INPUT_LIMIT + 1,
      select: { id:true,userId:true,observedAt:true,createdAt:true,metricType:true,value:true,unit:true,source:true,measurementMethod:true,qualityFlag:true } }).then(rows=>({rows,unavailable:false})).catch((error:unknown)=>{
        if (["P2021","P2022"].includes((error as {code?:string})?.code ?? "")) return {rows:[],unavailable:true};
        throw error;
      }),
    db.workout.findMany({ where: { userId: athleteId, date: { gte: localDate(addDaysKey(today,-1),timezone), lt: end }, OR: [{completed:true},{actualDurationMin:{not:null}},{feedbackStatus:{not:null}},{feedbackAt:{not:null}}] }, orderBy: [{ date:"desc" },{id:"asc"}], take: DAILY_INPUT_LIMIT,
      select: { id:true,userId:true,date:true,createdAt:true,sport:true,actualSport:true,source:true,externalId:true,notes:true,planned:true,completed:true,durationMin:true,actualDurationMin:true,distanceKm:true,rpe:true,feedbackStatus:true,feedbackAt:true,matchedPlanId:true } }),
    db.connector.findMany({ where: { userId: athleteId }, select: { provider:true,status:true,lastSyncAt:true }, take:20 }),
    readActivityDecisions(athleteId,db),
  ]);
  return buildDailyInputContext({ athleteId, timezone, now, observations:observationRead.rows, completedWorkouts, connectors, activityDecisions,
    observationsUnavailable:observationRead.unavailable,
    observationsTruncated: observationRead.rows.length > DAILY_INPUT_LIMIT, workoutsTruncated: completedWorkouts.length === DAILY_INPUT_LIMIT });
}
