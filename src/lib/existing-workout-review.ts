import { createHash } from "node:crypto";
import { canonicalSession, type TargetProfile } from "./canonical-session";
import { canonicalDemand } from "./session-demand";
import { workoutRevision } from "./workout-update";
import { hasWorkoutReport } from "./calendar-workouts";
import { groupActivityEvidence, activityActualMinutes, type ActivityDecision, type ActivityEvidenceRow } from "./activity-evidence";
import { dateKey } from "./dates";
import { derivedActivityPolicy } from "./derived-activity-policy";
import { applyExecutionFeedback } from "./execution-feedback";

export const EXISTING_REVIEW_VERSION = "existing-workout-review-v1";
export interface ExistingReviewCandidate {
  eligible: boolean; reason: string; sessionId: string; minutes: number | null;
  remainingPlanMinutes: number | null; contextRevision: string; workoutRevision: string;
}
export interface ExistingReviewRecord {
  version: typeof EXISTING_REVIEW_VERSION; sessionId: string; workoutRevision: string;
  contextRevision: string; confirmedAt: string; noSymptoms: true; recoveryUnchanged: true;
  timeConfirmed: true; availableMin: number;
}
export function existingWorkoutRevision(workout: Record<string, any>) {
  // Approval is a receipt, not a change to the reviewed instructions.
  return workoutRevision({ ...workout, approved: false });
}
export function existingReviewCandidate(input: {
  athleteId: string; timezone: string; now: Date; workout: Record<string, any>;
  profile?: TargetProfile | null; maxDailyMinutes?: number | null; setupReady: boolean;
  sameDaySessions: Record<string, any>[]; recentActivity?: Record<string, any>[]; activityDecisions?: readonly ActivityDecision[];
  context: unknown; knownHold?: boolean;
}): ExistingReviewCandidate {
  const w = input.workout;
  const contextRevision = createHash("sha256").update(JSON.stringify(input.context)).digest("hex");
  const base = { sessionId: String(w.id), minutes: null, remainingPlanMinutes: null,
    contextRevision, workoutRevision: existingWorkoutRevision(w) };
  const no = (reason: string): ExistingReviewCandidate => ({ ...base, eligible: false, reason });
  if (w.userId !== input.athleteId || !w.planned || hasWorkoutReport(w)) return no("Only an unreported saved session can use the short review.");
  if (dateKey(w.date, input.timezone) !== dateKey(input.now, input.timezone)) return no("Review this session on its local training day.");
  if (!input.setupReady || input.profile?.injured || input.knownHold) return no("A saved restriction or recovery hold needs the full check-in or coach review.");
  if (!["run", "bike", "swim", "mobility", "recovery"].includes(w.sport) || ["race", "test", "speed", "plyo", "threshold", "interval", "tempo"].includes(w.type)) return no("Use the full check-in for this session's intensity or structure.");
  if (!Number.isFinite(input.maxDailyMinutes) || input.maxDailyMinutes! <= 0) return no("Review your tolerated baseline and daily time limit first.");
  const history = [...(input.recentActivity ?? []), ...input.sameDaySessions].filter(row => row.userId === input.athleteId && (hasWorkoutReport(row) || row.planned === false));
  const policy = derivedActivityPolicy(history);
  if (policy.status !== "allowed") return no(policy.reason || "Activity provenance must be reviewed before coaching analysis.");
  if (history.some(row => typeof row.rpe === "number" && row.rpe >= 9)) return no("Recent very hard effort needs the full recovery review before continuing training.");
  const recentEvidence = groupActivityEvidence(history as ActivityEvidenceRow[], input.activityDecisions);
  if (recentEvidence.unresolvedGroups) return no("Review ambiguous recent activity copies before continuing training.");
  const recentExecution = applyExecutionFeedback({ verdict:"full", score:0, scoreAvailable:false, durationFactor:1,
    intensityCap:"z7", safetyStatus:"clear", ruleId:"existing-review-history", message:"" }, recentEvidence.groups.map(group => ({
      ...group.primary, id:String(group.primary.id), durationMin:group.primary.durationMin ?? undefined,
      actualDurationMin:group.budgetMinutes,
      feedbackStatus:group.primary.feedbackStatus ?? (group.members.some(row => row.completed) ? "completed" : "unknown"),
    })));
  if (recentExecution.adaptation.ruleId === "execution-feedback-v1:incomplete-load") return no("Review recent actual minutes, effort and outcome in the full check-in before continuing training.");
  try {
    const session = canonicalSession({ athleteId: input.athleteId, workout: w, prescription: w.prescription,
      profile: input.profile, dateLocal: dateKey(w.date, input.timezone), timezone: input.timezone });
    if (session.verdict !== "ready" || session.exactTimeSeconds === null || canonicalDemand(session, input.profile) !== "easy") return no("The short review is limited to unchanged, timed easy sessions. No intensity increase is inferred.");
    const rows: (Record<string, any> & ActivityEvidenceRow)[] = input.sameDaySessions.filter(row => row.userId === input.athleteId).map(row => ({ ...row, date: row.date }));
    const reported = rows.filter(row => hasWorkoutReport(row) || row.planned === false);
    const evidence = groupActivityEvidence(reported, input.activityDecisions);
    if (evidence.unresolvedGroups || evidence.groups.some(g => g.primary.feedbackStatus !== "skipped" && g.budgetMinutes === null)) return no("Review ambiguous activity copies or missing actual duration before adding training.");
    const used = evidence.groups.reduce((sum, g) => sum + (g.budgetMinutes ?? 0), 0);
    const pending = rows.filter(row => row.planned && !hasWorkoutReport(row));
    if (!pending.some(row => row.id === w.id)) return no("The saved session is no longer in today's remaining plan.");
    if (pending.some(row => typeof row.durationMin !== "number" || !Number.isFinite(row.durationMin) || row.durationMin < 0)) return no("Review the remaining plan's duration first.");
    const total = pending.reduce((sum, row) => sum + (row.durationMin as number), 0);
    if (session.durationMin <= 0 || total < session.durationMin || total + used > input.maxDailyMinutes!) return no("The remaining plan exceeds today's reviewed time budget. Use the full check-in to adjust it.");
    // An actual bout without effort information is not treated as recovered.
    if (reported.some(row => activityActualMinutes(row) !== null && activityActualMinutes(row)! > 0 && (row.rpe == null || row.rpe >= 9))) return no("Review the recent session's effort before continuing the plan.");
    return { ...base, eligible: true, minutes: session.durationMin, remainingPlanMinutes: total,
      reason: "Review only this saved easy session. Subjective recovery scores remain unknown; no readiness score or extra training is created." };
  } catch { return no("The saved structure needs review; steps and targets will not be guessed."); }
}

export function confirmedExistingReview(answers: Record<string, any> | null, candidate: ExistingReviewCandidate,
  timezone: string, now: Date): ExistingReviewRecord | null {
  const value = answers?.inputMetadata?.existingReview;
  if (!candidate.eligible || !value || value.version !== EXISTING_REVIEW_VERSION || value.sessionId !== candidate.sessionId ||
    value.workoutRevision !== candidate.workoutRevision || value.contextRevision !== candidate.contextRevision ||
    value.noSymptoms !== true || value.recoveryUnchanged !== true || value.timeConfirmed !== true ||
    value.availableMin !== candidate.remainingPlanMinutes || answers?.availableMin !== value.availableMin ||
    answers.sick !== false || answers.newPain !== false || answers.urgentSymptoms !== false || answers.painAffectsMovement === true) return null;
  const time = typeof value.confirmedAt === "string" ? Date.parse(value.confirmedAt) : NaN;
  if (!Number.isFinite(time) || time > now.getTime() || dateKey(new Date(time), timezone) !== dateKey(now, timezone)) return null;
  return value;
}
