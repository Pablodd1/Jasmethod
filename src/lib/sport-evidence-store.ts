import { createHash } from "node:crypto";
import { prisma } from "./db";
import { decryptSecret } from "./crypto";
import { garminActivity,parseGarminPush, type GarminSummary } from "./garmin-ingest";
import { readSportMeasurements,mergeProviderMeasurements } from "./sport-measurements";
import { readActivityDecisions } from "./activity-reconciliation";
import { sportEvidence,SPORT_RECORD_SELECT,sportRowRevision, type SportRow } from "./sport-evidence";
import { unitsOf } from "./units";

/** Recover only the latest legacy summary per sport, from an owned, processed, still-authorized archive.
 * No provider request, historical backfill, DB write, callback URL or external model is involved. */
export async function recoverLatestGarmin(rows:SportRow[],userId:string,connection:{status:string;scope:string|null;externalRef:string|null}|null,db:Pick<typeof prisma,"syncJob">=prisma) {
  if(connection?.status!=="connected"||!connection.externalRef||!connection.scope?.split(" ").includes("ACTIVITY_EXPORT"))return rows;
  const seen=new Set<string>(),targets=rows.filter(row=>{
    if(row.userId!==userId||row.source!=="garmin_direct"||!row.externalId?.startsWith("garmin:")||!["bike","swim","run"].includes(row.sport)||seen.has(row.sport))return false;
    seen.add(row.sport);
    return !readSportMeasurements(row.actualDetails,row.sport,row.source)&&!row.feedbackAt;
  });
  const recovered=await Promise.all(targets.map(async row=>{
    const summaryId=row.externalId!.slice(7);
    if(!/^[A-Za-z0-9_.:-]{1,160}$/.test(summaryId))return null;
    const prefixes=["activities","manuallyUpdatedActivities"].map(type=>"garmin:"+createHash("sha256").update(userId+":"+connection.externalRef+":"+type+":"+summaryId).digest("hex")+":");
    const job=await db.syncJob.findFirst({where:{userId,kind:"garmin.data.v1",OR:prefixes.map(prefix=>({dedupeKey:{startsWith:prefix}}))},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{payload:true,status:true}});
    if(!job||job.status!=="done"||job.payload.length>3*1024*1024||!job.payload.startsWith("enc:v1:"))return null;
    try {
      const summary=JSON.parse(decryptSecret(job.payload)) as GarminSummary;
      if(summary.providerUserId!==connection.externalRef||summary.summaryId!==summaryId||!["activities","manuallyUpdatedActivities"].includes(summary.type))return null;
      const canonical=parseGarminPush({[summary.type]:[summary.record]})[0];
      if(canonical.providerUserId!==connection.externalRef||canonical.summaryId!==summaryId)return null;
      const activity=garminActivity(canonical);
      if(!activity?.actualDetails||activity.sport!==row.sport||activity.date.getTime()!==new Date(row.date).getTime()||activity.distanceKm!==row.distanceKm||activity.durationMin!==row.durationMin)return null;
      return {id:row.id,actualDetails:mergeProviderMeasurements(row.actualDetails,activity.actualDetails)};
    }catch{return null;}
  }));
  const byId=new Map(recovered.filter((v):v is NonNullable<typeof v>=>v!==null).map(v=>[v.id,v.actualDetails]));
  return rows.map(row=>byId.has(row.id)?{...row,actualDetails:byId.get(row.id)!}:row);
}
export async function readSportEvidence(user:{id:string;language:string;timezone:string},now=new Date()) {
  const [records,profile,connection,receipt,decisions]=await Promise.all([
    prisma.workout.findMany({where:{userId:user.id,date:{gte:new Date(now.getTime()-90*86400000),lte:now},OR:[{completed:true},{actualDurationMin:{not:null}}]},orderBy:[{date:"desc"},{id:"desc"}],take:501,
      select:SPORT_RECORD_SELECT}),
    prisma.athleteProfile.findUnique({where:{userId:user.id},select:{units:true}}),
    prisma.connector.findFirst({where:{userId:user.id,provider:"garmin_direct"},select:{status:true,scope:true,externalRef:true,lastSyncAt:true}}),
    prisma.syncJob.findFirst({where:{userId:user.id,kind:"garmin.data.v1"},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{createdAt:true,status:true}}),
    readActivityDecisions(user.id),
  ]);
  const rows=await recoverLatestGarmin(records.slice(0,500).map(row=>({...row,rawEvidenceRevision:sportRowRevision(row)})),user.id,connection);
  return {version:1,units:unitsOf(profile?.units,user.language),timezone:user.timezone,asOf:now.toISOString(),sports:sportEvidence(rows,user.id,decisions,now,records.length>500),
    garmin:{status:connection?.status??"disconnected",activityPermission:connection?.scope?.split(" ").includes("ACTIVITY_EXPORT")??false,
      importEnabled:process.env.ENABLE_GARMIN_IMPORTS==="true",lastConnectorSyncAt:connection?.lastSyncAt?.toISOString()??null,lastReceivedAt:receipt?.createdAt.toISOString()??null,receiptStatus:receipt?.status??null},
    scope:"Stored observations only. Missing periods are not rest. Average speed is not a threshold or a training clearance."};
}
