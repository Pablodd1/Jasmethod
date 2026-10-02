import {dateKey} from "./dates";
export interface PlanningTarget {
  metric: "pace" | "power" | "speed" | "completion" | "fitness";
  sport: "run" | "bike" | "swim" | "strength" | "mobility" | "recovery" | "brick" | "hyrox" | "boxing";
  value?: number;
  unit?: "sec/km" | "sec/100m" | "W" | "km/h";
  targetDate?: string;
  kind: "goal_not_capacity";
}
export function setupNumber(value:unknown, name:string, min:number, max:number, integer = true):number {
  if (!(typeof value === "number" || (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)))) throw new Error(`Invalid setup ${name}: use a number`);
  const n=Number(value);
  if(!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n))) throw new Error(`Invalid setup ${name}`);
  return n;
}
export function parsePlanningTarget(value:unknown,now=new Date(),timezone="UTC",allowPastDate=false):PlanningTarget|null {
  if(value==null) return null;
  if(typeof value!=="object"||Array.isArray(value)) throw new Error("Invalid target goal");
  const v=value as Record<string,unknown>;
  if(typeof v.metric!=="string"||!["pace","power","speed","completion","fitness"].includes(v.metric)) throw new Error("Choose a supported target metric");
  if(typeof v.sport!=="string"||!["run","bike","swim","strength","mobility","recovery","brick","hyrox","boxing"].includes(v.sport)) throw new Error("Choose the target sport");
  const target:PlanningTarget={metric:v.metric as PlanningTarget["metric"],sport:v.sport as PlanningTarget["sport"],kind:"goal_not_capacity"};
  if(v.metric==="pace") {
    if(!["run","swim"].includes(String(v.sport))) throw new Error("Pace goals support running or swimming");
    const unit=v.sport==="swim"?"sec/100m":"sec/km";
    if(v.unit!==unit) throw new Error(`Use ${unit} for this pace goal`);
    target.unit=unit;target.value=setupNumber(v.value,"target pace",v.sport==="swim"?15:60,3600,false);
  } else if(v.metric==="power") {
    if(!["bike","run"].includes(String(v.sport))||v.unit!=="W") throw new Error("Power goals support cycling/running in watts");
    target.unit="W";target.value=setupNumber(v.value,"target power",1,2000,false);
  } else if(v.metric==="speed") {
    if(!["bike","run","swim"].includes(String(v.sport))||v.unit!=="km/h") throw new Error("Speed goals support cycling/running/swimming in km/h");
    target.unit="km/h";target.value=setupNumber(v.value,"target speed",0.1,120,false);
  } else if(v.value!=null&&v.value!==""||v.unit!=null&&v.unit!=="") throw new Error("Completion/fitness goals do not need a numeric capacity value");
  if(v.targetDate!=null&&v.targetDate!=="") {
    if(typeof v.targetDate!=="string") throw new Error("Target date must be a date string");
    const date=v.targetDate;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||(!allowPastDate&&date<dateKey(now,timezone))) throw new Error("Choose an actual current/future target date or leave it unknown");
    target.targetDate=date;
  }
  return target;
}
