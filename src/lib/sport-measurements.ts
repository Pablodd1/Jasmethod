import { clockSeconds } from "./metric-entry";
import { parseManualWorkout } from "./manual-workout";
import { dateKey } from "./dates";

export const EVIDENCE_SPORTS = ["bike","swim","run"] as const;
export const SPORT_MANUAL_SOURCE="manual_sport_local";
export type EvidenceSport = typeof EVIDENCE_SPORTS[number];
export type SportMeasurements = {
  version:1;sport:EvidenceSport;durationSeconds:number;distanceKm:number|null;averageSpeedKmh:number|null;
  durationBasis:"elapsed"|"moving"|"provider_duration"|"reported_unconfirmed";reported:string[];
  cadence:number|null;poolLengthM:number|null;environment:string|null;elevationGainM:number|null;
};
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
export function speedFromDistance(distanceKm:number|null,seconds:number):number|null {
  return distanceKm!==null&&finite(distanceKm,0,1500)&&finite(seconds,.001,604800)?distanceKm*3600/seconds:null;
}
export function providerSportMeasurements(sport:string,seconds:number,distanceKm:number|null,activityType?:string):SportMeasurements|null {
  if(!EVIDENCE_SPORTS.includes(sport as EvidenceSport)||!finite(seconds,1,604800))return null;
  return {version:1,sport:sport as EvidenceSport,durationSeconds:seconds,distanceKm,averageSpeedKmh:speedFromDistance(distanceKm,seconds),
    durationBasis:"provider_duration",reported:["duration",...(distanceKm===null?[]:["distance"])],cadence:null,poolLengthM:null,
    environment:activityType==="OPEN_WATER_SWIMMING"?"open_water":activityType==="LAP_SWIMMING"?"pool":["INDOOR_CYCLING","TREADMILL_RUNNING"].includes(activityType||"")?"indoor":null,elevationGainM:null};
}
/** Preserve athlete annotations when a corrected provider summary refreshes its exact measurements. */
export function mergeProviderMeasurements(previous:string|null|undefined,incoming:string):string {
  if(!previous)return incoming;
  try {const old=JSON.parse(previous),next=JSON.parse(incoming);if(object(old)&&old.schemaVersion===1&&object(next.providerEvidence))return JSON.stringify({...old,providerEvidence:next.providerEvidence});}catch{/* Preserve unreadable prior annotations instead of overwriting them. */}
  return previous;
}
export function readSportMeasurements(details:string|null|undefined,sport:string,source:string|null|undefined):SportMeasurements|null {
  try {
    const root=JSON.parse(details||"null");
    if(!object(root)||root.schemaVersion!==1)return null;
    const p=source==="garmin_direct"?root.providerEvidence:["manual",SPORT_MANUAL_SOURCE].includes(source||"")?root.sportEvidence:null;
    if(!object(p)||p.version!==1||p.sport!==sport||!EVIDENCE_SPORTS.includes(p.sport)||!finite(p.durationSeconds,.001,604800)||
      (p.distanceKm!==null&&!finite(p.distanceKm,0,1500))||!["elapsed","moving","provider_duration","reported_unconfirmed"].includes(p.durationBasis)||!Array.isArray(p.reported)||p.reported.some((v:unknown)=>!["duration","distance","speed"].includes(String(v))))return null;
    const cadence=finite(p.cadence,0,300)?p.cadence:null,poolLengthM=finite(p.poolLengthM,1,150)?p.poolLengthM:null,elevationGainM=finite(p.elevationGainM,0,20000)?p.elevationGainM:null;
    return {...p,cadence,poolLengthM,elevationGainM,environment:typeof p.environment==="string"&&["pool","open_water","indoor","outdoor"].includes(p.environment)?p.environment:null,averageSpeedKmh:speedFromDistance(p.distanceKm,p.durationSeconds)} as SportMeasurements;
  }catch{return null;}
}
function optional(value:unknown,label:string,min:number,max:number) {
  if(value==null||value==="")return null;
  if((typeof value!=="number"&&typeof value!=="string")||!/^\d+(?:\.\d+)?$/.test(String(value).trim()))throw Error("Enter a valid "+label+".");
  const n=Number(value);if(!finite(n,min,max))throw Error("Check "+label+" and its units.");return n;
}
/** Exactly two measurements determine the third; a client cannot submit conflicting redundant values. */
export function parseSportEntry(input:unknown,timezone:string,now=new Date()) {
  if(!object(input))throw Error("Expected a sport activity.");
  const keys=["sport","date","mode","distance","distanceUnit","duration","speed","speedUnit","durationBasis","avgHr","maxHr","avgPower","np","calories","rpe","cadence","environment","poolLength","poolUnit","elevationGainM"];
  if(Object.keys(input).some(k=>!keys.includes(k)))throw Error("Unknown sport activity field.");
  const p=input;
  if(!EVIDENCE_SPORTS.includes(p.sport))throw Error("Choose bike, swim or run.");
  if(!["distance_duration","distance_speed","duration_speed"].includes(p.mode))throw Error("Choose two measurements.");
  if(!["elapsed","moving","reported_unconfirmed"].includes(p.durationBasis))throw Error("Choose elapsed, moving or unconfirmed duration basis.");
  if(!["km/h","mph"].includes(p.speedUnit))throw Error("Choose km/h or mph.");
  const factors:Record<string,number>={km:1,mi:1.609344,m:.001,yd:.0009144};
  if(!Object.hasOwn(factors,String(p.distanceUnit))||(p.sport!=="swim"&&!["km","mi"].includes(p.distanceUnit)))throw Error("Choose distance units for this sport.");
  const usesDistance=p.mode!=="duration_speed",usesDuration=p.mode!=="distance_speed",usesSpeed=p.mode!=="distance_duration";
  if((!usesDistance&&p.distance!=""&&p.distance!=null)||(!usesDuration&&p.duration!=""&&p.duration!=null)||(!usesSpeed&&p.speed!=""&&p.speed!=null))throw Error("Provide only the selected two measurements.");
  let distanceKm=usesDistance?optional(p.distance,"distance",.000001,1500000)!*factors[p.distanceUnit]:null;
  let seconds:number|null=null;if(usesDuration){if(typeof p.duration!=="string"||!p.duration.trim())throw Error("Enter duration as a clock.");seconds=clockSeconds(p.duration);}
  let speed=usesSpeed?optional(p.speed,"average speed",.000001,500)!*(p.speedUnit==="mph"?1.609344:1):null;
  if((usesDistance&&distanceKm===0)||(usesSpeed&&speed===0))throw Error("Enter the selected measurements.");
  if(!usesDistance)distanceKm=speed!*seconds!/3600;
  if(!usesDuration)seconds=distanceKm!*3600/speed!;
  if(!usesSpeed)speed=speedFromDistance(distanceKm,seconds!);
  if(!finite(distanceKm,.000001,1500)||!finite(seconds,1,86400)||!finite(speed,.000001,500))throw Error("Check distance, duration and speed in the selected units.");
  const environment=p.environment===""||p.environment==null?null:p.environment;
  if(environment!==null&&!(p.sport==="swim"?["pool","open_water"]:["indoor","outdoor"]).includes(environment))throw Error("Choose the correct activity setting.");
  let poolLengthM:number|null=null;
  if(p.poolLength!=null&&p.poolLength!==""){if(p.sport!=="swim"||environment!=="pool"||!["m","yd"].includes(p.poolUnit))throw Error("Pool length needs pool swimming and m or yd.");poolLengthM=optional(p.poolLength,"pool length",1,150)!*(p.poolUnit==="yd"?.9144:1);}
  if(p.sport!=="bike"&&p.np!=null&&p.np!=="")throw Error("Normalized cycling power belongs to bike records.");
  const cadence=optional(p.cadence,"cadence",0,300),elevationGainM=optional(p.elevationGainM,"elevation gain (m)",0,20000);
  if(p.sport==="swim"&&elevationGainM!==null)throw Error("Elevation gain belongs to run or bike records.");
  const measurements:SportMeasurements={version:1,sport:p.sport,durationSeconds:seconds,distanceKm,averageSpeedKmh:speed,durationBasis:p.durationBasis,
    reported:[...(usesDistance?["distance"]:[]),...(usesDuration?["duration"]:[]),...(usesSpeed?["speed"]:[])],cadence,poolLengthM,environment,elevationGainM};
  // Integer-minute planning budgets round upward; the observation keeps exact clock precision.
  const workout=parseManualWorkout({sport:p.sport,date:p.date,actualDurationMin:Math.ceil(seconds/60),distanceKm,avgHr:p.avgHr,maxHr:p.maxHr,avgPower:p.avgPower,np:p.np,calories:p.calories,rpe:p.rpe},timezone,now) as ReturnType<typeof parseManualWorkout>&Partial<Record<"avgHr"|"maxHr"|"avgPower"|"np"|"calories",number|null>>;
  if(!Number.isFinite(workout.date.getTime())||dateKey(workout.date,timezone)!==p.date)throw Error("Choose a valid local activity date.");
  if(workout.avgHr!=null&&workout.maxHr!=null&&workout.avgHr>workout.maxHr)throw Error("Average heart rate cannot exceed maximum heart rate.");
  const details=JSON.parse(workout.actualDetails);details.sportEvidence=measurements;
  return {workout:{...workout,source:SPORT_MANUAL_SOURCE,actualDetails:JSON.stringify(details)},measurements};
}
