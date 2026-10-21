import { createHash } from "node:crypto";
import { prisma } from "./db";
import { dateKey, dayBounds } from "./dates";
import { CHECKIN_SAFETY_VERSION, resolveCheckinSafety } from "./checkin-safety";

export const RESET_HOLD_AUDIT_LIMIT = 100;
export interface ExistingReviewResetAudit {
  id: string; subjectId: string; createdAt: Date | string; before: string | null;
}
export interface ResetCheckinSnapshot {
  userId?: string; date: Date | string; answers?: string | null; adaptation?: string | null;
}
const time = (value: unknown) => value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
function object(value: unknown): Record<string, any> | null {
  if (typeof value !== "string" || value.length > 256000) return null;
  try { const row = JSON.parse(value); return row && typeof row === "object" && !Array.isArray(row) ? row : null; } catch { return null; }
}

/** Reset removes an adaptation, not the fact that a same-day restriction was
 * reported. Only a later complete full check-in can resolve this short-review
 * gate. Unknown answers are not evidence of symptoms or clinical clearance. */
export function existingReviewResetHold(input: {
  athleteId: string; timezone: string; now: Date; audits?: readonly ExistingReviewResetAudit[];
  checkin?: ResetCheckinSnapshot | null; pendingMinutes: number; workoutMinutes: number;
}) {
  const today = dateKey(input.now, input.timezone), nowMs = input.now.getTime();
  const ownToday = (row: ResetCheckinSnapshot | null | undefined) => !!row && (!row.userId || row.userId === input.athleteId) && Number.isFinite(time(row.date)) && dateKey(new Date(row.date),input.timezone) === today;
  const audits = [...(input.audits ?? [])].filter(row => row.subjectId === input.athleteId && Number.isFinite(time(row.createdAt)) && time(row.createdAt) <= nowMs && dateKey(new Date(row.createdAt),input.timezone) === today)
    .sort((a,b) => time(b.createdAt)-time(a.createdAt) || b.id.localeCompare(a.id));
  const snapshots = audits.slice(0,RESET_HOLD_AUDIT_LIMIT).map(row => ({ audit:row, snapshot:object(row.before) as ResetCheckinSnapshot | null }));
  const completeFullAt = (snapshot: ResetCheckinSnapshot | null | undefined, before: number) => {
    if (!ownToday(snapshot)) return null;
    const answers = object(snapshot!.answers), metadata = answers?.inputMetadata;
    const recorded = time(metadata?.recordedAt);
    if (!answers || metadata?.version !== CHECKIN_SAFETY_VERSION || !["athlete-reported","athlete-confirmed-voice","coach-entered"].includes(metadata?.source) ||
      metadata?.observedOn !== today || metadata?.existingReview || !Number.isFinite(recorded) || recorded > before || resolveCheckinSafety(answers).status !== "clear") return null;
    return recorded;
  };
  const fullCheckins = [completeFullAt(input.checkin,nowMs), ...snapshots.map(row => completeFullAt(row.snapshot,time(row.audit.createdAt)))].filter((value): value is number => value !== null);
  const requiredMinutes = Math.max(input.pendingMinutes,input.workoutMinutes);
  const markers = snapshots.flatMap(({audit,snapshot}) => {
    if (!ownToday(snapshot)) return [];
    const answers = object(snapshot!.answers), adaptation = object(snapshot!.adaptation);
    const safety = resolveCheckinSafety(answers);
    const scoped = answers?.inputMetadata?.existingReview?.version === "existing-workout-review-v1";
    const reduced = !scoped && adaptation?.safetyStatus === "clear" &&
      ((["trim","easy","rest"].includes(adaptation.verdict)) || (typeof adaptation.durationFactor === "number" && Number.isFinite(adaptation.durationFactor) && adaptation.durationFactor >= 0 && adaptation.durationFactor < 1) || (/^z[1-6]$/.test(adaptation.intensityCap)));
    const limitedTime = !scoped && typeof answers?.availableMin === "number" && Number.isFinite(answers.availableMin) && answers.availableMin >= 0 && Number.isFinite(requiredMinutes) && answers.availableMin < requiredMinutes;
    const kind = ["hold","urgent"].includes(safety.status) ? "reported_symptoms" : reduced ? "recovery_reduction" : limitedTime ? "time_limit" : null;
    return kind ? [{id:audit.id,at:time(audit.createdAt),kind,resolved:fullCheckins.some(recorded=>recorded>time(audit.createdAt))}] : [];
  });
  const unresolved = markers.filter(marker=>!marker.resolved);
  const truncated = audits.length > RESET_HOLD_AUDIT_LIMIT && !fullCheckins.some(recorded=>recorded>time(audits[0].createdAt));
  return {
    required: unresolved.length > 0 || truncated,
    reason: unresolved.length ? "A same-day check-in restriction was reset. Complete a fresh full check-in before using the short review; reset does not clear reported symptoms, recovery reductions or known time limits."
      : truncated ? "The reset review history exceeds the verified read limit. Complete a fresh full check-in; no symptoms or training capacity are inferred." : null,
    resetAt: unresolved.length ? new Date(unresolved[0].at).toISOString() : null,
    revision: audits.length ? createHash("sha256").update(JSON.stringify([today,markers,fullCheckins,truncated,audits.map(row=>[row.id,time(row.createdAt)])])).digest("hex") : null,
  };
}

export async function readExistingReviewResetAudits(athleteId:string,timezone:string,db:Pick<typeof prisma,"auditLog">=prisma,now=new Date()):Promise<ExistingReviewResetAudit[]> {
  const {start,end}=dayBounds(timezone,now);
  return db.auditLog.findMany({where:{subjectId:athleteId,action:"checkin.undo",before:{not:null},createdAt:{gte:start,lt:end,lte:now}},
    orderBy:[{createdAt:"desc"},{id:"desc"}],take:RESET_HOLD_AUDIT_LIMIT+1,select:{id:true,subjectId:true,createdAt:true,before:true}});
}
