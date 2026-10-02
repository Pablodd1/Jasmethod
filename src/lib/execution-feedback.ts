import type { Adaptation } from "./adaptive";
export interface ExecutionFeedback {
  id: string; feedbackStatus?: string | null; actualDurationMin?: number | null;
  rpe?: number | null; durationMin?: number; date?: Date | string; feedbackAt?: Date | string | null;
}
/** Session-RPE load is a self-report proxy in arbitrary units, not work or injury risk. */
export function sessionReportedLoad(feedback: ExecutionFeedback): number | null {
  if (!["completed", "partial", "substituted"].includes(feedback.feedbackStatus || "")) return null;
  if (feedback.actualDurationMin == null || !Number.isFinite(feedback.actualDurationMin) || feedback.actualDurationMin < 0 || feedback.actualDurationMin > 1440 || feedback.rpe == null || !Number.isInteger(feedback.rpe) || feedback.rpe < 1 || feedback.rpe > 10) return null;
  return feedback.actualDurationMin * feedback.rpe;
}
export function applyExecutionFeedback(adaptation: Adaptation, feedback: ExecutionFeedback[]) {
  feedback = feedback.filter((f) => f.feedbackAt || f.durationMin == null || f.durationMin > 0);
  const inputs = feedback.map((f) => ({ sessionId: f.id, outcome: f.feedbackStatus || "unknown", actualDurationMin: f.actualDurationMin ?? null, rpe: f.rpe ?? null, reportedLoadAU: sessionReportedLoad(f), observedAt: f.date ?? null, recordedAt: f.feedbackAt ?? null }));
  const veryHard = feedback.some((f) => f.feedbackAt && ["completed", "partial", "substituted"].includes(f.feedbackStatus || "") && f.rpe != null && f.rpe >= 9);
  const unknownExecution = feedback.some((f) => !f.feedbackStatus || f.feedbackStatus === "unknown" || (["completed", "partial", "substituted"].includes(f.feedbackStatus) && sessionReportedLoad(f) == null));
  const notes: string[] = [];
  if (feedback.some((f) => f.feedbackStatus === "skipped")) notes.push("Skipped sessions are not added to today's work and do not prove zero total activity.");
  if (unknownExecution) notes.push("Recent actual training load is incomplete. Unknown minutes or effort are not treated as zero.");
  if (adaptation.verdict === "rest" || adaptation.safetyStatus !== "clear") return { adaptation, inputs, notes };
  if (unknownExecution || veryHard) {
    const cap = unknownExecution ? "z2" : "z3";
    const oldCap = Number(adaptation.intensityCap.slice(1));
    const nextCap = Number(cap.slice(1));
    const message = unknownExecution ? "Recent execution is not fully reported. Keep a conservative easy session while confirming the selected sessions' actual minutes and effort. No missed work is added." : "A confirmed recent session felt very hard (RPE 9–10). Today's workload is reduced; no missed work is added.";
    return { adaptation: { ...adaptation, verdict: unknownExecution ? "easy" as const : adaptation.verdict === "full" ? "trim" as const : adaptation.verdict, durationFactor: Math.min(adaptation.durationFactor, unknownExecution ? 0.6 : 0.85), intensityCap: oldCap < nextCap ? adaptation.intensityCap : cap, message, ruleId: `execution-feedback-v1:${unknownExecution ? "incomplete-load" : "very-hard"}` }, inputs, notes };
  }
  return { adaptation, inputs, notes };
}
