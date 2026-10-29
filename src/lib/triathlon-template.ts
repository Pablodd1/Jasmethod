import type { GeneratedWeek, PlanSession } from './science';
/** Transparent planning defaults, not a validated athlete dose. Daily checks,
 * dated sport anchors, event windows and coach review still govern execution. */
export function reviewedTriathlonTemplate(options:{weeks:number;weeklyHours:number;volume:(index:number)=>number}):GeneratedWeek[]{
 return Array.from({length:options.weeks},(_,index)=>{
  const factor=options.volume(index),budget=Math.max(0,Math.round(options.weeklyHours*60*Math.min(1,factor)));
  const quality=index%6>=2&&index%6<5;
  const doses=[.075,.32,.15,.075,.23,.15];
  const sports=['swim','bike','run','swim','bike','run'] as const;
  const sessions:PlanSession[]=sports.map((sport,i)=>{
   const hard=quality&&(i===1||i===5),zone=hard?'z4':'z2';
   const cap=hard?90:sport==='swim'?75:sport==='run'?120:240;
   return {sport,minutes:Math.min(cap,Math.max(1,Math.floor(budget*doses[i]))),zone,type:hard?'threshold':'endurance',
    title:sport==='swim'?'Swim: Aerobic practice · structure review required':hard?`${sport}: Provisional threshold intervals`:i===4?'Bike: Long aerobic practice':i===5?'Run: Long aerobic practice':`${sport}: Easy aerobic practice`,
    description:'Provisional sport-specific template. Two swims, two rides and two runs are retained where availability permits. Numerical targets require current dated sport evidence. Swim length, stroke, repetitions and rests require explicit pool/open-water review before FIT export. Run-off-bike and race rehearsal require a reviewed structured brick; this template does not pretend to prescribe one. Missing minutes are not redistributed beyond sport/session ceilings.'};
  });
  return {week:index+1,templateVersion:'triathlon-foundation-v2',theme:index%6===5?'Recovery and response review':quality?'Structured development · sport evidence and daily review required':'Aerobic practice and response review',periodizationFactor:factor,sessions,totalMinutes:sessions.reduce((sum,s)=>sum+s.minutes,0)};
 });
}
