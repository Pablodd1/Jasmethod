import { createHash } from 'node:crypto';
import { addDaysKey } from './dates';
import { isCoachDate, validateCoachCandidates, type CoachCandidate, type CandidateContext } from './coach-conversation';

export type CoachChange = {kind:'profile'|'workout_plan'|'workout_feedback';field:string;value:string|number;unit:string|null;evidence:string};
const edit = /\b(?:change|chnage|chage|update|udpate|set|correct|make|shorten|reduce|extend|switch|log|record|save|cambia|cambiar|actualiza|ajusta|pon|registra|guarda)\b/i;
/** Dates are resolved by JMM, never by the model. No silent locale/date guess. */
export function coachRequestedDay(message:string,today:string):string|null {
  const keys=new Set<string>();
  for(const m of message.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) {if(!isCoachDate(m[0]))return null;keys.add(m[0]);}
  if(/\b(?:today|todays|today's|hoy)\b/i.test(message))keys.add(today);
  if(/\b(?:tomorrow|mañana|manana)\b/i.test(message))keys.add(addDaysKey(today,1));
  if(/\b(?:yesterday|ayer)\b/i.test(message))keys.add(addDaysKey(today,-1));
  if(/\b(?:next|last|proxim[oa]|pasad[oa])\s+\w+|\b\d{1,2}[/-]\d{1,2}\b/i.test(message.replace(/\d{4}-\d{2}-\d{2}/g,'')))return null;
  return keys.size===1?[...keys][0]:null;
}
export function coachAutoSessionDay(message:string,today:string):string|null {
  return edit.test(message)&&/\b(?:workout|session|training|run|ride|swim|entrenamiento|sesion|sesión|carrera|bici|natacion|natación)\b/i.test(message)?coachRequestedDay(message,today):null;
}
const wordNumbers:Record<string,number>={one:1,a:1,an:1,two:2,half:.5,una:1,un:1,dos:2,media:.5};
function supportedNumber(c:CoachChange):boolean {
  if(typeof c.value!=='number')return true;
  const evidence=c.evidence.toLowerCase().replace(/,/g,'.').replace(/\bhalf an? (?=hour)/g,'half ');
  const units:Record<string,string>={kg:'kg|kilograms?|kilos?|lb|lbs|pounds?|libras?',min:'minutes?|mins?|minutos?|hours?|hrs?|horas?',W:'w|watts?|vatios?',bpm:'bpm',kcal:'kcal|calories|calorías|calorias',cm:'cm',year:'', 'h/week':'hours?|hrs?|horas?|h', '0-10':''};
  const rule=units[c.unit||''];
  if(rule===undefined)return false;
  const pattern=new RegExp(`\\b(\\d+(?:\\.\\d+)?|one|two|half|an?|una?|dos|media)${rule?`\\s*(${rule})\\b`:''}`,'gi');
  return [...evidence.matchAll(pattern)].some(m=>{
    let amount=wordNumbers[m[1]]??Number(m[1]);
    if(c.unit==='kg'&&/^(?:lb|pound|libra)/.test(m[2]||''))amount=Math.round(amount*.45359237*100)/100;
    if(c.unit==='min'&&/^(?:hour|hr|hora)/.test(m[2]||''))amount*=60;
    return Number.isFinite(amount)&&Math.abs(amount-Number(c.value))<.000001;
  });
}
function supportedEnum(c:CoachChange):boolean {
  if(typeof c.value!=='string')return true;
  const aliases:Record<string,string>={run:'run|running|ran|correr|carrera',bike:'bike|cycling|ride|bici|ciclismo',swim:'swim|swimming|nadar|natacion|natación',strength:'strength|weights|fuerza|pesas',mobility:'mobility|movilidad',recovery:'recovery|recuperacion|recuperación',brick:'brick',hyrox:'hyrox',other:'other|otro',beginner:'beginner|principiante',amateur:'amateur|intermediate|intermedio',advanced:'advanced|avanzado',pro:'pro|professional|profesional',completed:'completed|finished|completado|termine|terminé',partial:'partial|stopped early|cut short|parcial',substituted:'substituted|instead|sustituido',skipped:'skipped|missed|omitido|no hice',sprint:'sprint',olympic:'olympic|olimpico|olímpico',half:'70[.]3|half ironman|half.distance',full:'140[.]6|full ironman', '5k':'5\\s?k(?:m)?','10k':'10\\s?k(?:m)?','half-marathon':'half[ -]marathon|media marat[oó]n',marathon:'marathon|marat[oó]n','run-only':'run|running|correr|carrera',cycle:'bike|cycling|ciclismo','swim-only':'swim|swimming|nataci[oó]n','track-sprint':'track sprint|pista'};
  if(c.field==='intensity')return /^z[1-7]$/.test(c.value)&&new RegExp(`\\b(?:z|zone|zona)\\s*${c.value.slice(1)}\\b`,'i').test(c.evidence);
  return Object.hasOwn(aliases,c.value)&&new RegExp(`\\b(?:${aliases[c.value]})\\b`,'i').test(c.evidence);
}
/** Model output can propose typed values; it cannot choose athletes, records,
 * dates or operations. Current-message evidence + explicit confirmation required. */
export function groundCoachChanges(raw:unknown,message:string,context:CandidateContext):CoachCandidate[] {
  if(!Array.isArray(raw)||raw.length>12||!message.trim()||/[<>]|ignore (?:all|previous|system)|system prompt|developer message|exfiltrate/i.test(message))return [];
  if(/\b(?:maybe|hypothetically|suppose|not sure|quizás|quizas|tal vez|supongamos)\b/i.test(message))return [];
  if(/\b(?:my (?:friend|partner|wife|husband|coach)|mi (?:amig[oa]|pareja|espos[oa]|entrenador)|what if|if i|if my|used to|last year|last month|previously|el año pasado|antes pesaba)\b/i.test(message))return [];
  if(/\b(?:do not|don't|not|no|nunca)\s+(?:change|set|update|correct|make|shorten|reduce|extend|switch|log|record|save|cambies|cambiar|actualices|ajustes|guardes|registres)|\bnot\s+\d/i.test(message))return [];
  if(!edit.test(message)&&(/[?¿]/.test(message)||/\b(?:should|would|what|why|how|debería|deberia|que|cómo)\b/i.test(message)))return [];
  const ownsFact=/\b(?:i am|i'm|i weigh|my|mi|peso|soy|mido|i did|i ran|i rode|i swam)\b/i.test(message);
  const availableTime=/\b(?:i (?:only )?have|i can spare|tengo|solo tengo|dispongo de)\b/i.test(message)&&/\b(?:minutes?|mins?|hours?|hour|minutos?|horas?)\b/i.test(message);
  if(!edit.test(message)&&!ownsFact&&!availableTime)return [];
  const requestedDay=coachRequestedDay(message,context.localToday);
  const candidates=raw.flatMap((item):CoachCandidate[]=>{
    if(!item||typeof item!=='object'||Array.isArray(item))return [];
    const c=item as CoachChange;
    if(Object.keys(c).sort().join(',')!=='evidence,field,kind,unit,value'||typeof c.field!=='string'||(c.unit!==null&&typeof c.unit!=='string')||!['string','number'].includes(typeof c.value)||!['profile','workout_plan','workout_feedback'].includes(c.kind)||typeof c.evidence!=='string'||c.evidence.length>500||!c.evidence.trim()||!message.includes(c.evidence)||!supportedNumber(c)||!supportedEnum(c))return [];
    const workout=c.kind!=='profile';
    if(!edit.test(message)&&!ownsFact&&availableTime&&(c.kind!=='workout_plan'||c.field!=='durationMin'))return [];
    if(c.field==='ftp'&&/\b(?:target|goal|hope|objetivo|meta)\b/i.test(message))return [];
    if(!workout&&requestedDay&&requestedDay!==context.localToday)return [];
    if(c.field==='weightKg'&&/\b(?:want to weigh|will weigh|goal weight|target weight|quiero pesar|peso objetivo)\b/i.test(message))return [];
    if(workout&&(!context.sessionId||!context.sessionDate||(requestedDay&&requestedDay!==context.sessionDate)))return [];
    if(workout&&!requestedDay&&/\b\d{4}-\d{2}-\d{2}\b|\b(?:today|today's|todays|tomorrow|yesterday|hoy|manana|mañana|ayer)\b/i.test(message))return [];
    // Temporal ambiguity never inherits a selected record's date.
    if(workout&&/\b(?:next|last)\s+\w+|\b\d{1,2}[/-]\d{1,2}\b/i.test(message.replace(/\d{4}-\d{2}-\d{2}/g,'')))return [];
    const candidate={...c,id:`intent_${createHash('sha256').update(JSON.stringify([c,context])).digest('hex').slice(0,24)}`,observedDate:workout?context.sessionDate!:requestedDay||context.localToday,source:context.source||'text',status:'proposed' as const,...(workout?{sessionId:context.sessionId}:{}),warnings:['AI interpreted this request. Check the exact value, date, unit and workout before confirming.']};
    return [candidate];
  });
  return validateCoachCandidates(candidates,{localToday:context.localToday});
}
export function coachPlanChangeWarnings(candidates:CoachCandidate[],session:{durationMin:number;intensity:string|null;sport:string}|null) {
  return candidates.map(c=>{
    if(c.kind!=='workout_plan'||!session)return c;
    const note=c.field==='durationMin'&&typeof c.value==='number'&&c.value>session.durationMin?`Requested duration rises from ${session.durationMin} to ${c.value} min. This is your requested edit, not an automatic dose recommendation; review the cycle and recovery before confirming.`
      :c.field==='intensity'&&typeof c.value==='string'&&Number(c.value.slice(1))>Number(session.intensity?.slice(1))?'Requested intensity is higher than the saved effort label. Review recovery and the cycle; a request or confirmation is not clearance to train.'
      :c.field==='sport'&&c.value!==session.sport?'Changing sport requires rebuilding its steps and relevant targets. Cycling power references cannot become running or swimming targets.':null;
    return note?{...c,warnings:[...(c.warnings||[]),note].slice(0,5)}:c;
  });
}
