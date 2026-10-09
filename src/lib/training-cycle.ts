import { addDaysKey, dateKey } from "./dates";
import type { BoundedPlanSession } from "./planning-bounds";
import type { GeneratedWeek, ZoneKey } from "./science";

export const TRAINING_CYCLE_VERSION = "bounded-cycle-v1";
type BoundedWeek = Omit<GeneratedWeek, "sessions"> & { sessions: BoundedPlanSession[]; restDaySlots: number[]; doubleDayNote: string };
export interface CycleActivity {
  id: string; date: Date; completed: boolean; actualDurationMin: number | null;
  feedbackStatus: string | null; rpe: number | null; matchedPlanId?: string | null;
}
/** Only records of performed work count. Missing reports are never zero training. */
export function cycleActivityEvidence(rows: CycleActivity[], today: string, timezone: string) {
  const unique = rows.filter(row => !row.matchedPlanId || !rows.some(other => other.id === row.matchedPlanId));
  const performed = unique.filter(row => row.completed || (row.actualDurationMin ?? 0) > 0 || ["partial", "substituted"].includes(row.feedbackStatus || ""));
  return {
    reportedSessions: performed.length,
    reportedMinutes: performed.some(row => row.actualDurationMin != null) ? performed.reduce((sum, row) => sum + (row.actualDurationMin ?? 0), 0) : null,
    unknownDurationSessions: performed.filter(row => row.actualDurationMin == null).length,
    protectedDays: [...new Set(performed.map(row => dateKey(row.date, timezone)))],
    recoveryReview: unique.some(row => dateKey(row.date, timezone) >= addDaysKey(today, -7) && ((row.rpe ?? 0) >= 8 || ["partial", "skipped"].includes(row.feedbackStatus || ""))),
    note: "Recorded actual minutes only; unreported work and unknown durations are not treated as zero. Completion does not establish recovery or increased capacity.",
  };
}

/** Provisional reduction-only cycle, not a validated dose or a promised result.
 * It gradually approaches, but never exceeds, the previously tolerated ceiling.
 * A new baseline/review is needed to increase that ceiling. */
export function shapeTrainingCycle(weeks: BoundedWeek[], options: {
  startKey: string; raceKey: string | null; needsAssessment: boolean;
  recoveryReview: boolean; protectedDays: string[];
}) {
  const protectedDays = new Set(options.protectedDays);
  let assessmentAssigned = false;
  return weeks.map((week, index) => {
    const weekStart = addDaysKey(options.startKey, index * 7);
    const daysToRace = options.raceKey ? (Date.parse(options.raceKey) - Date.parse(weekStart)) / 86400000 : null;
    const recoveryWeek = (index + 1) % 4 === 0;
    const nearRace = daysToRace !== null && daysToRace >= 0 && daysToRace < 14;
    const postRace = daysToRace !== null && daysToRace < 0 && daysToRace >= -7;
    const rebuild = options.recoveryReview && index === 0;
    const factor = nearRace ? (daysToRace! < 7 ? .5 : .65) : postRace ? .5 : rebuild ? .6 : recoveryWeek ? .7 : Math.min(1, .8 + (index % 4) * .05 + Math.floor(index / 4) * .025);
    const theme = nearRace ? "Event preparation · reduced load" : postRace ? "Post-event recovery · review before resuming" : rebuild ? "Recovery and training review" : recoveryWeek ? "Recovery and reassessment" : options.needsAssessment && index === 0 ? "Baseline assessment and easy foundation" : `Block ${Math.floor(index / 4) + 1} · ${index % 4 === 0 ? "Foundation" : "Progressive practice"}`;
    const sessions = week.sessions.flatMap(session => {
      const key = addDaysKey(weekStart, session.daySlot);
      // An actual event is not fabricated as a workout, and prior performed work
      // must not be followed by a replacement session on that same day.
      if (protectedDays.has(key) || key === options.raceKey) return [];
      const minutes = Math.floor(session.minutes * factor);
      if (minutes < 1) return [];
      const assessment = options.needsAssessment && !assessmentAssigned && ["run", "bike", "swim"].includes(session.sport);
      if (assessment) assessmentAssigned = true;
      const cap = recoveryWeek || nearRace || postRace || rebuild || (options.needsAssessment && index < 2) ? 2 : options.needsAssessment ? 3 : 4;
      const zone = `z${Math.min(cap, Number(session.zone.slice(1)))}` as ZoneKey;
      const type = Number(zone.slice(1)) <= 2 && !["strength", "mobility", "hyrox"].includes(session.sport) ? "endurance" : session.type;
      const description = assessment
        ? `Non-maximal baseline observation: stay at a comfortable, sustainable effort${session.sport === "swim" ? " with familiar swimming and pauses as needed" : " with comfortable speech"}. Record actual minutes, effort and any symptoms afterward. This does not measure VO2max, threshold, FTP or race ability. Stop for symptoms; review before progressing.`
        : `Provisional ${theme.toLowerCase()} session. Follow the duration-matched steps, adjusted by the session-day check-in. Effort labels are not measured physiological zones. No missed work is added later.`;
      return [{ ...session, minutes, zone, type, description, title: assessment ? `${session.sport}: Comfortable baseline observation` : Number(zone.slice(1)) < Number(session.zone.slice(1)) && !["strength", "hyrox"].includes(session.sport) ? `${session.sport}: ${zone === "z2" ? "Easy" : "Controlled"} practice` : session.title }];
    });
    // Removing a performed/event date must not leave an orphaned optional pair.
    for (const session of sessions) if (session.doubleDayRole && sessions.filter(other => other.daySlot === session.daySlot && other.doubleDayRole).length !== 2) {
      delete session.doubleDayRole; delete session.movedFromSlot;
    }
    return { ...week, theme, sessions, totalMinutes: sessions.reduce((sum, session) => sum + session.minutes, 0), restDaySlots: Array.from({ length: 7 }, (_,slot) => slot).filter(slot => !sessions.some(session => session.daySlot === slot)), cycleFactor: factor,
      reviewNote: "Provisional coaching progression within your recent tolerated ceiling. Review actual work, effort and recovery before progressing; these percentages are not a validated individual response model." };
  });
}

export function savedCycleSummary(plan: { id: string; name: string; startDate: Date | string; weeks: number; raceDate?: Date | string | null }, timezone: string, today = dateKey(new Date(), timezone)) {
  const start = dateKey(new Date(plan.startDate), timezone);
  const end = addDaysKey(start, plan.weeks * 7 - 1);
  const elapsed = Math.floor((Date.parse(today) - Date.parse(start)) / 86400000);
  return { id: plan.id, name: plan.name, start, end, weeks: plan.weeks,
    currentWeek: elapsed < 0 || today > end ? null : Math.floor(elapsed / 7) + 1,
    status: today < start ? "upcoming" : today > end ? "ended" : "active",
    raceDate: plan.raceDate ? dateKey(new Date(plan.raceDate), timezone) : null };
}
