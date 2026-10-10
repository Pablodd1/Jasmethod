import { assessDailyEnvironment } from "./daily-environment";
import { readDailyEnvironment } from "./daily-environment-store";
import { unitsOf } from "./units";
import { reviewSecondaryDoubleDay, type DoubleDayPreference } from "./double-day";
// Single athlete-scoped, date-scoped safety boundary for screen, messages and FIT.
import { canonicalDemand, canonicalFuelIntensity } from "./session-demand";
import { protocolEvidence } from "./reviewed-evidence";
import { isDemanding, PROTOCOL_VERSION } from "./protocols";
import { reviewProtocolAthlete } from "./protocol-eligibility";
import { buildSessionNutrition, type SessionNutrition } from "./session-nutrition";
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
  sameDaySessions?: Record<string, any>[];
  doubleDayContext?: { preference: DoubleDayPreference|null|undefined; setupRevision:string|null; source?:string };
  environment?: { record: unknown; revision: string | null };
  currentEvents?: {id:string;userId:string;date:Date}[];
  now?: Date;
}
export function effectiveSessionFromRecords(input: EffectiveRecords): { workout: any; prescription: any; canonical: CanonicalSession; targetProfile: TargetProfile | null | undefined; nutrition: SessionNutrition } {
  const { workout, profile, userId, timezone } = input;
  const key = dateKey(workout.date, timezone);
  const now = input.now ?? new Date();
  const today = dateKey(now, timezone);
  const environment = assessDailyEnvironment({ record: input.environment?.record ?? null, revision: input.environment?.revision ?? null, athleteId: userId, sessionId: workout.id, dateLocal: key, timezone, startTime: workout.startTime, now });
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
  const currentEvents = (input.currentEvents ?? []).filter(event=>event.userId===userId && Number.isFinite(event.date.getTime()) && event.date.toISOString().slice(0,10)===key);
  const revisionContext = { source: input.revisionContext, currentEvents, reportedActivity: activity, sameDaySessions: input.sameDaySessions ?? null, doubleDayContext:input.doubleDayContext??null, executionReviewedAt: Number.isFinite(reviewedAt) ? reviewedAt : null };
  const p = parsed(workout.prescription);
  if (safety.status === "clear" && p?.planningStatus === "provisional") safety = { ...safety, status: "unknown", reason: "Your structured plan is saved. Complete a fresh session-day check-in to confirm today’s duration, effort and recovery before training or export." };
  if (safety.status === "clear" && p?.protocol) {
    const eligibility = reviewProtocolAthlete({ protocolId: p.protocol.id, ...profile, now });
    if (p.protocol.version !== PROTOCOL_VERSION || protocolEvidence(p.protocol.id).status !== "eligible")
      safety = { ...safety, status: "unknown", reason: "The saved protocol or its evidence is no longer current. Preview the reviewed template again before training or export." };
    else if (eligibility.status !== "eligible") safety = { ...safety, status: "unknown", reason: eligibility.reasons.map(r => r.message).join(" ") };
  }

  if(safety.status==="clear") {
    const secondReason=reviewSecondaryDoubleDay({workout,sameDay:input.sameDaySessions??[],preference:input.doubleDayContext?.preference,setupRevision:input.doubleDayContext?.setupRevision??null,setupSource:input.doubleDayContext?.source,timezone,checkinRecordedAt:reviewedAt,now});
    if(secondReason) safety={...safety,status:"unknown",reason:secondReason};
  }
  // Missing and malformed prescriptions are both held, with distinct reasons.
  // Only the budget-aware check-in transaction may regenerate a session; a
  // read/export must not independently spend the full day budget a second time.
  if (safety.status === "clear" && !input.planning?.ready) safety = { ...safety, status: "unknown", reason: `Complete or review your athlete setup before individualized training. ${[...(input.planning?.missing || []), ...(input.planning?.review || [])].join(". ")}` };
  if (currentEvents.length && !["hold","urgent"].includes(safety.status)) safety = { ...safety, status:"unknown", reason:"This calendar day now contains a saved event. No added workout is prescribed. Review your events and preview an updated cycle; event participation and recovery are not assumed." };
  let canonical = canonicalSession({ athleteId: userId, workout, prescription: p ?? workout.prescription, profile, dateLocal: key, timezone, safety, revisionContext, environment });
  if (safety.status === "clear" && canonical.verdict === "ready" && (isDemanding({...workout,...p}) || canonicalDemand(canonical, profile) !== "easy")) {
    const loadRows=input.sameDaySessions?.filter(w=>!w.matchedPlanId||!input.sameDaySessions?.some(other=>other.id===w.matchedPlanId));
    const anotherDemand = loadRows?.some(w => {
      if(w.id===workout.id) return false;
      if((w.completed || ['partial','substituted','unknown'].includes(w.feedbackStatus)) && w.actualDurationMin==null) return true;
      if(w.actualSport && w.actualSport!==w.sport) return true;
      if((w.actualDurationMin??w.durationMin)<=0) return false;
      if (isDemanding({ ...w, sport: w.actualSport || w.sport, durationMin: w.actualDurationMin ?? w.durationMin })) return true;
      if (w.completed && w.rpe == null) return true;
      const other = canonicalSession({ athleteId: userId, workout: { ...w, userId, title: "Other session" }, prescription: parsed(w.prescription), profile, dateLocal: key, timezone });
      return canonicalDemand(other, profile) !== "easy";
    });
    if (anotherDemand) {
      safety = { ...safety, status: "unknown", reason: "Two demanding or unassessed sessions on one day need recorded athlete agreement, coach review, time/separation and recovery checks, including actual effort. This workflow cannot verify those yet. Reorganize the day to a single demanding session; no weekly double-hard quota is imposed." };
      canonical = canonicalSession({ athleteId: userId, workout, prescription: p, profile, dateLocal: key, timezone, safety, revisionContext, environment });
    }
  }
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
      if (cap === 7 || t.source !== "explicit" || t.type === "open" || t.type === "swimStroke") return false;
      // An explicit numeric target cannot evade a reduced-intensity check-in by
      // labelling itself Z1. Without an applicable anchor, ask for review.
      // Brick metadata is assigned by the canonical component resolver, never
      // accepted from a raw leaf step. Cycling FTP and running pace cannot be
      // transferred to other sports to approve an explicit reduced-day target.
      const targetSport = step.componentSport ?? canonical.sport;
      if (t.type === "power") return targetSport !== "bike" || !profile?.ftp || t.high! > Math.round(profile.ftp * [0,.55,.75,.9,1.05,1.2,1.5,1.5][cap]);
      if (t.type === "heartRate") return !["run", "bike"].includes(targetSport) || !profile?.lthr || t.high! > Math.round(profile.lthr * [0,.8,.89,.94,1,1.05,1.1,1.1][cap]);
      const pace = targetSport === "run" && profile?.runPaceBase ? profile.runPaceBase * [0,1.4,1.2,1.08,1,.95,.9,.85][cap] : null;
      return !pace || (t.type === "pace" ? t.low! < pace : t.high! > 1000 / pace);
    });
    const stepsOverCap = canonical.steps.some(s => Number(s.zone.slice(1)) > cap);
    if (stepsOverCap || violatesTarget || canonical.durationMin > durationLimit) {
      safety = { ...safety, status: "unknown", reason: "Expanded steps or targets exceed the current check-in intensity/time limit. Recalculate the session before training or exporting." };
      canonical = canonicalSession({ athleteId: userId, workout, prescription: p, profile, dateLocal: key, timezone, safety, revisionContext, environment });
    }
  }
  const prescription = canonical.verdict === "ready"
    ? { ...p, title: canonical.title, sport: canonical.sport, durationMin: canonical.durationMin, steps: canonical.steps, targets: {}, revision: canonical.revision }
    : { ...p, title: canonical.verdict === "rest" ? "Rest and recover" : workout.title, sport: workout.sport, type: "recovery", intensity: "z1", verdict: "rest", durationMin: 0, steps: [], targets: { rpe: 0 }, why: canonical.reason, safetyStatus: canonical.verdict, revision: canonical.revision, detail: { wu: "No warm-up prescribed.", main: canonical.reason, cd: "Reassess before training.", breathing: "", study: "" }, scaled: { originalMin: workout.durationMin, factor: 0, reason: canonical.reason }, sources: [] };
  const nutrition = buildSessionNutrition(profile, { id: canonical.id, dateLocal: key, timezone, sport: canonical.sport,
    durationMin: canonical.durationMin, intensity: canonicalFuelIntensity(canonical, prescription.intensity, profile), startTime: workout.startTime, verdict: canonical.verdict }, now);
  return { workout, prescription, canonical, targetProfile: profile, nutrition };
}
type EffectivePrescriptionReader = Pick<typeof prisma, "workout" | "athleteProfile" | "user" | "auditLog" | "supplementProfile" | "dailyCheckin" | "benchmarkTest" | "race">;
export async function effectivePrescription(userId: string, workoutId: string, db: EffectivePrescriptionReader = prisma) {
  const [workout, profile, user, setup, applied, supplement, environment] = await Promise.all([
    db.workout.findFirst({ where: { id: workoutId, userId }, include: { planDay: { select: { dayOff: true } } } }),
    db.athleteProfile.findUnique({ where: { userId } }),
    db.user.findUnique({ where: { id: userId }, select: { timezone: true, language: true } }),
    readPlanningSetup(userId, db),
    db.auditLog.findMany({ where: { subjectId: userId, action: "baseline.fromTest" }, orderBy: { createdAt: "desc" }, take: 100, select: { entityId: true } }),
    db.supplementProfile.findUnique({ where: { userId } }),
    readDailyEnvironment(userId, workoutId, db),
  ]);
  if (!workout || !user) return null;
  const timezone = user.timezone;
  const sessionDate = localDate(dateKey(workout.date, timezone), timezone);
  const today = dayBounds(timezone);
  const appliedIds = applied.flatMap(a => a.entityId ? [a.entityId] : []);
  const [checkin, currentCheckin, tests, reportedActivity, sameDaySessions, currentEvents] = await Promise.all([
    db.dailyCheckin.findUnique({ where: { userId_date: { userId, date: sessionDate } } }),
    sessionDate.getTime() === today.start.getTime() ? Promise.resolve(null) : db.dailyCheckin.findUnique({ where: { userId_date: { userId, date: today.start } } }),
    db.benchmarkTest.findMany({ where: { userId, id: { in: appliedIds }, completed: true, skipped: false }, orderBy: { date: "desc" } }),
    db.workout.findMany({
      where: { userId, date: { gte: localDate(addDaysKey(today.key, -3), timezone), lt: today.end }, OR: [{ feedbackAt: { not: null } }, { feedbackStatus: { not: null } }, { completed: true }, { planned: false }, { actualDurationMin: { not: null } }, { actualSport: { not: null } }, { actualDetails: { not: null } }, { rpe: { not: null } }] },
      select: { id: true, userId: true, date: true, createdAt: true, feedbackAt: true, feedbackStatus: true, feedbackNote: true, actualDurationMin: true, actualSport: true, actualDetails: true, rpe: true, completed: true, planned: true, sport: true, durationMin: true },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    db.workout.findMany({ where: { userId, date: { gte: sessionDate, lt: localDate(addDaysKey(dateKey(workout.date, timezone), 1), timezone) }, OR: [{completed:true},{actualDurationMin:{gt:0}},{feedbackStatus:{in:["partial","substituted","unknown"]}},{planned:true,AND:[{OR:[{feedbackStatus:null},{feedbackStatus:{not:"skipped"}}]},{OR:[{planDay:null},{planDay:{dayOff:false,plan:{status:"active"}}}]}]}] }, select: { id:true,userId:true,date:true,sport:true,durationMin:true,intensity:true,type:true,rpe:true,completed:true,actualDurationMin:true,actualSport:true,prescription:true,originalPlan:true,startTime:true,feedbackAt:true,feedbackStatus:true,matchedPlanId:true },orderBy:[{startTime:"asc"},{id:"asc"}] }),
    db.race.findMany({where:{userId,date:{gte:new Date(`${dateKey(workout.date,timezone)}T00:00:00Z`),lt:new Date(`${addDaysKey(dateKey(workout.date,timezone),1)}T00:00:00Z`)}},select:{id:true,userId:true,date:true},orderBy:{id:"asc"}}),
  ]);
  if(profile?.raceDate && dateKey(profile.raceDate,timezone)===dateKey(workout.date,timezone)) currentEvents.push({id:"profile-event",userId,date:new Date(`${dateKey(profile.raceDate,timezone)}T00:00:00Z`)});
  return effectiveSessionFromRecords({ userId, timezone, workout, environment, currentEvents, profile: evidencedTargetProfile(profile ? {...profile, units: unitsOf(profile.units, user.language)} : null, tests, appliedIds), checkin, currentCheckin, reportedActivity, sameDaySessions, doubleDayContext:{preference:setup.setup?.doubleDay,setupRevision:setup.revision,source:setup.setup?.source}, planning: assessPlanningSetup(profile, setup.setup, new Date(), "daily"), maxDailyMinutes: setup.setup?.maxSessionMinutes, revisionContext: { sourceProfile: profile, setupRevision: setup.revision, supplement, anchorEvidence: tests.map(t => [t.id, t.type, t.date, t.result]) } });
}
