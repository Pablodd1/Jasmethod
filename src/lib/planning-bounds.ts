import { clockMinutes, doubleDayReadiness } from "./double-day";
import type {GeneratedWeek,PlanSession} from "./science";
import type {PlanningSetup} from "./planning-setup";
export type BoundedPlanSession = PlanSession & {daySlot:number; startTime?:string; doubleDayRole?:"primary"|"secondary"; movedFromSlot?:number};
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
export function boundPlanWeeks(weeks: GeneratedWeek[], setup: PlanningSetup, weeklyHours: number, startWeekday: number, level?: string | null, doubleDayExcludedWeeks: number[] = []) {
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
    // One session per day by default; no unagreed template overlap.
    const seenSlots=new Set<number>();
    const singleCandidates=candidates.filter(s=>{if(seenSlots.has(s.daySlot))return false;seenSlots.add(s.daySlot);return true;});
    candidates.splice(0,candidates.length,...singleCandidates);
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
    let doubleDayNote="No optional double day selected; single-session scheduling retained.";
    const preference=setup.doubleDay;
    const consent=doubleDayReadiness(preference,setup.trainingDays);
    if(preference) {
      doubleDayNote=consent.reasons.join(" ");
      if(consent.ready) {
        const slot=(preference.weekday-startWeekday+7)%7;
        const primary=sessions.find(s=>s.daySlot===slot);
        const donor=sessions.find(s=>s.daySlot!==slot && ['run','bike','swim','mobility'].includes(s.sport) && /^z[12]$/.test(s.zone) && !['race','test','speed','interval','threshold','plyo'].includes(s.type));
        if(doubleDayExcludedWeeks.includes(weekIndex) || /taper|race|test|freshness|sharpening|deload/i.test(week.theme) || sessions.some(s=>['race','test'].includes(s.type))) doubleDayNote="Optional pair omitted in this race/test/taper week; keep the single-session schedule.";
        else if(!primary||!donor) doubleDayNote="No suitable existing priority/easy pair fits this weekday. No extra session was invented.";
        else if(primary.minutes+donor.minutes>(setup.maxSessionMinutes??0)) doubleDayNote="The pair exceeds your daily time limit; the single-session schedule is retained.";
        else if(clockMinutes(preference.firstStart)+primary.minutes>=clockMinutes(preference.secondStart)||clockMinutes(preference.secondStart)+donor.minutes>1440) doubleDayNote="The selected times do not leave separation or finish within the day. The single-session schedule is retained.";
        else {
          const from=donor.daySlot;
          primary.startTime=preference.firstStart;primary.doubleDayRole="primary";
          donor.movedFromSlot=from;donor.daySlot=slot;donor.startTime=preference.secondStart;donor.doubleDayRole="secondary";
          donor.description += " Optional second session: report the first session and complete a new check-in before proceeding. Declining never creates catch-up work.";
          doubleDayNote=`Optional pair scheduled: ${primary.title} at ${primary.startTime}, then ${donor.title} at ${donor.startTime}, moved from ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][(startWeekday+from)%7]}. Purpose: ${preference.purpose}. No weekly minutes added; separation is logistical, not a guarantee of recovery.`;
          sessions.sort((a,b)=>a.daySlot-b.daySlot||(a.startTime||'').localeCompare(b.startTime||''));
        }
      }
    }
    const populatedSlots=new Set(sessions.map(session=>session.daySlot));
    const restDaySlots=Array.from({length:7},(_,slot)=>slot).filter(slot=>!populatedSlots.has(slot));
    return {...week,sessions,restDaySlots,doubleDayNote,totalMinutes:sessions.reduce((sum,session)=>sum+session.minutes,0)};
  })};
}
