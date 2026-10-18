import type {BoundedPlanSession} from './planning-bounds';

/** Initial allocation of a new plan, not catch-up for missed/performed work.
 * Preserve template quality doses; redistribute only familiar easy time inside
 * the reviewed weekly/daily ceiling. This is a transparent product heuristic,
 * not a fitted response model or a scientifically established minimum dose. */
export function allocateWeeklyDose(sessions:BoundedPlanSession[],target:number,dailyLimit:number,availableSlots:number[],noFixedRest:boolean) {
  const out=sessions.map(s=>({...s}));
  const recovery=(daySlot:number):BoundedPlanSession=>({daySlot,sport:'mobility',type:'recovery',zone:'z1',minutes:20,title:'Recovery practice · familiar easy movement',description:'Choose familiar comfortable walking, mobility or another easy activity. Optional relaxed breathing or race visualization may support your routine. This uses existing weekly time, not extra work. Review the daily check-in; complete rest remains appropriate when needed.'});
  if(noFixedRest&&!out.some(s=>s.sport==='mobility'&&s.type==='recovery')&&availableSlots.every(day=>out.some(s=>s.daySlot===day))){
    const candidate=out.filter(s=>/^z[12]$/.test(s.zone)&&s.type==='endurance'&&['run','swim','bike'].includes(s.sport)&&out.filter(x=>x.sport===s.sport).length>1).sort((a,b)=>a.minutes-b.minutes||b.daySlot-a.daySlot)[0];
    if(candidate)out.splice(out.indexOf(candidate),1,recovery(candidate.daySlot));
  }
  if(noFixedRest) for(const daySlot of availableSlots) if(!out.some(s=>s.daySlot===daySlot))out.push(recovery(daySlot));
  const adjustable=(s:BoundedPlanSession)=>/^z[12]$/.test(s.zone)&&(['run','bike','swim'].includes(s.sport)&&s.type==='endurance'||s.sport==='mobility'&&s.type==='recovery');
  const capacity=(s:BoundedPlanSession)=>s.sport==='mobility'&&s.type==='recovery'?Math.min(20,dailyLimit):dailyLimit;
  const fixed=out.filter(s=>!adjustable(s)),easy=out.filter(adjustable);
  const fixedTotal=fixed.reduce((n,s)=>n+s.minutes,0);
  // Never scale a quality/strength bout up to compensate for discarded sessions.
  const goal=Math.max(0,Math.floor(Math.min(target,dailyLimit*new Set(out.map(s=>s.daySlot)).size)));
  const original=easy.map(s=>Math.max(1,s.minutes));
  const weights=original.reduce((n,v)=>n+v,0);
  const remaining=Math.max(0,goal-fixedTotal);
  easy.forEach((s,i)=>{s.minutes=Math.min(capacity(s),Math.floor(remaining*original[i]/Math.max(1,weights)));});
  let spare=goal-out.reduce((n,s)=>n+s.minutes,0);
  while(spare>0){let added=false;for(const s of easy){const day=out.filter(x=>x.daySlot===s.daySlot).reduce((n,x)=>n+x.minutes,0);if(day<dailyLimit&&s.minutes<capacity(s)){s.minutes++;spare--;added=true;if(!spare)break;}}if(!added)break;}
  return {sessions:out.filter(s=>s.minutes>0).sort((a,b)=>a.daySlot-b.daySlot),decision:{templateTargetMinutes:goal,allocatedMinutes:out.reduce((n,s)=>n+s.minutes,0),unallocatedMinutes:Math.max(0,spare),method:'template-dose-once-v2',note:'The template already contains its progression. Only easy time is allocated within reviewed limits; quality doses are not increased to fill time. Recovery practices are planning choices, not clearance or measured recovery.'}};
}
