import { dateKey } from "./dates";
import { AI_DATA_POLICY_VERSION } from "./ai-data-policy";
import { readManualPersonalBests } from "./onboarding-evidence";
import { readSportHeartRate, SPORT_HR_SPORTS, type SportHrSport } from "./sport-heart-rate";
import { fmtPace, fmtSpeed, fmtSwimPace, unitsOf, type UnitSystem } from "./units";

const definitions = {
  maxHr:{en:"Maximum heart-rate reference",es:"Referencia de frecuencia cardíaca máxima",unit:"bpm",min:80,max:240},
  lthr:{en:"Threshold heart-rate reference",es:"Referencia de frecuencia cardíaca umbral",unit:"bpm",min:60,max:230},
  restingHr:{en:"Resting heart-rate reference",es:"Referencia de frecuencia cardíaca en reposo",unit:"bpm",min:25,max:150},
  ftp:{en:"Cycling FTP reference",es:"Referencia de FTP de ciclismo",unit:"W",min:20,max:700},
  runPaceBase:{en:"Running threshold-pace reference",es:"Referencia de ritmo umbral de carrera",unit:"sec/km",min:120,max:1200},
  swimPaceBase:{en:"Swimming CSS reference",es:"Referencia CSS de natación",unit:"sec/100m",min:30,max:600},
} as const;
export type ProfileReferenceField = keyof typeof definitions;
export type ProfileReferenceQuery = { fields:ProfileReferenceField[]; sports:SportHrSport[]; ambiguousPace:boolean };
export type ProtectedProfileField = {
  field:ProfileReferenceField; label:string; sport:SportHrSport|"unscoped";
  value:number|null; unit:"bpm"|"W"|"sec/km"|"sec/100m"; display:string;
  source:"saved_profile"|"athlete_reported_reference"; observedAt:string|null;
  provenance:"unverified"|"athlete_reported"; note:string;
};
export type ProtectedProfileAnswer = {
  kind:"profile_reference"; privacy:"local_only"; sourceMessageId:string; title:string; answer:string;
  displayUnits:UnitSystem; fields:ProtectedProfileField[]; clarification:string|null;
};
const normalize=(text:string)=>text.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
/** Read-only intent only. This never parses a proposed new measurement or
 * substitutes an activity peak or an age formula for a saved reference. */
export function profileReferenceQuery(message:string):ProfileReferenceQuery|null {
  if(typeof message!=="string"||!message.trim()||message.length>4000)return null;
  const text=normalize(message);
  if(!/\b(?:my|mine|mi|mis)\b|\b(?:for me|para mi)\b/.test(text))return null;
  if(!/[?¿]/.test(text)&&!/\b(?:what|which|show|tell me|do you|can you|cual|cuales|que|muestra|muestrame|dime|sabes)\b/.test(text))return null;
  if(/\b(?:set|update|save|log|record|change|replace|guarda|guardar|registra|registrar|actualiza|cambia|cambiar)\b/.test(text))return null;
  if(/\b(?:highest recorded|peak recorded|last workout|latest workout|during my|recorded during|ultima sesion|durante mi|pico registrado)\b/.test(text))return null;
  const sports:SportHrSport[]=[];
  if(/\b(?:run|running|correr|carrera|corriendo)\b/.test(text))sports.push("run");
  if(/\b(?:bike|biking|cycling|bicycle|ciclismo|bicicleta|bici)\b/.test(text))sports.push("bike");
  if(/\b(?:swim|swimming|natacion|nado|nadar)\b/.test(text))sports.push("swim");
  if(/\bhyrox\b/.test(text))sports.push("hyrox");
  const fields:ProfileReferenceField[]=[];
  if(/\b(?:max(?:imum)? (?:hr|heart rate)|maxhr|hrmax|hr max|fc max(?:ima)?|fcmax|frecuencia cardiaca maxima|frecuencia maxima)\b/.test(text))fields.push("maxHr");
  if(/\b(?:lthr|threshold (?:hr|heart rate)|(?:hr|heart rate) threshold|fc umbral|frecuencia cardiaca umbral|umbral de (?:fc|frecuencia cardiaca))\b/.test(text))fields.push("lthr");
  if(/\b(?:resting (?:hr|heart rate)|resthr|restinghr|fc (?:de |en )?reposo|frecuencia cardiaca (?:de |en )reposo)\b/.test(text))fields.push("restingHr");
  if(/\b(?:ftp|functional threshold power|umbral (?:funcional )?de potencia)\b/.test(text))fields.push("ftp");
  const pace=/\b(?:pace|css|ritmo)\b/.test(text);
  const ambiguousPace=pace&&!sports.some(s=>s==="run"||s==="swim")&&!/\bcss\b/.test(text);
  if(pace&&(sports.includes("run")||ambiguousPace))fields.push("runPaceBase");
  if(pace&&(sports.includes("swim")||/\bcss\b/.test(text)||ambiguousPace))fields.push("swimPaceBase");
  return fields.length?{fields:[...new Set(fields)],sports,ambiguousPace}:null;
}
export function profileReferenceSportReply(message:string):SportHrSport|null {
  const text=normalize(message).trim().replace(/[.!?¿]+$/g,"");
  const options:Record<SportHrSport,RegExp>={run:/^(?:(?:for|in|para|en) )?(?:run|running|correr|carrera)$/,bike:/^(?:(?:for|in|para|en) )?(?:bike|cycling|ciclismo|bicicleta|bici)$/,swim:/^(?:(?:for|in|para|en) )?(?:swim|swimming|natacion|nado)$/,hyrox:/^(?:(?:for|in|para|en) )?hyrox$/};
  return SPORT_HR_SPORTS.find(sport=>options[sport].test(text))??null;
}
/** Only fixed field/sport labels can continue a local clarification. Prior
 * values, prose and legacy policy metadata cannot become conversation context. */
export function savedProfileReferenceQuery(row:{source?:unknown;metadata?:unknown}|null|undefined):ProfileReferenceQuery|null {
  if(row?.source!=="local"||typeof row.metadata!=="string")return null;
  try {
    const metadata=JSON.parse(row.metadata),query=metadata?.protectedProfileQuery;
    if(metadata?.historyPolicy!==AI_DATA_POLICY_VERSION||metadata?.ruleId!=="coach-conversation-v1:profile-reference-review"||!query||typeof query!=="object"||Array.isArray(query)||Object.keys(query).some(key=>!["fields","sports","ambiguousPace"].includes(key))||!Array.isArray(query.fields)||!query.fields.length||query.fields.length>6||query.fields.some((field:unknown)=>typeof field!=="string"||!Object.hasOwn(definitions,field))||new Set(query.fields).size!==query.fields.length||!Array.isArray(query.sports)||query.sports.length>4||query.sports.some((item:unknown)=>!SPORT_HR_SPORTS.includes(item as SportHrSport))||typeof query.ambiguousPace!=="boolean")return null;
    return {fields:[...query.fields],sports:[...query.sports],ambiguousPace:query.ambiguousPace};
  } catch{return null;}
}
export function profileReferenceFollowup(message:string,row:{source?:unknown;metadata?:unknown}|null|undefined):ProfileReferenceQuery|null {
  const sport=profileReferenceSportReply(message),query=savedProfileReferenceQuery(row);if(!sport||!query)return null;
  const fields=query.fields.filter(field=>!query.ambiguousPace||!["runPaceBase","swimPaceBase"].includes(field)||(sport==="run"?field==="runPaceBase":sport==="swim"?field==="swimPaceBase":false));
  return fields.length?{fields,sports:[sport],ambiguousPace:false}:null;
}
const validValue=(field:ProfileReferenceField,value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>=definitions[field].min&&value<=definitions[field].max&&(!["maxHr","lthr","restingHr"].includes(field)||Number.isInteger(value));
const validDate=(value:unknown):value is string=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T12:00Z"))&&new Date(value+"T12:00Z").toISOString().slice(0,10)===value;
const sportLabel=(sport:SportHrSport|"unscoped",es:boolean)=>({run:es?"Carrera":"Running",bike:es?"Ciclismo":"Cycling",swim:es?"Natación":"Swimming",hyrox:"HYROX",unscoped:es?"Sin deporte confirmado":"Sport unconfirmed"})[sport];
function display(field:ProfileReferenceField,value:number|null,units:UnitSystem) {
  if(value===null)return "—";
  if(field==="runPaceBase")return `${fmtPace(value,units)} · ${fmtSpeed(3600/value,units)}`;
  if(field==="swimPaceBase")return `${fmtSwimPace(value,units)} · ${fmtSpeed(360/value,units)}`;
  return `${value} ${definitions[field].unit}`;
}
/** Profile facts stay in this authenticated local result. No result or numeric
 * summary is written into conversation history or passed to an AI provider. */
export function protectedProfileAnswer(query:ProfileReferenceQuery,profile:Record<string,unknown>|null|undefined,options:{sourceMessageId:string;language?:string;now?:Date;timezone:string}):ProtectedProfileAnswer {
  const es=options.language==="es",now=options.now??new Date(),today=dateKey(now,options.timezone),units=unitsOf(typeof profile?.units==="string"?profile.units:null,options.language);
  const records=readManualPersonalBests(profile?.manualPrs);
  const fields:ProtectedProfileField[]=query.fields.flatMap(field=>{
    const definition=definitions[field],heart=["maxHr","lthr"].includes(field);
    const scopes:(SportHrSport|"unscoped")[]=heart&&query.sports.length?query.sports:[field==="ftp"?"bike":field==="runPaceBase"?"run":field==="swimPaceBase"?"swim":"unscoped"];
    return scopes.map(sport=>{
      const scoped=heart&&sport!=="unscoped"?readSportHeartRate(profile?.manualPrs,sport,field as "maxHr"|"lthr",now,options.timezone):null;
      const raw=heart&&sport!=="unscoped"?scoped?.value:profile?.[field];
      const value=validValue(field,raw)?raw:null;
      const manualLabel=field==="ftp"?"JMM manual FTP reference":field==="runPaceBase"?"JMM manual run threshold reference":field==="swimPaceBase"?"JMM manual CSS reference":null;
      const rows=manualLabel&&value!==null&&records?records.filter(row=>row.label===manualLabel&&row.unit===definition.unit&&row.value===value&&validDate(row.date)&&row.date<=today).sort((a,b)=>b.date.localeCompare(a.date)):[];
      const observedAt=scoped?.observedAt??rows[0]?.date??null,source=observedAt?"athlete_reported_reference" as const:"saved_profile" as const;
      const note=value===null?(es?"No hay una referencia válida guardada para este dato y deporte. No se deduce de la edad, otro deporte ni de picos de actividad.":"No valid reference is stored for this field and sport. It is not inferred from age, another sport or an activity peak.")
        :observedAt?(es?"Referencia declarada por el atleta; no demuestra una medición de laboratorio, validez actual para entrenar ni disposición para hoy.":"Athlete-reported reference; this does not establish a laboratory measurement, current training validity or today's readiness.")
          :(es?"Valor guardado en el perfil. Su fuente original y fecha de observación no están confirmadas; no se presenta como medición verificada.":"Saved profile value. Its original source and observation date are unconfirmed; it is not presented as a verified measurement.");
      return {field,label:`${definition[es?"es":"en"]} · ${sportLabel(sport,es)}`,sport,value,unit:definition.unit,display:display(field,value,units),source,observedAt,provenance:observedAt?"athlete_reported" as const:"unverified" as const,note};
    });
  });
  const unscopedHr=fields.some(field=>["maxHr","lthr"].includes(field.field)&&field.sport==="unscoped");
  const clarification=query.ambiguousPace?(es?"¿Te refieres al ritmo de carrera o al de natación? Sus referencias se mantienen separadas.":"Do you mean running pace or swimming pace? Their references stay separate.")
    :unscopedHr?(es?"Para una referencia de FC específica, indica carrera, ciclismo, natación o HYROX. El dato general no se asigna automáticamente a ningún deporte.":"For a sport-specific HR reference, specify running, cycling, swimming or HYROX. The shared value is not automatically assigned to any sport."):null;
  const maxWarning=query.fields.includes("maxHr")?(es?" Una referencia guardada o un pico de entrenamiento no demuestra tu FC máxima fisiológica.":" A saved reference or workout peak does not establish your physiological maximum HR."):"";
  return {kind:"profile_reference",privacy:"local_only",sourceMessageId:options.sourceMessageId,title:es?"Tus referencias guardadas":"Your saved references",answer:(es?"Estos son los datos guardados que corresponden a tu pregunta. Los valores ausentes quedan desconocidos.":"These are the saved references matching your question. Missing values remain unknown.")+maxWarning,displayUnits:units,fields,clarification};
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const text=(value:unknown,max:number):value is string=>typeof value==="string"&&value.trim().length>0&&value.length<=max;
const keys=(value:Record<string,unknown>,allowed:string[])=>Object.keys(value).every(key=>allowed.includes(key));
/** Runtime boundary for an ephemeral protected result. Unexpected properties,
 * dimensions, values or mismatched display text fail closed in the browser. */
export function isProtectedProfileAnswer(value:unknown):value is ProtectedProfileAnswer {
  if(!object(value)||!keys(value,["kind","privacy","sourceMessageId","title","answer","displayUnits","fields","clarification"])||value.kind!=="profile_reference"||value.privacy!=="local_only"||typeof value.sourceMessageId!=="string"||!/^[a-zA-Z0-9_-]{1,128}$/.test(value.sourceMessageId)||!text(value.title,200)||!text(value.answer,1500)||!["metric","imperial"].includes(String(value.displayUnits))||!(value.clarification===null||text(value.clarification,1000))||!Array.isArray(value.fields)||!value.fields.length||value.fields.length>12)return false;
  const seen=new Set<string>();
  return value.fields.every(row=>{
    if(!object(row)||!keys(row,["field","label","sport","value","unit","display","source","observedAt","provenance","note"])||typeof row.field!=="string"||!Object.hasOwn(definitions,row.field)||!text(row.label,200)||![...SPORT_HR_SPORTS,"unscoped"].includes(row.sport as SportHrSport)||!text(row.note,1000))return false;
    const field=row.field as ProfileReferenceField,key=`${field}:${row.sport}`;if(seen.has(key))return false;seen.add(key);
    if(row.value!==null&&!validValue(field,row.value)||row.unit!==definitions[field].unit||row.display!==display(field,row.value as number|null,value.displayUnits as UnitSystem))return false;
    if(!["saved_profile","athlete_reported_reference"].includes(String(row.source))||!["unverified","athlete_reported"].includes(String(row.provenance)))return false;
    if(row.source==="saved_profile"&&(row.observedAt!==null||row.provenance!=="unverified"))return false;
    if(row.source==="athlete_reported_reference"&&(!validDate(row.observedAt)||row.provenance!=="athlete_reported"||row.value===null))return false;
    if(field==="ftp"&&row.sport!=="bike"||field==="runPaceBase"&&row.sport!=="run"||field==="swimPaceBase"&&row.sport!=="swim"||field==="restingHr"&&row.sport!=="unscoped")return false;
    if(["maxHr","lthr"].includes(field)&&row.sport!=="unscoped"&&row.value!==null&&row.source!=="athlete_reported_reference")return false;
    if(["maxHr","lthr"].includes(field)&&row.sport==="unscoped"&&row.source!=="saved_profile")return false;
    return true;
  });
}
