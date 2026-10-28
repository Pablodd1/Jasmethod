import { createHash } from "node:crypto";
import { GarminError } from "./garmin-config";
import { localDate, dateKey } from "./dates";
import { providerSportMeasurements } from "./sport-measurements";

export const GARMIN_DATA_TYPES = ["activities","activityDetails","activityFiles","moveIQActivities","manuallyUpdatedActivities","dailies","epochs","sleeps","bodyComps","stressDetails","userMetrics","pulseox","allDayRespiration","healthSnapshot","hrv","bloodPressures","skinTemp","nutrition","hydration","breathingVariations"] as const;
export type GarminDataType = typeof GARMIN_DATA_TYPES[number];
export type GarminSummary = {type:GarminDataType;providerUserId:string;summaryId:string;record:Record<string,unknown>;digest:string};
const object = (v:unknown):v is Record<string,unknown> => !!v && typeof v==="object" && !Array.isArray(v);
const boundedId=(v:unknown):v is string=>typeof v==="string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v);
export const garminSummaryPermission=(type:GarminDataType)=>["activities","activityDetails","activityFiles","moveIQActivities","manuallyUpdatedActivities"].includes(type)?"ACTIVITY_EXPORT" as const:"HEALTH_EXPORT" as const;
/** Parse only AFTER transport authentication; userId in JSON is a routing key, never authentication. */
export function parseGarminPush(body:unknown):GarminSummary[] {
  if (!object(body) || !Object.keys(body).length || Object.keys(body).some(k=>!GARMIN_DATA_TYPES.includes(k as GarminDataType))) throw new GarminError("unsupported_garmin_summary","Unsupported Garmin summary envelope.");
  const result:GarminSummary[]=[];
  for(const [type,records] of Object.entries(body)) {
    if(!Array.isArray(records) || records.length>100 || result.length+records.length>100) throw new GarminError("invalid_garmin_batch","Garmin batch is too large.",413);
    for(const record of records) {
      if(!object(record) || !boundedId(record.userId) || !boundedId(record.summaryId)) throw new GarminError("invalid_garmin_summary","Garmin summary identity is invalid.");
      const text=JSON.stringify(record);
      if(Buffer.byteLength(text)>2*1024*1024) throw new GarminError("invalid_garmin_summary","Garmin summary is too large.",413);
      result.push({type:type as GarminDataType,providerUserId:record.userId,summaryId:record.summaryId,record,digest:createHash("sha256").update(text).digest("hex")});
    }
  }
  return result;
}
const number=(v:unknown,min:number,max:number):number|null=>typeof v==="number" && Number.isFinite(v) && v>=min && v<=max?v:null;
export function garminActivity(summary:GarminSummary) {
  if(!["activities","manuallyUpdatedActivities"].includes(summary.type)) return null;
  const r=summary.record, seconds=number(r.durationInSeconds,1,604800), start=number(r.startTimeInSeconds,0,7258118400);
  if(seconds==null || start==null || typeof r.activityType!=="string") throw new GarminError("invalid_garmin_activity","Garmin activity is missing measured time or sport.");
  const type=r.activityType;
  if (r.isParent === true || type === "MULTI_SPORT") return null; // Archive the parent; its children carry the measured load.
  const sport=({RUNNING:"run",TRAIL_RUNNING:"run",TREADMILL_RUNNING:"run",CYCLING:"bike",INDOOR_CYCLING:"bike",MOUNTAIN_BIKING:"bike",SWIMMING:"swim",LAP_SWIMMING:"swim",OPEN_WATER_SWIMMING:"swim",STRENGTH_TRAINING:"strength"} as Record<string,string>)[type]??"other";
  const n=(key:string,min:number,max:number)=>number(r[key],min,max);
  const rounded=(key:string,min:number,max:number)=>{const v=n(key,min,max);return v==null?null:Math.round(v);};
  const distance=n("distanceInMeters",0,10000000);
  const providerEvidence=providerSportMeasurements(sport,seconds,distance==null?null:distance/1000,type);
  return {source:"garmin_direct",externalId:`garmin:${summary.summaryId}`,date:new Date(start*1000),sport,
    ...(providerEvidence?{actualDetails:JSON.stringify({schemaVersion:1,source:"garmin_direct",values:{},providerEvidence})}:{}),
    title:typeof r.activityName==="string"?r.activityName.slice(0,200):`Garmin ${type}`,durationMin:Math.max(1,Math.round(seconds/60)),distanceKm:distance==null?null:distance/1000,
    avgHr:rounded("averageHeartRateInBeatsPerMinute",20,250),maxHr:rounded("maxHeartRateInBeatsPerMinute",20,250),
    avgPower:n("averagePowerInWatts",0,5000),calories:rounded("activeKilocalories",0,50000),
    notes:"Garmin Connect API observation. Source records and derived summaries remain inside JMM; no external AI or messaging delivery."};
}
export function garminMetrics(summary:GarminSummary,timezone:string) {
  const r=summary.record;
  if(!["dailies","sleeps","bodyComps","hrv"].includes(summary.type))return null;
  const measured = number(r.measurementTimeInSeconds,0,7258118400);
  const calendar = summary.type === "bodyComps" && measured != null ? dateKey(new Date(measured*1000),timezone) : r.calendarDate;
  if(typeof calendar!=="string" || !/^\d{4}-\d\d-\d\d$/.test(calendar))throw new GarminError("invalid_garmin_date","Garmin summary is missing its local calendar date.");
  const date=localDate(calendar,timezone),values:{metricType:string;value:number;unit:string;qualityFlag:string}[]=[];
  const put=(metricType:string,value:unknown,min:number,max:number,unit:string,qualityFlag="ok")=>{const v=number(value,min,max);if(v!=null)values.push({metricType,value:v,unit,qualityFlag});};
  if(summary.type==="dailies") {put("resting_hr",r.restingHeartRateInBeatsPerMinute,20,250,"bpm");put("steps",r.steps,0,200000,"count");}
  if(summary.type==="sleeps" && ["AUTO_FINAL","ENHANCED_FINAL","ENHANCED_TENTATIVE","AUTO_TENTATIVE","AUTO_MANUAL","DEVICE"].includes(String(r.validation))) {
    const seconds=number(r.durationInSeconds,0,86400);if(seconds!=null)put("sleep_hours",seconds/3600,0,24,"h",String(r.validation).includes("TENTATIVE")?"incomplete":"ok");
  }
  if(summary.type==="bodyComps") {const grams=number(r.weightInGrams,20000,400000);if(grams!=null)put("weight_kg",grams/1000,20,400,"kg");}
  // Garmin's lastNightAvg is retained with its own metric identity; no guessed RMSSD/SDNN conversion.
  if(summary.type==="hrv")put("garmin_hrv_reported",r.lastNightAvg,1,500,"ms","incomplete");
  return {date,values};
}
export interface GarminPushSink {persist(summaries:GarminSummary[]):Promise<{stored:number;duplicates:number;ignored:number}>}
/** Transport adapter is intentionally injectable. Production has no guessed signature or userId-only verifier. */
export function createGarminPushReceiver(authenticate:(request:Request,body:Uint8Array)=>Promise<boolean>,sink:GarminPushSink) {
  return async (request:Request)=>{
    if(request.method!=="POST" || new URL(request.url).search || !/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type")||"")) throw new GarminError("invalid_push","Invalid Garmin delivery request.");
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2*1024*1024){await reader.cancel();throw new GarminError("push_too_large","Garmin delivery is too large.",413);}chunks.push(value);}}finally{reader?.releaseLock();}
    const body=Buffer.concat(chunks);
    if(!await authenticate(request,body))throw new GarminError("unverified_push","Garmin delivery authentication was not verified.",401);
    let parsed:unknown;try{parsed=JSON.parse(body.toString("utf8"));}catch{throw new GarminError("invalid_push","Invalid Garmin delivery JSON.");}
    // Acknowledge only after durable enqueue. Never perform medical projection before returning to Garmin.
    return sink.persist(parseGarminPush(parsed));
  };
}
