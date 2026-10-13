const rules = {
  hrv: {type:"hrv_rmssd",unit:"ms",min:1,max:300},
  restingHr: {type:"resting_hr",unit:"bpm",min:25,max:150},
  sleepHours: {type:"sleep_hours",unit:"h",min:0,max:24},
  sleepScore: {type:"sleep_score",unit:"score",min:0,max:100},
  recoveryScore: {type:"recovery_score",unit:"score",min:0,max:100},
  weightKg: {type:"weight_kg",unit:"kg",min:20,max:350},
};
/** Source-labelled usable readings only. Quality 'ok' is range validation, not clinical clearance. */
export function deviceMetricSnapshot(userId:string,date:Date,source:string,input:Record<string,unknown>,method="device_sync",now=new Date()) {
  const data:Record<string,any>={source};
  const observations:{userId:string;observedAt:Date;source:string;metricType:string;value:number;unit:string;measurementMethod:string;qualityFlag:string}[]=[];
  if(!Number.isFinite(date.getTime())||date>now) return {data,observations};
  for(const [field,rule] of Object.entries(rules)) {
    const value=input[field];
    if(typeof value!=="number"||!Number.isFinite(value)||value<rule.min||value>rule.max) continue;
    data[field]=["restingHr","sleepScore","recoveryScore"].includes(field)?Math.round(value):value;
    observations.push({userId,observedAt:date,source,metricType:field==="hrv"&&input.hrvType==="sdnn"?"hrv_sdnn":rule.type,
      value:data[field],unit:rule.unit,measurementMethod:method,qualityFlag:"ok"});
  }
  if(data.hrv!=null) data.hrvType=input.hrvType==="sdnn"?"sdnn":"rmssd";
  return {data,observations};
}
