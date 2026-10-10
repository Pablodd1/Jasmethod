import { addDaysKey, dateKey } from "./dates";
import type { BoundedPlanSession } from "./planning-bounds";
import type { GeneratedWeek, Sport, ZoneKey } from "./science";
import { cycleEventDay, normalizeCycleEvents, validCycleDateKey, type CycleEventInput } from "./cycle-events";
import { CYCLE_REVIEW_INTERVAL_DAYS, comfortableObservationDescription, cycleBaselineStatus, type CycleBaselineReview } from "./cycle-review";

export const TRAINING_CYCLE_VERSION = "bounded-cycle-v1";
type BoundedWeek = Omit<GeneratedWeek, "sessions"> & { sessions: BoundedPlanSession[]; restDaySlots: number[]; doubleDayNote: string };
export interface CycleActivity {
  id: string; date: Date; completed: boolean; actualDurationMin: number | null;
  feedbackStatus: string | null; rpe: number | null; matchedPlanId?: string | null;
}
/** Only records of performed work count. Missing reports are never zero training. */
export function cycleActivityEvidence(rows: CycleActivity[], today: string, timezone: string) {
  // A match relates reports of one session; it is not evidence that the planned
  // row was performed. Merge the connected reports before counting, and retain
  // every date with actual performed evidence, even when matching dates differ.
  const parents = new Map<string, string>();
  const root = (id: string): string => {
    if (!parents.has(id)) parents.set(id, id);
    let current = id;
    while (parents.get(current)! !== current) current = parents.get(current)!;
    let child = id;
    while (parents.get(child)! !== current) {
      const next = parents.get(child)!;
      parents.set(child, current);
      child = next;
    }
    return current;
  };
  for (const row of rows) {
    const own = root(row.id);
    if (row.matchedPlanId) parents.set(own, root(row.matchedPlanId));
  }
  const isPerformed = (row: CycleActivity) => row.completed || (row.actualDurationMin ?? 0) > 0
    || ["partial", "substituted"].includes(row.feedbackStatus || "");
  const performed = rows.filter(isPerformed);
  const groups = new Map<string, CycleActivity[]>();
  for (const row of performed) {
    const key = root(row.id);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const durations = [...groups.values()].map(group => {
    const known = group.flatMap(row => row.actualDurationMin != null && Number.isFinite(row.actualDurationMin) && row.actualDurationMin >= 0 ? [row.actualDurationMin] : []);
    // Conflicting actual reports are not additive. Until reconciled, retain the
    // largest recorded duration rather than implying less performed work.
    return known.length ? Math.max(...known) : null;
  });
  return {
    reportedSessions: groups.size,
    reportedMinutes: durations.some(minutes => minutes != null) ? durations.reduce<number>((sum, minutes) => sum + (minutes ?? 0), 0) : null,
    unknownDurationSessions: durations.filter(minutes => minutes == null).length,
    protectedDays: [...new Set(performed.map(row => dateKey(row.date, timezone)))].sort(),
    recoveryReview: rows.some(row => dateKey(row.date, timezone) >= addDaysKey(today, -7) && dateKey(row.date, timezone) <= today && ((row.rpe ?? 0) >= 8 || ["partial", "skipped"].includes(row.feedbackStatus || ""))),
    note: "Recorded actual minutes only; unreported work and unknown durations are not treated as zero. Matched reports count once; conflicting durations use the largest reported value, not their sum. Every performed date remains protected. Completion does not establish recovery or increased capacity.",
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
    const recoveryWeek = (index + 1) % 4 === 0;
    const rebuild = options.recoveryReview && index === 0;
    const baseFactor = rebuild ? .6 : recoveryWeek ? .7 : Math.min(1, .8 + (index % 4) * .05 + Math.floor(index / 4) * .025);
    // Taking the most conservative applicable window avoids additive loads or
    // separate promised peaks. Event days are removed rather than assigned dose.
    const factor = Math.min(baseFactor, ...eventDays.map(day => day.protected ? .5 : day.factor));
    const theme = hasPreparation && hasRecovery ? "Event preparation and recovery · reduced load"
      : hasPreparation ? "Event preparation · reduced load"
      : hasRecovery ? "Post-event recovery · review before resuming"
      : rebuild ? "Recovery and training review"
      : recoveryWeek ? "Recovery and reassessment"
      : options.needsAssessment && index === 0 ? "Baseline assessment and easy foundation"
      : `Block ${Math.floor(index / 4) + 1} · ${index % 4 === 0 ? "Foundation" : "Progressive practice"}`;
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
      const eligibleSport = !["recovery", "brick"].includes(session.sport);
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
      const description = observation ? comfortableObservationDescription(session.sport)
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
      cycleFactor: factor, observations, eventDays: eventDays.filter(day => day.protected).map(day => day.key),
      eventIds: [...new Set(eventDays.flatMap(day => day.eventIds))],
      doubleDayNote: eventLimited && week.sessions.some(session => session.doubleDayRole)
        ? "Optional second session omitted during event preparation/recovery. No catch-up session is added." : week.doubleDayNote,
      reviewNote: "Provisional reduction-only coaching heuristic within your recent tolerated ceiling. Review actual work, effort, symptoms and recovery before progressing. Comfortable observations fit existing minutes, are not completed evidence, and do not refresh 90-day anchors. These percentages and the 28-day review cadence are not a validated individual response model." };
  });
}

export function savedCycleSummary(plan: { id: string; name: string; startDate: Date | string; weeks: number; raceDate?: Date | string | null }, timezone: string, today = dateKey(new Date(), timezone)) {
  const calendarKey = (value: Date | string) => validCycleDateKey(value) ? value : dateKey(new Date(value), timezone);
  const start = calendarKey(plan.startDate);
  const end = addDaysKey(start, plan.weeks * 7 - 1);
  const elapsed = Math.floor((Date.parse(today) - Date.parse(start)) / 86400000);
  return { id: plan.id, name: plan.name, start, end, weeks: plan.weeks,
    currentWeek: elapsed < 0 || today > end ? null : Math.floor(elapsed / 7) + 1,
    status: today < start ? "upcoming" : today > end ? "ended" : "active",
    raceDate: plan.raceDate ? calendarKey(plan.raceDate) : null };
}
