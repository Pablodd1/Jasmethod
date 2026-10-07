import { prisma } from "./db";
import { providerFetch } from "./provider-fetch";
/** Strava /athlete exposes weight only when returned under the athlete's existing authorization.
 * https://developers.strava.com/docs/reference/#api-Athletes-getLoggedInAthlete
 * No scope expansion, identity writes, or inference from workouts. */
export function stravaReportedWeight(body: unknown, athleteId: string): number | null {
  if (!body || typeof body !== "object") throw new Error("Invalid Strava profile response");
  const data = body as Record<string, unknown>;
  if (!athleteId || String(data.id) !== athleteId) throw new Error("Strava athlete binding mismatch");
  return typeof data.weight === "number" && Number.isFinite(data.weight) && data.weight >= 20 && data.weight <= 350 ? data.weight : null;
}
export async function importStravaProfileWeight(userId: string, connectionId: string, athleteId: string | null, access: string) {
  if (!athleteId) return; // legacy connection must be rebound before importing profile attributes
  const now = new Date();
  const recent = await prisma.metricObservation.findFirst({where:{userId,source:"strava",metricType:"weight_kg",measurementMethod:"provider_profile_reported",observedAt:{gte:new Date(now.getTime()-86400000)}},select:{id:true}});
  if (recent) return;
  const response = await providerFetch("https://www.strava.com/api/v3/athlete", {headers:{Authorization:`Bearer ${access}`,Accept:"application/json"},cache:"no-store",redirect:"error"});
  if (!response.ok) throw new Error(`Strava profile read failed (${response.status}). Activity imports may already be stored; retry sync.`);
  const value = stravaReportedWeight(await response.json(),athleteId);
  if (value == null) return; // omitted field is not a zero or evidence of missing consent
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const current = await tx.connector.findFirst({where:{id:connectionId,userId,provider:"strava",externalRef:athleteId,status:{in:["connected","error"]}},select:{id:true}});
    if (!current) throw new Error("Strava connection changed during profile import");
    const exists = await tx.metricObservation.findFirst({where:{userId,source:"strava",metricType:"weight_kg",measurementMethod:"provider_profile_reported",observedAt:{gte:new Date(now.getTime()-86400000)}},select:{id:true}});
    if (!exists) await tx.metricObservation.create({data:{userId,source:"strava",metricType:"weight_kg",value,unit:"kg",observedAt:now,measurementMethod:"provider_profile_reported",qualityFlag:"ok"}});
  });
}
type ReviewWeight = {id:string;value:number;unit:string|null;source:string;observedAt:Date;qualityFlag:string|null;measurementMethod:string|null};
export function importedWeightSuggestions(rows:ReviewWeight[], connectedSources:string[], now=new Date()) {
  const seen=new Set<string>();
  const allowed = new Set(["strava","intervals","garmin","oura","whoop","apple_health","coros","withings"]);
  return [...rows].sort((a,b)=>b.observedAt.getTime()-a.observedAt.getTime()).filter(row=>{
    const age=now.getTime()-row.observedAt.getTime();
    if(!allowed.has(row.source)||!row.id||!connectedSources.includes(row.source)||seen.has(row.source)||row.qualityFlag!=="ok"||row.unit!=="kg"||!Number.isFinite(row.value)||row.value<20||row.value>350||!Number.isFinite(age)||age<0||age>30*86400000)return false;
    seen.add(row.source);return true;
  }).map(row=>({observationId:row.id,field:"weightKg" as const,value:row.value,unit:"kg",source:row.source,observedAt:row.observedAt.toISOString(),kind:row.measurementMethod==="provider_profile_reported"?"reported" as const:"observation" as const,requiresConfirmation:true as const}));
}
