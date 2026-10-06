type Observation = { id:string; metricType:string; value:number; unit:string|null; source:string; observedAt:Date; qualityFlag:string|null };
const metrics: Record<string, {unit:string; min:number; max:number}> = {
  weight_kg:{unit:"kg",min:20,max:350}, resting_hr:{unit:"bpm",min:25,max:150},
  hrv_rmssd:{unit:"ms",min:1,max:300}, sleep_hours:{unit:"h",min:0,max:24},
};
export const ONBOARDING_METRICS = Object.keys(metrics);
/** Show recent usable observations, never convert a single observation into a training baseline. */
export function onboardingObservations(rows: Observation[], now = new Date()) {
  const seen = new Set<string>();
  return [...rows].sort((a,b)=>b.observedAt.getTime()-a.observedAt.getTime()).filter(row=>{
    const rule = metrics[row.metricType], age = now.getTime()-row.observedAt.getTime();
    if (!rule || seen.has(row.metricType) || row.qualityFlag !== "ok" || !Number.isFinite(age) || age < 0 || age > 30*86400000 || row.unit !== rule.unit || !Number.isFinite(row.value) || row.value < rule.min || row.value > rule.max) return false;
    seen.add(row.metricType); return true;
  }).map(({id,metricType,value,unit,source,observedAt})=>({id,metricType,value,unit,source,observedAt:observedAt.toISOString()}));
}
