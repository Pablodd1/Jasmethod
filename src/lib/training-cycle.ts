import { addDaysKey, dateKey } from "./dates";
import {groupActivityEvidence,type ActivityDecision,type ActivityEvidenceRow} from "./activity-evidence";
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
  const performed=rows.filter(isPerformed),reconciled=groupActivityEvidence(rows,decisions);
  const groups=reconciled.groups.filter(group=>group.members.some(isPerformed));
  const durations=groups.map(group=>group.budgetMinutes);
  return {
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
    const factor = Math.min(baseFactor, ...eventDays.map(day => day.protected ? .5 : day.factor));
    const theme = hasPreparation && hasRecovery ? "Event preparation and recovery · reduced load"
      : hasPreparation ? "Event preparation · reduced load"
      : hasRecovery ? "Post-event recovery · review before resuming"
      : rebuild ? "Recovery and training review"
      : recoveryWeek ? "Recovery and reassessment"
      : options.needsAssessment && index === 0 ? "Baseline assessment and easy foundation"
      : options.templatePeriodized ? week.theme || 'Planned practice · review response' : `Block ${Math.floor(index / 4) + 1} · ${index % 4 === 0 ? "Foundation" : "Progressive practice"}`;
    const observations: { sport: Sport; dateKey: string; minutes: number; status: string; reason: string }[] = [];
    const sessions = week.sessions.flatMap(session => {
      const key = addDaysKey(weekStart, session.daySlot);
      if (protectedDays.has(key)) return [];
      // Event windows cannot preserve a stacked optional second session. Do not
      // move it back or make it up; the existing primary remains bounded.
      if (eventLimited && session.doubleDayRole === "secondary") return [];
      const minutes = Math.floor(session.minutes * factor);
      if (minutes < 1) return [];
      const review = reviewBySport.get(session.sport);
      const status = review ? cycleBaselineStatus(review, key) : "missing";
      const missingAnchor = options.baselineReviews !== undefined ? status === "missing" || status === "expired" : options.needsAssessment;
      const observationDue = key >= (nextReview.get(session.sport) ?? options.startKey);
      const eligibleSport = !["recovery", "brick"].includes(session.sport)&&!(session.sport==='mobility'&&session.type==='recovery');
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
      const description = session.sport==='mobility'&&session.type==='recovery' ? session.description : observation ? comfortableObservationDescription(session.sport)
        : `Provisional ${theme.toLowerCase()} session. Follow the duration-matched steps, adjusted by the session-day check-in. Effort labels are not measured physiological zones. No missed work is added later.${movementSport ? " Familiar controlled movement only; do not add load, maximal speed, sparring or unfamiliar skills. Review before progressing." : ""}${status === "expired" && review ? " The prior sport-specific anchor expires within this cycle; this plan does not renew it. Use comfortable effort and review current evidence." : ""}`;
      const title = observation ? `${session.sport}: Comfortable ${firstObservation && missingAnchor ? "baseline observation" : "review observation"}`
        : technicalOrTest ? `${session.sport}: Controlled familiar practice`
        : movementSport ? `${session.title} · controlled familiar practice`
        : Number(zone.slice(1)) < Number(session.zone.slice(1)) ? `${session.sport}: ${zone === "z2" ? "Easy" : "Controlled"} practice` : session.title;
      return [{ ...session, minutes, zone, type, description, title }];
    });
    // Removing a performed/event date must not leave an orphaned optional pair.
    for (const session of sessions) if (session.doubleDayRole && sessions.filter(other => other.daySlot === session.daySlot && other.doubleDayRole).length !== 2) {
      delete session.doubleDayRole; delete session.movedFromSlot;
    }
    return { ...week, theme, sessions, totalMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0),
      restDaySlots: Array.from({ length: 7 }, (_, slot) => slot).filter(slot => !sessions.some(session => session.daySlot === slot)),
      cycleFactor: factor, volumeDecision:{scheduledMinutes:week.totalMinutes,cycleFactor:factor,remainingPlannedMinutes:sessions.reduce((sum,s)=>sum+s.minutes,0),protectedDates:eventDays.filter(day=>day.protected||options.protectedDays.includes(day.key)).map(day=>day.key),reason:rebuild?'Recent reported difficult/incomplete work: conservative review':eventLimited?'Event preparation/recovery':options.templatePeriodized?'Template progression applied once; no second generic ramp':'Legacy conservative cycle'}, observations, eventDays: eventDays.filter(day => day.protected).map(day => day.key),
      eventIds: [...new Set(eventDays.flatMap(day => day.eventIds))],
      doubleDayNote: eventLimited && week.sessions.some(session => session.doubleDayRole)
        ? "Optional second session omitted during event preparation/recovery. No catch-up session is added." : week.doubleDayNote,
      reviewNote: "Provisional reduction-only coaching heuristic within your recent tolerated ceiling. Review actual work, effort, symptoms and recovery before progressing. Comfortable observations fit existing minutes, are not completed evidence, and do not refresh 90-day anchors. These percentages and the 28-day review cadence are not a validated individual response model." };
  });
}

export { savedCycleSummary } from "./training-cycle-summary";
