import type {GeneratedWeek,PlanSession} from "./science";
import type {PlanningSetup} from "./planning-setup";
export type BoundedPlanSession = PlanSession & {daySlot:number};
/** Reduction-only pilot constraints. Preserve generator day order; unavailable
 * days are omitted, never made up or stacked onto an available day. These are
 * implementation limits for review, not a claimed validated coaching model. */
export function boundPlanWeeks(weeks: GeneratedWeek[], setup: PlanningSetup, weeklyHours: number, startWeekday: number) {
  const weeklyBudget = Math.min(weeklyHours*60, setup.baselineWeeklyMinutes ?? 0, (setup.maxSessionMinutes ?? 0)*setup.trainingDays.length);
  const hardAbsoluteDays: number[] = [];
  return {weeklyBudget, weeks:weeks.map((week, weekIndex)=>{
    const hardDays:number[]=[];
    const available = week.sessions.map((session,index)=>({...session,daySlot:index%7}))
      .filter(session=>setup.trainingDays.includes((startWeekday+session.daySlot)%7))
      .sort((a,b)=>a.daySlot-b.daySlot)
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
    return {...week,sessions,totalMinutes:sessions.reduce((sum,session)=>sum+session.minutes,0)};
  })};
}
