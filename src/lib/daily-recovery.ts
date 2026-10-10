import { resolveCheckinSafety, type CheckinSafetyInput } from "./checkin-safety";

export interface DailyRecoveryInput {
  plannedRest: boolean;
  eventDay?: boolean;
  sessions: { durationMin: number; intensity?: string | null; verdict?: string }[];
  injured?: boolean;
  performedToday?: boolean;
  answers?: CheckinSafetyInput | null;
}
/** Coaching presentation rules, not validated readiness or autonomic diagnoses. */
export function dailyRecoveryContext(input: DailyRecoveryInput) {
  const safety = resolveCheckinSafety(input.answers);
  const lowRecovery = !!input.answers && ((input.answers.sleep ?? 5) <= 2 || (input.answers.energy ?? 5) <= 2 || (input.answers.soreness ?? 1) >= 4 || (input.answers.stress ?? 1) >= 4);
  const held = !!input.injured || safety.status === "hold" || safety.status === "urgent" || (!input.eventDay && input.sessions.some(s => s.verdict === "blocked" || (s.verdict === "rest" && !input.plannedRest)));
  const easy = input.sessions.length > 0 && input.sessions.every(s => s.durationMin > 0 && s.intensity === "z1");
  const mode = held ? "hold" : input.eventDay ? "event-day" : input.plannedRest ? "planned-rest" : easy ? "easy-day" : input.sessions.length ? "training" : "unplanned";
  // An optional recovery choice replaces other easy movement; it is never extra prescribed volume.
  const allowMovement = !input.performedToday && mode === "planned-rest" && input.sessions.every(s => s.durationMin === 0) && safety.status === "clear" && !lowRecovery && (input.answers?.availableMin ?? 0) >= 20;
  return { mode, allowMovement, safetyStatus: safety.status, recoveryNeedsReview: lowRecovery,
    noAdditionalTraining: true, optionalMovementMinutes: allowMovement ? 20 : null };
}
