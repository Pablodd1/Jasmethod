import type {GeneratedWeek,PlanSession} from "./science";
import type {PlanningSetup} from "./planning-setup";
export type BoundedPlanSession = PlanSession & {daySlot:number};
/** Product planning defaults, not scientifically validated recovery thresholds.
 * Intermediate is stored as amateur. Advanced retains a conservative day off;
 * only an explicitly professional profile has no fixed minimum. */
export function levelRecoveryPolicy(level?: string | null) {
  const minimumRestDays = level === "pro" ? 0 : ["amateur", "intermediate", "advanced"].includes(level ?? "") ? 1 : 2;
  return { minimumRestDays, maximumTrainingDays: 7 - minimumRestDays,
    note: "Suggested planning defaults only. Availability, symptoms, fatigue and coach review may require more rest. No fixed rest minimum never requires seven training days." };
}
/** Reduction-only pilot constraints. Preserve generator day order; unavailable
 * days are omitted, never made up or stacked onto an available day. These are
 * implementation limits for review, not a claimed validated coaching model. */
export function boundPlanWeeks(weeks: GeneratedWeek[], setup: PlanningSetup, weeklyHours: number, startWeekday: number, level?: string | null) {
  const recoveryPolicy = levelRecoveryPolicy(level);
  const weeklyBudget = Math.min(weeklyHours*60, setup.baselineWeeklyMinutes ?? 0, (setup.maxSessionMinutes ?? 0)*setup.trainingDays.length);
  const hardAbsoluteDays: number[] = [];
  return {weeklyBudget, recoveryPolicy, weeks:weeks.map((week, weekIndex)=>{
    const hardDays:number[]=[];
    const candidates = week.sessions.map((session,index)=>({...session,daySlot:index%7}))
      .filter(session=>setup.trainingDays.includes((startWeekday+session.daySlot)%7))
      // A template rest suggestion is not compulsory training or an activity
      // completion. Optional recovery movement is offered separately on Today.
      .filter(session=>session.sport!=="recovery")
      .sort((a,b)=>a.daySlot-b.daySlot);
    const trainingSlots = new Set(candidates.map(session=>session.daySlot));
    // Existing empty/unavailable slots already satisfy the rest minimum.
    // Preserve explicit race/test and quality-session purposes first. This
    // deterministic tie-break is a scheduling heuristic, not an optimal or
    // scientifically individualized placement of rest days.
    const preferredRestOrder=[6,2,0,4,1,3,5];
    const importance=(session:PlanSession)=>["race","test"].includes(session.type)?1000:
      ["speed","threshold","interval","plyo"].includes(session.type)?40:
      session.type==="recovery"||session.sport==="mobility"?0:20;
    const restCandidates=[...trainingSlots].sort((a,b)=>{
      const priority=(slot:number)=>Math.max(...candidates.filter(s=>s.daySlot===slot).map(importance));
      return priority(a)-priority(b)||preferredRestOrder.indexOf(a)-preferredRestOrder.indexOf(b);
    });
    for (const slot of restCandidates) {
      if(trainingSlots.size<=recoveryPolicy.maximumTrainingDays) break;
      trainingSlots.delete(slot);
    }
    const available = candidates.filter(session=>trainingSlots.has(session.daySlot))
      .filter(session=>{
        if(Number(session.zone.slice(1))<4) return true;
        // At most one hard session on a day, never adjacent hard days (including
        // a week boundary in a repeated schedule). Missing work is not made up.
        if(hardDays.some(day=>Math.min(Math.abs(day-session.daySlot),7-Math.abs(day-session.daySlot))<=1)) return false;
        const absoluteDay=weekIndex*7+session.daySlot;
        if(hardAbsoluteDays.some(day=>Math.abs(day-absoluteDay)<=1)) return false;
        hardDays.push(session.daySlot);hardAbsoluteDays.push(absoluteDay);return true;
      });
    const total=available.reduce((sum,session)=>sum+session.minutes,0);
    const factor=total>weeklyBudget?weeklyBudget/total:1;
    const dayTotals=new Map<number,number>();
    const sessions:BoundedPlanSession[]=available.map(session=>{
      const remaining=(setup.maxSessionMinutes ?? 0)-(dayTotals.get(session.daySlot)??0);
      const minutes=Math.max(0,Math.min(remaining,Math.floor(session.minutes*factor)));
      dayTotals.set(session.daySlot,(dayTotals.get(session.daySlot)??0)+minutes);
      return {...session,minutes,description:`${session.description} Duration is bounded by your reported recent tolerated training and available time. Use the confirmed daily instructions. Omitted work is not made up.`};
    }).filter(session=>session.minutes>0);
    const populatedSlots=new Set(sessions.map(session=>session.daySlot));
    const restDaySlots=Array.from({length:7},(_,slot)=>slot).filter(slot=>!populatedSlots.has(slot));
    return {...week,sessions,restDaySlots,totalMinutes:sessions.reduce((sum,session)=>sum+session.minutes,0)};
  })};
}
