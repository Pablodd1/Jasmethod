import type { Adaptation } from "./adaptive";
import type { ComplianceResult } from "./execution-compliance";
export interface ExecutionFeedback {
  id: string; feedbackStatus?: string | null; actualDurationMin?: number | null;
  rpe?: number | null; durationMin?: number; date?: Date | string; feedbackAt?: Date | string | null;
  sport?: string | null; actualSport?: string | null; source?: string | null;
  planned?: boolean; feedbackNote?: string | null;
  /** Explicit matching prescription; an imported activity's duration is not a plan. */
  expectedDurationMin?: number | null;
  compliance?: ComplianceResult["verdict"] | null;
}
export interface ExecutionEvaluation {
  version: "execution-evaluation-v1";
  state: "hold" | "maintain" | "reduce" | "review-for-progression";
  reasons: string[];
  automaticProgression: false;
  catchUpMinutes: 0;
  sessions: {
    sessionId: string; sport: string | null; source: string;
    observedAt: Date | string | null; recordedAt: Date | string | null;
    expectedMinutes: number | null; actualMinutes: number | null; differenceMinutes: number | null;
    outcome: string; rpe: number | null; reportedLoadAU: number | null;
    compliance: ComplianceResult["verdict"] | null;
    commentRecorded: boolean; conflicts: string[];
  }[];
}
/** Bound the direct-rendered result before mapping optional API/cache content. */
export function isExecutionEvaluation(value:unknown):value is ExecutionEvaluation {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const v=value as Record<string,any>,number=(n:unknown)=>n===null||typeof n==="number"&&Number.isFinite(n),date=(d:unknown)=>d===null||typeof d==="string"&&Number.isFinite(Date.parse(d))||d instanceof Date&&Number.isFinite(+d);
  return v.version==="execution-evaluation-v1"&&["hold","maintain","reduce","review-for-progression"].includes(v.state)&&v.automaticProgression===false&&v.catchUpMinutes===0&&Array.isArray(v.reasons)&&v.reasons.every((r:unknown)=>typeof r==="string")&&Array.isArray(v.sessions)&&v.sessions.length<=100&&v.sessions.every((s:any)=>s&&typeof s==="object"&&typeof s.sessionId==="string"&&typeof s.source==="string"&&(s.sport===null||typeof s.sport==="string")&&date(s.observedAt)&&date(s.recordedAt)&&number(s.expectedMinutes)&&number(s.actualMinutes)&&number(s.rpe)&&typeof s.commentRecorded==="boolean"&&Array.isArray(s.conflicts)&&s.conflicts.every((c:unknown)=>typeof c==="string"));
}
/** Local evidence only: never send this evaluation or its source records to AI.
 * A review suggestion cannot change a prescription, infer recovery, or clear a hold.
 * Progression eligibility must come from an existing validated readiness policy. */
export function evaluateExecution(adaptation: Pick<Adaptation,"verdict"|"safetyStatus">, feedback: ExecutionFeedback[], options: { progressionReviewEligible?: boolean } = {}): ExecutionEvaluation {
  const validMinutes = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1440 ? n : null;
  const sessions = feedback.map(f => {
    const actualMinutes = validMinutes(f.actualDurationMin);
    const expectedMinutes = validMinutes(f.expectedDurationMin ?? (f.planned === true ? f.durationMin : null));
    const rpe = typeof f.rpe === "number" && Number.isInteger(f.rpe) && f.rpe >= 0 && f.rpe <= 10 ? f.rpe : null;
    const outcome = f.feedbackStatus || "unknown", conflicts: string[] = [];
    if (outcome === "skipped" && actualMinutes !== null && actualMinutes > 0) conflicts.push("Skipped outcome conflicts with positive actual minutes.");
    if (["completed", "partial", "substituted"].includes(outcome) && actualMinutes === 0 && rpe !== null && rpe > 0) conflicts.push("Positive reported effort conflicts with zero actual minutes.");
    if (f.actualDurationMin != null && actualMinutes === null) conflicts.push("Actual duration is invalid.");
    if (f.rpe != null && rpe === null) conflicts.push("Reported effort is invalid.");
    if (f.sport && f.actualSport && f.sport !== f.actualSport && outcome !== "substituted") conflicts.push("Planned and reported sports disagree without a substitution report.");
    if (f.date != null && !Number.isFinite(new Date(f.date).getTime())) conflicts.push("Observation date is invalid.");
    if (f.feedbackAt != null && !Number.isFinite(new Date(f.feedbackAt).getTime())) conflicts.push("Report date is invalid.");
    return { sessionId:f.id, sport:f.actualSport || f.sport || null, source:f.source || "unknown",
      observedAt:f.date ?? null, recordedAt:f.feedbackAt ?? null, expectedMinutes, actualMinutes,
      differenceMinutes:actualMinutes !== null && expectedMinutes !== null ? actualMinutes - expectedMinutes : null,
      outcome,rpe,reportedLoadAU:sessionReportedLoad(f),compliance:f.compliance ?? null,
      // Comments remain in the stored local report. No parsing, medical inference or prompt export.
      commentRecorded:typeof f.feedbackNote === "string" && !!f.feedbackNote.trim(), conflicts };
  });
  const reasons = ["Only recorded execution is known. Missing activity is not a rest day; missed work is never added."];
  let state: ExecutionEvaluation["state"] = "maintain";
  if (adaptation.verdict === "rest" || adaptation.safetyStatus !== "clear") {
    state = "hold"; reasons.push("The existing safety or readiness hold takes priority; execution cannot clear it.");
  } else if (adaptation.verdict === "easy" || adaptation.verdict === "trim") {
    state = "reduce"; reasons.push("The existing conservative readiness decision is retained.");
  }
  const incomplete = sessions.some(s => s.conflicts.length || !["completed","partial","substituted","skipped"].includes(s.outcome) || (s.outcome !== "skipped" && s.reportedLoadAU === null));
  const veryHard = feedback.some(f => !!f.feedbackAt && sessionReportedLoad(f) !== null && f.rpe! >= 9);
  const failedCompliance = sessions.some(s => s.compliance === "faded" || s.compliance === "missed");
  if (incomplete || veryHard || failedCompliance) {
    if (state !== "hold") state = "reduce";
    if (incomplete) reasons.push("Execution is incomplete or contradictory; confirm actual minutes, effort and conflicting fields before progression.");
    if (veryHard) reasons.push("A confirmed RPE 9–10 report supports the existing conservative reduction.");
    if (failedCompliance) reasons.push("Recorded compliance faded or missed: review the dose before raising it; no catch-up is prescribed.");
  } else if (state === "maintain" && options.progressionReviewEligible === true && sessions.length && sessions.every(s => s.outcome === "completed" && s.source !== "unknown" && s.observedAt !== null && s.recordedAt !== null && s.expectedMinutes !== null && s.compliance === "too_easy")) {
    state = "review-for-progression";
    reasons.push("Existing readiness policy permits a review and structured execution suggests a retest. Coach review is required; today's prescription is unchanged.");
  } else reasons.push("Retain the reviewed plan. A completion, comment or duration difference alone cannot prove fitness improvement.");
  return {version:"execution-evaluation-v1",state,reasons,automaticProgression:false,catchUpMinutes:0,sessions};
}
/** Session-RPE load is a self-report proxy in arbitrary units, not work or injury risk. */
export function sessionReportedLoad(feedback: ExecutionFeedback): number | null {
  if (!["completed", "partial", "substituted"].includes(feedback.feedbackStatus || "")) return null;
  if (feedback.actualDurationMin == null || !Number.isFinite(feedback.actualDurationMin) || feedback.actualDurationMin < 0 || feedback.actualDurationMin > 1440 || feedback.rpe == null || !Number.isInteger(feedback.rpe) || feedback.rpe < 0 || feedback.rpe > 10) return null;
  return feedback.actualDurationMin * feedback.rpe;
}
export function applyExecutionFeedback(adaptation: Adaptation, feedback: ExecutionFeedback[]) {
  feedback = feedback.filter((f) => f.feedbackAt || f.feedbackStatus || f.actualDurationMin != null || f.durationMin == null || f.durationMin > 0);
  const inputs = feedback.map((f) => ({ sessionId: f.id, outcome: f.feedbackStatus || "unknown", actualDurationMin: f.actualDurationMin ?? null, rpe: f.rpe ?? null, reportedLoadAU: sessionReportedLoad(f), observedAt: f.date ?? null, recordedAt: f.feedbackAt ?? null }));
  const veryHard = feedback.some((f) => f.feedbackAt && sessionReportedLoad(f) !== null && f.rpe! >= 9);
  const unknownExecution = feedback.some((f) => !f.feedbackStatus || f.feedbackStatus === "unknown" || (["completed", "partial", "substituted"].includes(f.feedbackStatus) && sessionReportedLoad(f) == null));
  const evaluation = evaluateExecution(adaptation, feedback);
  const notes: string[] = [];
  if (feedback.some((f) => f.feedbackStatus === "skipped")) notes.push("Skipped sessions are not added to today's work and do not prove zero total activity.");
  if (unknownExecution) notes.push("Recent actual training load is incomplete. Unknown minutes or effort are not treated as zero.");
  if (adaptation.verdict === "rest" || adaptation.safetyStatus !== "clear") return { adaptation, inputs, notes, evaluation };
  const conflictingExecution = evaluation.sessions.some(s => s.conflicts.length > 0);
  const failedCompliance = evaluation.sessions.some(s => s.compliance === "faded" || s.compliance === "missed");
  if (unknownExecution || veryHard || conflictingExecution || failedCompliance) {
    const conservative = unknownExecution || conflictingExecution || failedCompliance;
    const cap = conservative ? "z2" : "z3";
    const oldCap = Number(adaptation.intensityCap.slice(1));
    const nextCap = Number(cap.slice(1));
    const message = conservative ? "Recent execution is incomplete, conflicting or needs dose review. Keep a conservative easy session while reviewing actual minutes and effort. No missed work is added." : "A confirmed recent session felt very hard (RPE 9–10). Today's workload is reduced; no missed work is added.";
    return { adaptation: { ...adaptation, verdict: conservative ? "easy" as const : adaptation.verdict === "full" ? "trim" as const : adaptation.verdict, durationFactor: Math.min(adaptation.durationFactor, conservative ? 0.6 : 0.85), intensityCap: oldCap < nextCap ? adaptation.intensityCap : cap, message, ruleId: `execution-feedback-v1:${conservative ? "incomplete-load" : "very-hard"}` }, inputs, notes, evaluation };
  }
  return { adaptation, inputs, notes, evaluation };
}
