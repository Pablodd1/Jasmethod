// Single athlete-scoped, date-scoped safety boundary for screen, messages and FIT.
import { prisma } from "./db";
import { dateKey, dayBounds, localDate, addDaysKey } from "./dates";
import { resolveCheckinSafety } from "./checkin-safety";
import { readPlanningSetup } from "./planning-setup-store";
import { assessPlanningSetup } from "./planning-setup";
import { evidencedTargetProfile } from "./anchor-evidence";
import { canonicalSession, type CanonicalSession, type TargetProfile } from "./canonical-session";

function parsed(value: unknown): any {
  if (typeof value !== "string") return null;
  try { const p = JSON.parse(value); return p && typeof p === "object" && !Array.isArray(p) ? p : null; } catch { return null; }
}
function validAdaptation(a: any) {
  return a && ["full", "trim", "easy", "rest"].includes(a.verdict) &&
    typeof a.durationFactor === "number" && Number.isFinite(a.durationFactor) && a.durationFactor >= 0 && a.durationFactor <= 1.25 &&
    /^z[1-7]$/.test(a.intensityCap);
}
export interface ReportedActivity {
  id: string; userId: string; date: Date | string; createdAt?: Date | string | null;
  feedbackAt?: Date | string | null; feedbackStatus?: string | null; feedbackNote?: string | null;
  actualDurationMin?: number | null; actualSport?: string | null; actualDetails?: string | null;
  rpe?: number | null; completed?: boolean; planned?: boolean; sport?: string; durationMin?: number;
}
function timestamp(value: unknown): number {
  return value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : NaN;
}
export interface EffectiveRecords {
  userId: string; timezone: string; workout: any; profile?: TargetProfile | null;
  checkin: { date: Date; answers?: string | null; adaptation?: string | null } | null;
  currentCheckin?: { date: Date; answers?: string | null; adaptation?: string | null } | null;
  planning?: ReturnType<typeof assessPlanningSetup>;
  maxDailyMinutes?: number | null;
  revisionContext?: unknown;
  reportedActivity?: ReportedActivity[];
  now?: Date;
}
export function effectiveSessionFromRecords(input: EffectiveRecords): { workout: any; prescription: any; canonical: CanonicalSession; targetProfile: TargetProfile | null | undefined } {
  const { workout, profile, userId, timezone } = input;
  const key = dateKey(workout.date, timezone);
  const now = input.now ?? new Date();
  const today = dateKey(now, timezone);
  const dateValid = input.checkin && dateKey(input.checkin.date, timezone) === key;
  const answers = dateValid ? parsed(input.checkin?.answers) : null;
  const reviewed = resolveCheckinSafety(answers);
  const current = input.currentCheckin && dateKey(input.currentCheckin.date, timezone) === today
    ? resolveCheckinSafety(parsed(input.currentCheckin.answers)) : null;
  const gate = current && ["hold", "urgent"].includes(current.status) ? current : reviewed;
  const adaptation = dateValid ? parsed(input.checkin?.adaptation) : null;
  let safety = { status: gate.status, reason: gate.message, ruleId: gate.ruleId, observationDate: dateValid ? key : null, currentDate: today, intensityCap: adaptation?.intensityCap ?? null, durationFactor: adaptation?.durationFactor ?? null, availableMin: answers?.availableMin ?? null };
  // Historical answers cannot establish current readiness for a fresh download.
  if (key !== today && gate.status === "clear") safety = { ...safety, status: "unknown", reason: "This session is outside today's local date. Reassess safety and readiness on the session day before exporting." };
  if (gate.status === "clear" && !validAdaptation(adaptation)) safety = { ...safety, status: "unknown", reason: "The check-in adaptation is missing or invalid. Complete the check-in again before training or exporting." };
  if (adaptation?.verdict === "rest") safety = { ...safety, status: "hold", reason: adaptation.message || "The current check-in requires rest." };
  const activityStart = localDate(addDaysKey(today, -3), timezone).getTime();
  const activityEnd = localDate(addDaysKey(today, 1), timezone).getTime();
  const activity = (input.reportedActivity || []).filter(row => row.userId === userId && timestamp(row.date) >= activityStart && timestamp(row.date) < activityEnd)
    .map(row => ({ id: row.id, date: row.date, createdAt: row.createdAt ?? null, feedbackAt: row.feedbackAt ?? null, feedbackStatus: row.feedbackStatus ?? null, feedbackNote: row.feedbackNote ?? null, actualDurationMin: row.actualDurationMin ?? null, actualSport: row.actualSport ?? null, actualDetails: row.actualDetails ?? null, rpe: row.rpe ?? null, completed: row.completed ?? null, planned: row.planned ?? null, sport: row.sport ?? null, durationMin: row.durationMin ?? null }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const reviewedAt = timestamp(answers?.inputMetadata?.recordedAt);
  const changedExecution = activity.some(row => {
    const entered = timestamp(parsed(row.actualDetails)?.enteredAt);
    const observedWrite = Math.max(...[timestamp(row.feedbackAt), timestamp(row.createdAt), entered].filter(Number.isFinite));
    return !Number.isFinite(reviewedAt) || reviewedAt > now.getTime() || !Number.isFinite(observedWrite) || observedWrite > reviewedAt;
  });
  if (safety.status === "clear" && changedExecution) safety = { ...safety, status: "unknown", reason: "Activity or feedback was recorded or corrected after this check-in, or its timing is unverified. Update today's check-in before the next workout so actual work and available time can be reassessed." };
  const revisionContext = { source: input.revisionContext, reportedActivity: activity, executionReviewedAt: Number.isFinite(reviewedAt) ? reviewedAt : null };
  const p = parsed(workout.prescription);
  // Missing and malformed prescriptions are both held, with distinct reasons.
  // Only the budget-aware check-in transaction may regenerate a session; a
  // read/export must not independently spend the full day budget a second time.
  if (safety.status === "clear" && !input.planning?.ready) safety = { ...safety, status: "unknown", reason: `Complete or review your athlete setup before individualized training. ${[...(input.planning?.missing || []), ...(input.planning?.review || [])].join(". ")}` };
  let canonical = canonicalSession({ athleteId: userId, workout, prescription: p ?? workout.prescription, profile, dateLocal: key, timezone, safety, revisionContext });
  if (canonical.verdict === "ready") {
    const original = parsed(workout.originalPlan);
    const originalMin = original?.durationMin ?? p?.scaled?.originalMin;
    const plannedZone = Number(String(original?.intensity ?? workout.intensity ?? "z2").slice(1));
    const pct = profile?.intensityPct;
    const reduction = pct != null && pct < 100 ? Math.max(.6, pct / 100) : 1;
    const profileCap = pct != null && pct < 100 ? Math.max(1, plannedZone - Math.min(2, Math.floor((100 - pct) / 20))) : 7;
    const cap = Math.min(Number(adaptation.intensityCap.slice(1)), profileCap);
    const durationLimit = typeof originalMin === "number" && Number.isFinite(originalMin)
      ? Math.min(answers.availableMin, input.maxDailyMinutes ?? Infinity, Math.round(originalMin * adaptation.durationFactor * reduction)) : Math.min(answers.availableMin, input.maxDailyMinutes ?? Infinity);
    const violatesTarget = canonical.steps.some(step => {
      const t = step.target;
      if (cap === 7 || t.source !== "explicit" || t.type === "open") return false;
      // An explicit numeric target cannot evade a reduced-intensity check-in by
      // labelling itself Z1. Without an applicable anchor, ask for review.
      if (t.type === "power") return !profile?.ftp || t.high! > Math.round(profile.ftp * [0,.55,.75,.9,1.05,1.2,1.5,1.5][cap]);
      if (t.type === "heartRate") return !profile?.lthr || t.high! > Math.round(profile.lthr * [0,.8,.89,.94,1,1.05,1.1,1.1][cap]);
      const pace = profile?.runPaceBase ? profile.runPaceBase * [0,1.4,1.2,1.08,1,.95,.9,.85][cap] : null;
      return !pace || (t.type === "pace" ? t.low! < pace : t.high! > 1000 / pace);
    });
    const stepsOverCap = canonical.steps.some(s => Number(s.zone.slice(1)) > cap);
    if (stepsOverCap || violatesTarget || canonical.durationMin > durationLimit) {
      safety = { ...safety, status: "unknown", reason: "Expanded steps or targets exceed the current check-in intensity/time limit. Recalculate the session before training or exporting." };
      canonical = canonicalSession({ athleteId: userId, workout, prescription: p, profile, dateLocal: key, timezone, safety, revisionContext });
    }
  }
  const prescription = canonical.verdict === "ready"
    ? { ...p, title: canonical.title, sport: canonical.sport, durationMin: canonical.durationMin, steps: canonical.steps, revision: canonical.revision }
    : { ...p, title: canonical.verdict === "rest" ? "Rest and recover" : workout.title, sport: workout.sport, type: "recovery", intensity: "z1", verdict: "rest", durationMin: 0, steps: [], targets: { rpe: 0 }, why: canonical.reason, safetyStatus: canonical.verdict, revision: canonical.revision, detail: { wu: "No warm-up prescribed.", main: canonical.reason, cd: "Reassess before training.", breathing: "", study: "" }, scaled: { originalMin: workout.durationMin, factor: 0, reason: canonical.reason }, sources: [] };
  return { workout, prescription, canonical, targetProfile: profile };
}
export async function effectivePrescription(userId: string, workoutId: string) {
  const [workout, profile, user, setup, applied, supplement] = await Promise.all([
    prisma.workout.findFirst({ where: { id: workoutId, userId }, include: { planDay: { select: { dayOff: true } } } }),
    prisma.athleteProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    readPlanningSetup(userId),
    prisma.auditLog.findMany({ where: { subjectId: userId, action: "baseline.fromTest" }, orderBy: { createdAt: "desc" }, take: 100, select: { entityId: true } }),
    prisma.supplementProfile.findUnique({ where: { userId } }),
  ]);
  if (!workout || !user) return null;
  const timezone = user.timezone;
  const sessionDate = localDate(dateKey(workout.date, timezone), timezone);
  const today = dayBounds(timezone);
  const appliedIds = applied.flatMap(a => a.entityId ? [a.entityId] : []);
  const [checkin, currentCheckin, tests, reportedActivity] = await Promise.all([
    prisma.dailyCheckin.findUnique({ where: { userId_date: { userId, date: sessionDate } } }),
    sessionDate.getTime() === today.start.getTime() ? Promise.resolve(null) : prisma.dailyCheckin.findUnique({ where: { userId_date: { userId, date: today.start } } }),
    prisma.benchmarkTest.findMany({ where: { userId, id: { in: appliedIds }, completed: true, skipped: false }, orderBy: { date: "desc" } }),
    prisma.workout.findMany({
      where: { userId, date: { gte: localDate(addDaysKey(today.key, -3), timezone), lt: today.end }, OR: [{ feedbackAt: { not: null } }, { feedbackStatus: { not: null } }, { completed: true }, { planned: false }, { actualDurationMin: { not: null } }, { actualSport: { not: null } }, { actualDetails: { not: null } }, { rpe: { not: null } }] },
      select: { id: true, userId: true, date: true, createdAt: true, feedbackAt: true, feedbackStatus: true, feedbackNote: true, actualDurationMin: true, actualSport: true, actualDetails: true, rpe: true, completed: true, planned: true, sport: true, durationMin: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ]);
  return effectiveSessionFromRecords({ userId, timezone, workout, profile: evidencedTargetProfile(profile, tests, appliedIds), checkin, currentCheckin, reportedActivity, planning: assessPlanningSetup(profile, setup.setup, new Date(), "daily"), maxDailyMinutes: setup.setup?.maxSessionMinutes, revisionContext: { sourceProfile: profile, setupRevision: setup.revision, supplement, anchorEvidence: tests.map(t => [t.id, t.type, t.date, t.result]) } });
}
