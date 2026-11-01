import type {GeneratedWeek, PlanSession} from './science';
import type {BoundedPlanSession} from './planning-bounds';
import {validCoachingMetadata} from './coaching-prescription';

/** Deterministic allocation, not a physiological model. Complete coaching units
 * are selected within time and recovery constraints; no discarded work is made
 * up, no strength dose is stretched and no second daily session is invented. */
export function scheduleCoachingWeek(week:GeneratedWeek, availableSlots:number[], maximumDays:number,
  weeklyBudget:number, dailyLimit:number, weekIndex:number, previousHardDays:readonly number[], preferredEnduranceSlots:readonly number[]=[]) {
  const hard=(s:PlanSession)=>s.coaching?.demanding ?? (Number(s.zone.slice(1))>=4 || ['strength','hyrox'].includes(s.sport));
  const entries=week.sessions.map((session,index)=>({session,index}));
  const eligible=entries.filter(({session})=>session.sport!=='recovery' && session.minutes>0 &&
    session.minutes<=dailyLimit && session.minutes>=(session.coaching?.minimumMinutes??1));
  // Sport coverage is prioritized before supporting dose; a brick contributes
  // only the explicitly represented legs, never an assumed swim component.
  const score=(chosen:typeof entries)=>{
    const sports=new Set(chosen.flatMap(({session:s})=>s.sport==='brick'&&s.minutes>=40&&validCoachingMetadata(s.coaching,'brick')&&s.coaching.recipe==='brick'?['bike','run']:['swim','bike','run','hyrox'].includes(s.sport)?[s.sport]:[]));
    const support=Math.min(2,chosen.filter(({session})=>session.sport==='strength').length);
    return sports.size*100000+support*10000+chosen.filter(({session})=>session.sport==='brick').length*1000+
      chosen.reduce((n,{session:s})=>n+100-(s.coaching?.priority??5),0);
  };
  const subsets:Array<{chosen:typeof entries;score:number}>=[];
  const enumerate=(index:number,chosen:typeof entries,minutes:number)=>{
    if(chosen.length>Math.min(maximumDays,availableSlots.length)||minutes>weeklyBudget)return;
    if(index===eligible.length){subsets.push({chosen:[...chosen],score:score(chosen)});return;}
    enumerate(index+1,[...chosen,eligible[index]],minutes+eligible[index].session.minutes);
    enumerate(index+1,chosen,minutes);
  };
  enumerate(0,[],0);
  subsets.sort((a,b)=>b.score-a.score);
  let sessions:BoundedPlanSession[]=[];
  let selected=new Set<number>();
  for(const {chosen} of subsets){
    const ordered=[...chosen].sort((a,b)=>Number(['race','test'].includes(b.session.type))-Number(['race','test'].includes(a.session.type)) || Number(hard(b.session))-Number(hard(a.session)) || a.index-b.index);
    const placed:BoundedPlanSession[]=[];
    const openingSport=chosen.find(({session})=>['swim','bike','run'].includes(session.sport))?.session.sport;
    let preferPrimaryOpening=true;
    const assign=(index:number):boolean=>{
      if(index===ordered.length)return true;
      const {session,index:sourceIndex}=ordered[index];
      const slots=['race','test'].includes(session.type)?[sourceIndex%7]:availableSlots;
      for(const daySlot of slots){
        if(!availableSlots.includes(daySlot)||placed.some(s=>s.daySlot===daySlot))continue;
        if(preferredEnduranceSlots.includes(daySlot)&&!['run','bike','swim'].includes(session.sport))continue;
        if(preferPrimaryOpening&&openingSport&&daySlot===availableSlots[0]&&session.sport!==openingSport&&!['race','test'].includes(session.type))continue;
        const absolute=weekIndex*7+daySlot;
        if(hard(session)&&(previousHardDays.some(day=>Math.abs(day-absolute)<=1)||placed.some(s=>hard(s)&&Math.abs(s.daySlot-daySlot)<=1)))continue;
        placed.push({...session,daySlot});
        if(assign(index+1))return true;
        placed.pop();
      }
      return false;
    };
    let assigned=assign(0);
    // Primary-sport opening is a presentation/coaching preference, never a
    // reason to discard a feasible complete unit or violate recovery spacing.
    if(!assigned){preferPrimaryOpening=false;assigned=assign(0);}
    if(assigned){sessions=placed.sort((a,b)=>a.daySlot-b.daySlot);selected=new Set(chosen.map(e=>e.index));break;}
  }
  let introductoryFallback=false;
  // A very small reported capacity cannot support the original complete units.
  // Offer separate short familiar aerobic practice, never a compressed strength,
  // interval, station or brick prescription. Original omissions remain visible.
  if(!sessions.length&&entries.length&&dailyLimit>=5&&weeklyBudget>=5&&week.totalMinutes>=5){
    const enduranceSports=[...new Set(entries.filter(({session})=>!['race','test'].includes(session.type)).flatMap(({session})=>['swim','bike','run'].includes(session.sport)?[session.sport]:session.sport==='hyrox'?['run' as const]:session.sport==='brick'?['bike' as const]:[]))];
    const fallbackBudget=Math.floor(Math.min(weeklyBudget,week.totalMinutes));
    let remaining=fallbackBudget;
    for(const [index,daySlot] of availableSlots.slice(0,Math.min(3,maximumDays)).entries()){
      if(!enduranceSports.length||remaining<5)break;
      const sport=enduranceSports[index%enduranceSports.length];
      const minutes=Math.floor(Math.min(10,dailyLimit,remaining));
      sessions.push({sport,minutes,daySlot,zone:'z1',type:'endurance',title:`${sport} · short introductory practice`,
        description:'Short familiar comfortable practice within your reported time. Follow the complete warm-up, easy main work and cool-down. This introductory alternative does not replace the omitted sport, strength or brick development components. Stop for symptoms and review tolerance before progressing.',
        coaching:{recipe:'aerobic',phase:'foundation',purpose:'Observe tolerance to short familiar easy movement; no threshold, intensity progression or complete race preparation is inferred.',minimumMinutes:5,demanding:false,role:'primary',priority:1}});
      remaining-=minutes;
    }
    introductoryFallback=sessions.length>0;
  }
  const omitted=entries.filter(e=>!selected.has(e.index)).map(({session})=>({title:session.title,
    purpose:session.coaching?.purpose??session.type,
    reason:session.minutes>dailyLimit?'Complete session exceeds the daily time limit.':
      session.minutes<(session.coaching?.minimumMinutes??1)?'Complete session is below its minimum executable dose.':
      'Complete session does not fit available days, weekly time, rest or demanding-session separation. No catch-up work was added.'}));
  const total=sessions.reduce((n,s)=>n+s.minutes,0);
  return {sessions,hardDays:sessions.filter(hard).map(s=>weekIndex*7+s.daySlot),
    decision:{method:'coaching-complete-units-v1',templateTargetMinutes:week.totalMinutes,allocatedMinutes:total,
      unallocatedMinutes:Math.max(0,Math.min(weeklyBudget,week.totalMinutes)-total),omitted,
      note:introductoryFallback?'Reduced component coverage: short introductory aerobic alternatives only. Original units did not fit; review omitted purposes and tolerance before progressing.':omitted.length?'Reduced component coverage: review omitted purposes before accepting this schedule.':'Complete template units fit the reviewed limits. No extra minutes or double sessions added.'}};
}
