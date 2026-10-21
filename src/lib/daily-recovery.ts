import { resolveCheckinSafety, type CheckinSafetyInput } from "./checkin-safety";

export interface DailyRecoveryInput {
  plannedRest: boolean;
  eventDay?: boolean;
  sessions: { id?:string; durationMin: number; intensity?: string | null; verdict?: string }[];
  /** Supplied only after the shared canonical resolver verifies this scoped review. */
  reviewedSessionId?:string|null;
  injured?: boolean;
  performedToday?: boolean;
  answers?: CheckinSafetyInput | null;
}
/** Coaching presentation rules, not validated readiness or autonomic diagnoses. */
export function dailyRecoveryContext(input: DailyRecoveryInput) {
  const safety = resolveCheckinSafety(input.answers);
  const lowRecovery = !!input.answers && ((input.answers.sleep ?? 5) <= 2 || (input.answers.energy ?? 5) <= 2 || (input.answers.soreness ?? 1) >= 4 || (input.answers.stress ?? 1) >= 4);
  // Missing answers block execution, but do not establish illness, injury or rest.
  const held = !!input.injured || safety.status === "hold" || safety.status === "urgent";
  const reviewNeeded = !input.eventDay && input.sessions.some(s => s.verdict === "blocked" || (s.verdict === "rest" && !input.plannedRest));
  const reviewedSessionId = !held && input.reviewedSessionId && input.sessions.some(s=>s.id===input.reviewedSessionId && s.verdict==="ready") ? input.reviewedSessionId : null;
  const easy = input.sessions.length > 0 && input.sessions.every(s => s.durationMin > 0 && s.intensity === "z1");
  const mode = held ? "hold" : input.eventDay ? "event-day" : input.plannedRest ? "planned-rest" : safety.status === "unknown" && !reviewedSessionId ? "checkin-needed" : reviewNeeded ? "review-needed" : easy ? "easy-day" : input.sessions.length ? "training" : "unplanned";
  // An optional recovery choice replaces other easy movement; it is never extra prescribed volume.
  const allowMovement = !input.performedToday && !reviewNeeded && mode === "planned-rest" && input.sessions.every(s => s.durationMin === 0) && safety.status === "clear" && !lowRecovery && (input.answers?.availableMin ?? 0) >= 20;
  return { mode, allowMovement, safetyStatus: safety.status, reviewedSessionId, recoveryNeedsReview: lowRecovery,
    noAdditionalTraining: true, optionalMovementMinutes: allowMovement ? 20 : null };
}
