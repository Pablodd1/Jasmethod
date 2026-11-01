import { addDaysKey, dateKey } from "./dates";
import {groupActivityEvidence,type ActivityDecision,type ActivityEvidenceRow} from "./activity-evidence";
import { derivedActivityPolicy } from "./derived-activity-policy";
import type { BoundedPlanSession } from "./planning-bounds";
import type { GeneratedWeek, Sport, ZoneKey } from "./science";
import { cycleEventDay, normalizeCycleEvents, type CycleEventInput } from "./cycle-events";
import { CYCLE_REVIEW_INTERVAL_DAYS, comfortableObservationDescription, cycleBaselineStatus, type CycleBaselineReview } from "./cycle-review";

export const TRAINING_CYCLE_VERSION = "bounded-cycle-v1";
type BoundedWeek = Omit<GeneratedWeek, "sessions"> & { sessions: BoundedPlanSession[]; restDaySlots: number[]; doubleDayNote: string; doseAllocation?:{templateTargetMinutes:number;allocatedMinutes:number;unallocatedMinutes:number;method:string;note:string} };
export interface CycleActivity extends ActivityEvidenceRow {
  id: string; date: Date; completed: boolean; actualDurationMin: number | null;
  feedbackStatus: string | null; rpe: number | null; matchedPlanId?: string | null;
}
/** Only records of performed work count. Missing reports are never zero training. */
export function cycleActivityEvidence(rows: CycleActivity[], today: string, timezone: string,decisions:readonly ActivityDecision[]=[]) {
  const isPerformed = (row: CycleActivity) => row.completed || (row.actualDurationMin ?? 0) > 0 || ["partial", "substituted"].includes(row.feedbackStatus || "");
  const performed=rows.filter(isPerformed),policy=derivedActivityPolicy(rows);
  if (policy.status !== "allowed") return {
    reportedSessions:null,reportedMinutes:null,unknownDurationSessions:null,
    protectedDays:[...new Set(performed.map(row=>dateKey(row.date,timezone)))].sort(),
    reconciliation:{rawRecords:performed.length,groupedCopies:null,unresolvedGroups:null,requiresReview:true},
    historyReview:true,recoveryReview:false,derivedActivityPolicy:policy,note:policy.reason!,
  };
  const reconciled=groupActivityEvidence(rows,decisions);
  const groups=reconciled.groups.filter(group=>group.members.some(isPerformed));
  const durations=groups.map(group=>group.budgetMinutes);
  return {
    derivedActivityPolicy:policy,
    reportedSessions: groups.length,
    reportedMinutes: reconciled.unresolvedGroups ? null : durations.some(minutes=>minutes!==null)?durations.reduce<number>((sum,minutes)=>sum+(minutes??0),0):null,
    unknownDurationSessions: groups.filter(group=>group.unresolved||group.budgetMinutes===null).length,
    protectedDays:[...new Set(performed.map(row=>dateKey(row.date,timezone)))].sort(),
    reconciliation:{rawRecords:performed.length,groupedCopies:reconciled.groupedCopies,unresolvedGroups:reconciled.unresolvedGroups,requiresReview:reconciled.unresolvedGroups>0},
    historyReview:reconciled.unresolvedGroups>0,
    recoveryReview:rows.some(row=>dateKey(row.date,timezone)>=addDaysKey(today,-7)&&dateKey(row.date,timezone)<=today&&((row.rpe??0)>=8||["partial","skipped"].includes(row.feedbackStatus||""))),
    note:"Recorded actual minutes only; unreported work and unknown durations are not treated as zero. Corroborated or matched reports count once; conflicting linked durations use the largest reported value unless the athlete explicitly selected a primary record. Unresolved cross-provider copies keep totals unknown and require review. Every performed date remains protected. Completion does not establish recovery or increased capacity.",
  };
}

/** Provisional reduction-only cycle, not a validated dose or a promised result.
 * All dates are calendar keys, so a DST day never changes a planning window.
 * Observations replace existing work and never renew actual baseline evidence. */
export function shapeTrainingCycle(weeks: BoundedWeek[], options: {
  startKey: string; raceKey?: string | null; needsAssessment: boolean;
  recoveryReview: boolean; protectedDays: string[];
  events?: readonly CycleEventInput[];
  baselineReviews?: readonly CycleBaselineReview[];
  templatePeriodized?: boolean;
}) {
  const events = normalizeCycleEvents({ events: options.events, raceKey: options.raceKey });
  const protectedDays = new Set([...options.protectedDays, ...events.map(event => event.dateKey)]);
  const nextReview = new Map<Sport, string>();
  const reviewBySport = new Map(options.baselineReviews?.map(review => [review.sport, review]));
  const reviewedSports = new Set<Sport>();
  for (const sport of new Set(weeks.flatMap(week => week.sessions.map(session => session.sport)))) {
    const review = reviewBySport.get(sport);
    nextReview.set(sport, review?.reviewDueAt && review.reviewDueAt > options.startKey ? review.reviewDueAt
      : !options.baselineReviews && !options.needsAssessment ? addDaysKey(options.startKey, 21) : options.startKey);
  }
  return weeks.map((week, index) => {
    const weekStart = addDaysKey(options.startKey, index * 7);
    const eventDays = Array.from({ length: 7 }, (_, slot) => ({ key: addDaysKey(weekStart, slot), ...cycleEventDay(events, addDaysKey(weekStart, slot)) }));
    const hasPreparation = eventDays.some(day => day.phase === "preparation" || day.phase === "event");
    const hasRecovery = eventDays.some(day => day.phase === "recovery");
    const eventLimited = hasPreparation || hasRecovery;
    const recoveryWeek = !options.templatePeriodized && (index + 1) % 4 === 0;
    const rebuild = options.recoveryReview && index === 0;
    const baseFactor = rebuild ? .6 : options.templatePeriodized ? 1 : recoveryWeek ? .7 : Math.min(1, .8 + (index % 4) * .05 + Math.floor(index / 4) * .025);
    // Taking the most conservative applicable window avoids additive loads or
    // separate promised peaks. Event days are removed rather than assigned dose.
    const eventFactor = Math.min(1, ...eventDays.map(day => day.protected ? .5 : day.factor));
    // The reviewed template already contains its volume wave. Apply only the
    // additional reduction necessary for an event; never multiply two tapers.
    const templateFactor = options.templatePeriodized && week.periodizationFactor && week.periodizationFactor > 0 ? Math.min(1,week.periodizationFactor) : 1;
    const factor = Math.min(baseFactor, eventFactor / templateFactor);
    const theme = hasPreparation && hasRecovery ? "Event preparation and recovery · reduced load"
      : hasPreparation ? "Event preparation · reduced load"
      : hasRecovery ? "Post-event recovery · review before resuming"
      : rebuild ? "Recovery and training review"
      : recoveryWeek ? "Recovery and reassessment"
      : options.needsAssessment && index === 0 ? "Baseline assessment and easy foundation"
      : options.templatePeriodized ? week.theme || 'Planned practice · review response' : `Block ${Math.floor(index / 4) + 1} · ${index % 4 === 0 ? "Foundation" : "Progressive practice"}`;
    const observations: { sport: Sport; dateKey: string; minutes: number; status: string; reason: string }[] = [];
    const cycleOmissions: string[] = [];
    const sessions = week.sessions.flatMap(session => {
      const key = addDaysKey(weekStart, session.daySlot);
      if (protectedDays.has(key)) return [];
      // Event windows cannot preserve a stacked optional second session. Do not
      // move it back or make it up; the existing primary remains bounded.
      if (eventLimited && session.doubleDayRole === "secondary") return [];
      const minutes = Math.floor(session.minutes * factor);
      if (minutes < 1) return [];
      const reviewedCoaching = week.templateVersion === 'coaching-structure-v1' && session.coaching;
      if (reviewedCoaching && minutes < reviewedCoaching.minimumMinutes) {
        cycleOmissions.push(`${session.title}: reduced budget cannot fit the complete minimum prescription; no catch-up added.`);
        return [];
      }
      const review = reviewBySport.get(session.sport);
      const status = review ? cycleBaselineStatus(review, key) : "missing";
      const missingAnchor = options.baselineReviews !== undefined ? status === "missing" || status === "expired" : options.needsAssessment;
      const observationDue = key >= (nextReview.get(session.sport) ?? options.startKey);
      const eligibleSport = reviewedCoaching ? ['swim','bike','run'].includes(session.sport)
        : !["recovery", "brick"].includes(session.sport)&&!(session.sport==='mobility'&&session.type==='recovery');
      // A placeholder on a calendar is never proof of recovery or a new test.
      // Defer the observation in event/rebuild weeks and optional pairs.
      const observation = eligibleSport && observationDue && !eventLimited && !rebuild && !session.doubleDayRole;
      const firstObservation = !reviewedSports.has(session.sport);
      if (observation) {
        nextReview.set(session.sport, addDaysKey(key, CYCLE_REVIEW_INTERVAL_DAYS));
        reviewedSports.add(session.sport);
        observations.push({ sport: session.sport, dateKey: key, minutes, status,
          reason: firstObservation && missingAnchor ? "Missing or expired sport-specific evidence" : "Scheduled comfortable review; no anchor renewal" });
      }
      const movementSport = ["strength", "mobility", "hyrox", "boxing"].includes(session.sport);
      const technicalOrTest = ["speed", "plyo", "race", "test"].includes(session.type);
      const cap = observation || recoveryWeek || eventLimited || rebuild || movementSport || technicalOrTest || status === "expired"
        || (missingAnchor && index < 2) ? 2 : missingAnchor ? 3 : 4;
      const zone = `z${Math.min(cap, Number(session.zone.slice(1)))}` as ZoneKey;
      // A low zone label cannot legitimize maximal/loaded sprint or station work.
      const type = technicalOrTest ? (movementSport ? "strength" : "endurance")
        : Number(zone.slice(1)) <= 2 && !movementSport ? "endurance" : session.type;
      // Keep the reviewed duration-neutral purpose when it still agrees with
      // the final steps. Legacy prose contains fixed doses and race-effort
      // claims, so it cannot be carried across reductions as instructions.
      const retainedPurpose = week.templateVersion === "triathlon-foundation-v3"
        && zone === session.zone && status !== "expired" && !technicalOrTest && !movementSport ? session.description : null;
      const loweredIntensity = Number(zone.slice(1)) < Number(session.zone.slice(1));
      // Reviewed recipes contain no fixed unscaled dose. Preserve the sport
      // identity, but replace quality claims when the effective effort falls.
      const coachingPurpose = reviewedCoaching && loweredIntensity && !movementSport
        ? `${Number(zone.slice(1)) <= 2 ? 'Comfortable' : 'Controlled reduced-intensity'} ${session.sport === 'brick' ? 'bike-to-run transition' : session.sport} practice; original quality work withheld for review`
        : reviewedCoaching ? reviewedCoaching.purpose : null;
      const description = reviewedCoaching ? observation ? comfortableObservationDescription(session.sport)
        : loweredIntensity && !movementSport ? `Purpose: ${coachingPurpose}. Follow the reduced, duration-matched steps at the effective effort. No original threshold or hard-interval dose is retained. No missed work is added later.`
          : `${session.description}${factor < 1 ? ' The session duration is reduced for the current recovery/event window; the executable steps must fit this duration.' : ''}${eventLimited || rebuild ? ' Use controlled familiar work; no progression of load or complexity in this review window.' : ''}`
        : session.sport==='mobility'&&session.type==='recovery' ? session.description : observation ? comfortableObservationDescription(session.sport)
        : retainedPurpose ?? `Provisional ${theme.toLowerCase()} session. Follow the duration-matched steps, adjusted by the session-day check-in. Effort labels are not measured physiological zones. No missed work is added later.${movementSport ? " Familiar controlled movement only; do not add load, maximal speed, sparring or unfamiliar skills. Review before progressing." : ""}${status === "expired" && review ? " The prior sport-specific anchor expires within this cycle; this plan does not renew it. Use comfortable effort and review current evidence." : ""}`;
      const title = observation ? `${session.sport}: Comfortable ${firstObservation && missingAnchor ? "baseline observation" : "review observation"}`
        : reviewedCoaching ? loweredIntensity && !movementSport ? `${session.sport === 'brick' ? 'Brick · bike to run' : session.sport} · ${Number(zone.slice(1)) <= 2 ? 'comfortable' : 'controlled reduced-intensity'} practice` : session.title
        : technicalOrTest ? `${session.sport}: Controlled familiar practice`
        : movementSport ? `${session.title} · controlled familiar practice`
        : Number(zone.slice(1)) < Number(session.zone.slice(1)) ? `${session.sport}: ${zone === "z2" ? "Easy" : "Controlled"} practice` : session.title;
      const coaching = reviewedCoaching ? { ...reviewedCoaching,
        ...(minutes !== session.minutes && reviewedCoaching.legs ? {legs:undefined} : {}),
        purpose: observation ? `Comfortable ${session.sport} observation; not a measured baseline` : coachingPurpose!,
        demanding: reviewedCoaching.demanding && !observation && !recoveryWeek && !eventLimited && !rebuild && !loweredIntensity,
        ...(observation || loweredIntensity || eventLimited || rebuild ? {note:'Effective effort and current duration override original quality work. This observation does not renew a measured reference.'} : {}),
      } : session.coaching;
      return [{ ...session, minutes, zone, type, description, title, ...(coaching ? {coaching} : {}) }];
    });
    // Removing a performed/event date must not leave an orphaned optional pair.
    for (const session of sessions) if (session.doubleDayRole && sessions.filter(other => other.daySlot === session.daySlot && other.doubleDayRole).length !== 2) {
      delete session.doubleDayRole; delete session.movedFromSlot;
    }
    return { ...week, theme, sessions, cycleOmissions, totalMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
      restDaySlots: Array.from({ length: 7 }, (_, slot) => slot).filter(slot => !sessions.some(session => session.daySlot === slot)),
      cycleFactor: factor, volumeDecision:{scheduledMinutes:week.totalMinutes,cycleFactor:factor,remainingPlannedMinutes:sessions.reduce((sum,s)=>sum+s.minutes,0),protectedDates:eventDays.filter(day=>day.protected||options.protectedDays.includes(day.key)).map(day=>day.key),reason:rebuild?'Recent reported difficult/incomplete work: conservative review':eventLimited?'Event preparation/recovery':options.templatePeriodized?'Template progression applied once; no second generic ramp':'Legacy conservative cycle'}, observations, eventDays: eventDays.filter(day => day.protected).map(day => day.key),
      eventIds: [...new Set(eventDays.flatMap(day => day.eventIds))],
      doubleDayNote: eventLimited && week.sessions.some(session => session.doubleDayRole)
        ? "Optional second session omitted during event preparation/recovery. No catch-up session is added." : week.doubleDayNote,
      reviewNote: "Provisional reduction-only coaching heuristic within your recent tolerated ceiling. Review actual work, effort, symptoms and recovery before progressing. Comfortable observations fit existing minutes, are not completed evidence, and do not refresh 90-day anchors. These percentages and the 28-day review cadence are not a validated individual response model." };
  });
}

export { savedCycleSummary } from "./training-cycle-summary";
