import { dateKey, localDate, addDaysKey } from './dates';
export const DOUBLE_DAY_VERSION = 'optional-double-day-v1';
export interface DoubleDayPreference {
  version: typeof DOUBLE_DAY_VERSION;
  weekday: number;
  purpose: string;
  firstStart: string;
  secondStart: string;
  athleteAgreed: boolean;
  priorTolerance: boolean;
  foodFluidsAvailable: boolean;
  recheckBetween: boolean;
}
export function clockMinutes(value: unknown): number {
  if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw Error('Double-day times must be HH:mm.');
  return Number(value.slice(0,2))*60+Number(value.slice(3));
}
export function doubleDayTiming(day:string,timezone:string,pair:readonly {startTime:string;durationMin:number}[]) {
  if(pair.length!==2) throw Error('A double day requires exactly two sessions.');
  const starts=pair.map(s=>{
    const date=localDate(day,timezone,s.startTime);
    const formatted=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
    if(dateKey(date,timezone)!==day||formatted!==s.startTime) throw Error('A selected double-day time does not exist on that local date.');
    return date.getTime();
  });
  if(starts[0]+pair[0].durationMin*60000>=starts[1]||starts[1]+pair[1].durationMin*60000>localDate(addDaysKey(day,1),timezone).getTime()) throw Error('The pair overlaps or runs beyond the local day. Choose other times.');
  return starts;
}
export function parseDoubleDay(value: unknown): DoubleDayPreference|null {
  if(value==null) return null;
  if(typeof value!=='object'||Array.isArray(value)) throw Error('Invalid optional double-day setup.');
  const p=value as Record<string,unknown>;
  const keys=['version','weekday','purpose','firstStart','secondStart','athleteAgreed','priorTolerance','foodFluidsAvailable','recheckBetween'];
  if(Object.keys(p).some(k=>!keys.includes(k)) || p.version!==DOUBLE_DAY_VERSION) throw Error('Invalid optional double-day version or field.');
  if(!Number.isInteger(p.weekday)||Number(p.weekday)<0||Number(p.weekday)>6) throw Error('Choose the optional double-day weekday.');
  if(typeof p.purpose!=='string'||!p.purpose.trim()||p.purpose.length>500) throw Error('Describe why this optional pair supports your goal.');
  if(clockMinutes(p.secondStart)<=clockMinutes(p.firstStart)) throw Error('The second session must start after the first.');
  for(const key of ['athleteAgreed','priorTolerance','foodFluidsAvailable','recheckBetween']) if(typeof p[key]!=='boolean') throw Error(`Confirm double-day ${key}; missing is not yes.`);
  return {...p,purpose:p.purpose.trim()} as unknown as DoubleDayPreference;
}
export function doubleDayReadiness(p:DoubleDayPreference|null|undefined,trainingDays:number[]) {
  const reasons:string[]=[];
  if(!p) return {ready:false,reasons:['No optional double day selected.']};
  if(!p.athleteAgreed) reasons.push('The athlete has not agreed to an optional double day.');
  if(!p.priorTolerance) reasons.push('Comparable double-session tolerance needs review before automatic pairing.');
  if(!p.foodFluidsAvailable) reasons.push('Confirm access to food and fluids between the sessions.');
  if(!p.recheckBetween) reasons.push('Agree to report the first session and complete a new check-in before the second.');
  if(!trainingDays.includes(p.weekday)) reasons.push('The selected weekday is not an available training day.');
  return {ready:!reasons.length,reasons};
}
export interface DoubleDaySlot { id?:string; sport:string; type:string; intensity:string; durationMin:number; startTime:string; }
export interface DoubleDayPlan {
  version:typeof DOUBLE_DAY_VERSION; setupRevision:string; dateLocal:string; purpose:string;
  role:'primary'|'secondary'; invalidated?:boolean; pair: [DoubleDaySlot,DoubleDaySlot];
}
export function hasDoubleDayMetadata(workout:{originalPlan?:string|null}) {
  if(workout.originalPlan==null) return false;
  try{const value=JSON.parse(workout.originalPlan);return value===null||typeof value!=='object'||Object.prototype.hasOwnProperty.call(value,'doubleDay');}catch{return true;}
}
export function doubleDayPlan(workout:{originalPlan?:string|null}): DoubleDayPlan|null {
  try {
    const p=JSON.parse(workout.originalPlan||'{}').doubleDay;
    if(!p || p.version!==DOUBLE_DAY_VERSION || !['primary','secondary'].includes(p.role) || typeof p.setupRevision!=='string' || !Array.isArray(p.pair)||p.pair.length!==2) return null;
    if(typeof p.dateLocal!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.dateLocal)||typeof p.purpose!=='string') return null;
    if(p.pair[0]?.id===p.pair[1]?.id)return null;
    for(const s of p.pair) {clockMinutes(s.startTime);if(typeof s.id!=='string'||!s.id||!Number.isFinite(s.durationMin)||s.durationMin<=0||typeof s.sport!=='string'||typeof s.type!=='string'||!/^z[1-7]$/.test(s.intensity)) return null;}
    return p;
  }catch{return null;}
}
export function doubleDaySnapshotMatches(w:any,slot:DoubleDaySlot) {
  let original:any;
  try{original=JSON.parse(w.originalPlan||'{}');}catch{return false;}
  return w.id===slot.id && original.sport===slot.sport && original.type===slot.type && original.intensity===slot.intensity && original.durationMin===slot.durationMin
    && w.sport===slot.sport && w.startTime===slot.startTime && w.durationMin<=slot.durationMin;
}
export function reviewSecondaryDoubleDay(input:{workout:any;sameDay:any[];preference:DoubleDayPreference|null|undefined;setupRevision:string|null;setupSource?:string;timezone:string;checkinRecordedAt:number;now:Date}) {
  const plan=doubleDayPlan(input.workout);
  const reason=(message:string)=>`Optional second session on hold: ${message} You can decline or skip it without making it up.`;
  const referencedAsSecond=input.sameDay.find(w=>w.id!==input.workout.id&&doubleDayPlan(w)?.pair[1]?.id===input.workout.id);
  if(referencedAsSecond && (!plan||plan.role!=='secondary'||JSON.stringify(doubleDayPlan(referencedAsSecond)!.pair)!==JSON.stringify(plan.pair))) return reason('paired records disagree about this second session. Review the plan before proceeding.');
  if(!plan) return (hasDoubleDayMetadata(input.workout)||referencedAsSecond)?reason('saved pair metadata is invalid or unavailable. Review a new plan; it cannot establish agreement.'):null;
  if(plan.pair[plan.role==='primary'?0:1].id!==input.workout.id) return reason('the saved session identity does not match its agreed position.');
  if(plan.role==='primary') return null;
  if(plan.invalidated) return reason('the agreed session was edited. Review a new paired plan.');
  const pref=input.preference;
  if(!pref||input.setupSource!=='athlete_reported'||!doubleDayReadiness(pref,[pref.weekday]).ready||input.setupRevision!==plan.setupRevision)
    return reason('athlete agreement or setup changed. Review a new plan preview; keep the single-session plan.');
  const day=dateKey(input.workout.date,input.timezone);
  if(day!==plan.dateLocal||new Date(`${day}T12:00Z`).getUTCDay()!==pref.weekday||pref.firstStart!==plan.pair[0].startTime||pref.secondStart!==plan.pair[1].startTime||pref.purpose!==plan.purpose)
    return reason('the agreed date, purpose or timing changed. Review the pair again.');
  const first=input.sameDay.find(w=>{const p=doubleDayPlan(w);return w.userId===input.workout.userId&&w.id===plan.pair[0].id&&w.id!==input.workout.id&&p?.role==='primary'&&p.purpose===plan.purpose&&p.setupRevision===plan.setupRevision&&p.dateLocal===plan.dateLocal&&JSON.stringify(p.pair)===JSON.stringify(plan.pair);});
  if(!first||doubleDayPlan(first)?.invalidated||!doubleDaySnapshotMatches(first,plan.pair[0])||!doubleDaySnapshotMatches(input.workout,plan.pair[1])) return reason('one of the agreed sessions changed or is unavailable.');
  let starts:number[];
  try{starts=doubleDayTiming(day,input.timezone,[{...plan.pair[0],durationMin:first.actualDurationMin??first.durationMin},plan.pair[1]]);}catch{return reason('the agreed times no longer leave separation within the local day.');}
  const feedbackAt=first.feedbackAt?new Date(first.feedbackAt).getTime():NaN;
  if(!['completed','partial'].includes(first.feedbackStatus)||!Number.isFinite(first.actualDurationMin)||first.actualDurationMin<=0||!Number.isFinite(first.rpe)||first.rpe<0||first.rpe>10||first.actualDurationMin>1440||!Number.isFinite(feedbackAt))
    return reason('report the first session’s actual duration and effort before starting another.');
  if(feedbackAt>=starts[1]) return reason('the first-session report arrived at or after the second planned start. Review timing rather than rushing another bout.');
  if(first.actualSport!==plan.pair[0].sport) return reason('the first session changed sport; review the pair with your coach.');
  if(!Number.isFinite(input.checkinRecordedAt)||input.checkinRecordedAt<=feedbackAt||input.checkinRecordedAt>input.now.getTime()) return reason('complete a fresh check-in after reporting the first session.');
  return null;
}
export function invalidateDoubleDay(raw: string|null|undefined): string|null|undefined {
  try{const value=JSON.parse(raw||'{}');if(!value.doubleDay)return raw;return JSON.stringify({...value,doubleDay:{...value.doubleDay,invalidated:true}});}catch{return raw;}
}
