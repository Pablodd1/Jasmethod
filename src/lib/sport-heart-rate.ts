import { dateKey, localDate } from "./dates";
import { ONBOARDING_ANCHORS, readManualPersonalBests } from "./onboarding-evidence";
import { HR_ZONE_UPPER_FACTORS, MAX_HR_ZONE_BANDS } from "./zone-factors";

export const SPORT_HR_SPORTS = ["run","bike","swim","hyrox"] as const;
export type SportHrSport = typeof SPORT_HR_SPORTS[number];
export type SportHrMetric = "maxHr" | "lthr";
export interface SportHeartRateReference {sport:SportHrSport;metric:SportHrMetric;value:number;source:"athlete_reported_reference";observedAt:string;unit:"bpm"}
const label=(sport:SportHrSport,metric:SportHrMetric)=>`JMM manual ${sport} ${metric} reference`;
const validDate=(value:string,today:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T12:00Z"))&&new Date(value+"T12:00Z").toISOString().slice(0,10)===value&&value<=today;
const validValue=(metric:SportHrMetric,value:unknown)=>{const bounds=ONBOARDING_ANCHORS.find(row=>row.field===metric)!;return typeof value==="number"&&Number.isInteger(value)&&value>=bounds.min&&value<=bounds.max;};
/** Exact labels establish an athlete-reported sport scope, never laboratory
 * verification. Device activity peaks and generic profile fields are ignored. */
export function readSportHeartRate(raw:unknown,sport:SportHrSport,metric:SportHrMetric,now=new Date(),timezone="UTC"):SportHeartRateReference|null {
  if(!SPORT_HR_SPORTS.includes(sport)||!["maxHr","lthr"].includes(metric)||!Number.isFinite(now.getTime()))return null;
  const rows=readManualPersonalBests(raw);if(!rows)return null;
  const today=dateKey(now,timezone),eligible=rows.filter(row=>row.label===label(sport,metric)&&row.unit==="bpm"&&validValue(metric,row.value)&&validDate(row.date,today)&&localDate(today,timezone).getTime()-localDate(row.date,timezone).getTime()<=90*86400000).sort((a,b)=>b.date.localeCompare(a.date));
  const row=eligible[0];if(!row||eligible.some(other=>other.date===row.date&&other.value!==row.value))return null;
  return {sport,metric,value:row.value,source:"athlete_reported_reference",observedAt:row.date,unit:"bpm"};
}
/** Preserve all other PRs and dated sport references. Same sport/metric/date is
 * an intentional correction, while a new date retains the prior observation. */
export function recordSportHeartRate(raw:unknown,input:{sport:SportHrSport;metric:SportHrMetric;value:number;observedOn:string},today:string):string {
  const rows=readManualPersonalBests(raw);if(!rows)throw Error("Review saved personal records before adding a heart-rate reference.");
  if(!SPORT_HR_SPORTS.includes(input.sport)||!["maxHr","lthr"].includes(input.metric)||!validValue(input.metric,input.value))throw Error("Choose the sport, heart-rate reference and a whole-number result in bpm within the supported range.");
  if(!validDate(today,today)||!validDate(input.observedOn,today))throw Error("Choose the actual reference date, no later than today.");
  const otherMetric=input.metric==="maxHr"?"lthr":"maxHr";
  const other=rows.find(row=>row.label===label(input.sport,otherMetric)&&row.unit==="bpm"&&row.date===input.observedOn&&validValue(otherMetric,row.value));
  if(other&&(input.metric==="maxHr"?input.value<other.value:input.value>other.value))throw Error("Threshold heart rate cannot exceed the maximum reference for the same sport and date.");
  const next=rows.filter(row=>!(row.label===label(input.sport,input.metric)&&row.unit==="bpm"&&row.date===input.observedOn));
  next.push({label:label(input.sport,input.metric),value:input.value,unit:"bpm",date:input.observedOn});
  if(next.length>50)throw Error("Review the saved record limit before adding a reference.");
  return JSON.stringify(next);
}
/** Existing model fractions only. The result retains report provenance and
 * never transfers a run reference to cycling or vice versa. */
export function sportHeartRateTarget(raw:unknown,sport:string,zone:number,now=new Date(),timezone="UTC") {
  if(!SPORT_HR_SPORTS.includes(sport as SportHrSport)||!Number.isInteger(zone)||zone<1||zone>6)return null;
  const threshold=readSportHeartRate(raw,sport as SportHrSport,"lthr",now,timezone);
  const maximum=readSportHeartRate(raw,sport as SportHrSport,"maxHr",now,timezone);
  if(threshold&&maximum&&threshold.observedAt===maximum.observedAt&&threshold.value>maximum.value)return null;
  const reference=threshold??maximum;if(!reference)return null;
  if(reference.metric==="maxHr"&&zone>5)return null;
  const high=Math.round(reference.value*(reference.metric==="lthr"?HR_ZONE_UPPER_FACTORS[zone]:MAX_HR_ZONE_BANDS[zone-1][1]));
  const low=reference.metric==="lthr"?(zone===1?1:Math.min(high,Math.round(reference.value*HR_ZONE_UPPER_FACTORS[zone-1])+1)):Math.round(reference.value*MAX_HR_ZONE_BANDS[zone-1][0]);
  return {low,high,reference};
}
