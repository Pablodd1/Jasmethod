import { startingCycle } from "./starting-cycle";
import { assessPlanningSetup, planningGoal, PLANNABLE_GOALS, type PlanningSetup } from "./planning-setup";
import { coachingWeekTemplate } from "./coaching-week-template";
import { boundPlanWeeks, planningWeeklyBudget } from "./planning-bounds";
import { cycleActivityEvidence, shapeTrainingCycle, TRAINING_CYCLE_VERSION, type CycleActivity } from "./training-cycle";
import { addDaysKey, dateKey } from "./dates";
import type { CycleEventInput } from "./cycle-events";

export const FIRST_PLAN_VERSION = "provisional-first-week-v1";
type Profile = Parameters<typeof assessPlanningSetup>[0];
/** The first week is a provisional prescription, never an inferred baseline or execution approval.
 * Separate dated capacity is required for the existing sport-specific template. Restricted
 * history cannot silently opt an athlete into manual-baseline planning. */
export function firstPlanDraft(profile: Profile, setup: PlanningSetup | null, startKey: string,
  timezone: string, records: CycleActivity[], events: CycleEventInput[], now = new Date()) {
  const goal = planningGoal(profile?.goal);
  if (!goal || !PLANNABLE_GOALS.includes(goal)) return null;
  const activity = cycleActivityEvidence(records, startKey, timezone);
  const occupied = [...new Set([...records.filter(row=>dateKey(row.date,timezone)>=startKey).map(row=>dateKey(row.date,timezone)), ...events.map(event=>event.dateKey)])];
  const readiness = assessPlanningSetup(profile,setup,now);
  const capable = !!setup && readiness.ready && !activity.historyReview && activity.derivedActivityPolicy.status === "allowed" && goal !== "track-sprint";
  if (capable) {
    // Availability alone never supplies this budget: planningWeeklyBudget takes
    // the minimum of separately reported tolerated load and time ceilings.
    const sport = goal === "cycle" ? "bike" : goal === "swim-only" ? "swim" : goal === "run-only" ? "run" : goal === "hyrox" ? "hyrox" : "triathlon";
    // Optional double days and transitions need their separate review workflow.
    const boundedSetup = {...setup, doubleDay:null};
    const raw = coachingWeekTemplate({sport,level:profile!.experience!,distance:goal,weeks:1,
      weeklyHours:planningWeeklyBudget(setup)/60,sessionLimitMinutes:setup.maxSessionMinutes!,volume:()=>1});
    const bounded = boundPlanWeeks(raw,boundedSetup,profile?.weeklyHours,new Date(`${startKey}T12:00Z`).getUTCDay(),profile?.experience,[],{preserveWeeklyDose:true});
    const shaped = shapeTrainingCycle(bounded.weeks,{startKey,needsAssessment:true,templatePeriodized:true,
      recoveryReview:activity.recoveryReview,protectedDays:occupied,events});
    const sessions = shaped[0].sessions.map(session=>({slot:session.daySlot,source:"plan",base:{
      cycleVersion:TRAINING_CYCLE_VERSION,coaching:session.coaching,title:session.title,sport:session.sport,type:session.type,
      intensity:session.zone,durationMin:session.minutes,description:session.description,startTime:null}}));
    return {version:FIRST_PLAN_VERSION,kind:"reported_capacity" as const,startKey,sessions,activity,
      baseline:{source:setup.source,observedAt:setup.baselineObservedAt,weeklyMinutes:setup.baselineWeeklyMinutes,confirmedAt:setup.confirmedAt},
      totalMinutes:sessions.reduce((sum,s)=>sum+s.base.durationMin,0),
      note:"Provisional first week bounded by separately reported recent capacity and availability. Daily readiness and sport-specific review remain required; transitions, loads and maximal efforts are not automatically cleared.",
      review:shaped[0]};
  }
  const observation = startingCycle(profile,setup,startKey,occupied,activity.derivedActivityPolicy.status!=="allowed",now);
  const sessions = observation.days.filter(day=>day.selected&&!day.occupied).map(day=>({
    slot:day.slot,source:day.minutes>0?"starter":"plan",base:{...observation.base,sport:day.sport,durationMin:day.minutes,
      title:day.minutes>0?`${day.sport} · comfortable observation`:"Review before training",
      description:day.minutes>0?day.description:observation.reasons.map(reason=>reason.en).join(" ")}
  }));
  return {version:FIRST_PLAN_VERSION,kind:"observation" as const,startKey,sessions,activity,totalMinutes:observation.totalMinutes,
    note:"Initial observation/review only; usable recent capacity is not established. This is not a complete performance cycle. Unknown and restricted work are not zero training.",review:observation};
}

export const firstPlanDateKeys = (startKey:string)=>Array.from({length:7},(_,slot)=>addDaysKey(startKey,slot));
