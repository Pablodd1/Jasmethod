import { createHash,randomUUID } from "node:crypto";
import { prisma } from "./db";
import { encryptSecret,decryptSecret } from "./crypto";
import { GarminError,GarminBudgetError,garminConfig } from "./garmin-config";
import { garminSummaryPermission,garminActivity,garminMetrics,type GarminSummary,type GarminPushSink } from "./garmin-ingest";
import { getGarminAuthorization } from "./garmin-oauth";
import { storeActivity } from "./activity-store";

const kind="garmin.data.v1";
export const garminPushSink:GarminPushSink={
 async persist(summaries){
  garminConfig();
  return prisma.$transaction(async tx=>{
   let stored=0,duplicates=0,ignored=0;
   for(const summary of summaries){
    // Serialize against consent withdrawal on the same connector row.
    const connections=await tx.connector.findMany({where:{provider:"garmin_direct",externalRef:summary.providerUserId,status:"connected",tokenEnc:{not:null}},select:{id:true,userId:true,scope:true,tokenEnc:true}});
    if(connections.length!==1){ignored++;continue;}
    const c=connections[0];if(!c.scope?.split(" ").includes(garminSummaryPermission(summary.type))){ignored++;continue;}
    const claim=await tx.connector.updateMany({where:{id:c.id,userId:c.userId,status:"connected",tokenEnc:c.tokenEnc,externalRef:summary.providerUserId},data:{status:"connected"}});
    if(claim.count!==1){ignored++;continue;}
    const prefix="garmin:"+createHash("sha256").update(`${c.userId}:${summary.providerUserId}:${summary.type}:${summary.summaryId}`).digest("hex")+":";
    const dedupeKey=prefix+summary.digest;
    const latest=await tx.syncJob.findFirst({where:{userId:c.userId,kind,dedupeKey:{startsWith:prefix}},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{createdAt:true}});
    const payload=encryptSecret(JSON.stringify(summary));if(!payload.startsWith("enc:v1:"))throw new GarminError("encryption_required","Encrypted Garmin inbox storage is required.",503);
    const result=await tx.syncJob.createMany({data:[{userId:c.userId,kind,dedupeKey,payload,createdAt:new Date(Math.max(Date.now(),(latest?.createdAt.getTime()??0)+1))}],skipDuplicates:true});
    if(result.count)stored++;else duplicates++;
   }
   return {stored,duplicates,ignored};
  },{timeout:20000});
 }
};
export async function processGarminInbox(athleteId:string,limit=10,authorization:typeof getGarminAuthorization=getGarminAuthorization){
 garminConfig();
 if(process.env.ENABLE_GARMIN_IMPORTS!=="true")return {processed:0,pending:true,budgetDeferred:false};
 const jobs=await prisma.syncJob.findMany({where:{userId:athleteId,kind,availableAt:{lte:new Date()},OR:[{status:"pending"},{status:"working",leasedUntil:{lt:new Date()}}]},orderBy:{createdAt:"asc"},take:Math.min(25,Math.max(1,limit))});
 let processed=0;
 for(const job of jobs){
  const lease=randomUUID();
  const claim=await prisma.syncJob.updateMany({where:{id:job.id,userId:athleteId,status:job.status,leaseToken:job.leaseToken},data:{status:"working",leaseToken:lease,leasedUntil:new Date(Date.now()+120000),attempts:{increment:1}}});
  if(!claim.count)continue;
  try{
   if(!job.payload.startsWith("enc:v1:"))throw new Error();
   const summary=JSON.parse(decryptSecret(job.payload)) as GarminSummary;
   const auth=await authorization(athleteId,[garminSummaryPermission(summary.type)]);
   if(auth.userId!==summary.providerUserId)throw new Error();
   const user=await prisma.user.findUniqueOrThrow({where:{id:athleteId},select:{timezone:true}});
   const activity=garminActivity(summary),metrics=garminMetrics(summary,user.timezone);
   const checkConnection=async(tx:import("@prisma/client").Prisma.TransactionClient)=>{
    const owned=await tx.syncJob.updateMany({where:{id:job.id,userId:athleteId,status:"working",leaseToken:lease},data:{status:"working"}});
    if(owned.count!==1)throw new Error("Garmin worker lease changed");
    const latest=await tx.syncJob.findFirst({where:{userId:athleteId,kind,dedupeKey:{startsWith:job.dedupeKey.slice(0,job.dedupeKey.lastIndexOf(":"))+":"}},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true}});
    if(latest?.id!==job.id)throw new GarminError("superseded_summary","A newer received Garmin summary is queued.",409);
    const claimed=await tx.connector.updateMany({where:{id:auth.connectorId,userId:athleteId,provider:"garmin_direct",status:"connected",externalRef:auth.userId},data:{status:"connected"}});
    if(claimed.count!==1)throw new Error("Garmin disconnected before import");
   };
   // Never call external report/messaging paths for this source.
   if(activity)await storeActivity(athleteId,user.timezone,activity,{beforeWrite:checkConnection});
   if(metrics)await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athleteId}))`;
    await checkConnection(tx);
    const method=`garmin:${summary.type}:${summary.summaryId}`;
    await tx.metricObservation.deleteMany({where:{userId:athleteId,source:"garmin_direct",measurementMethod:method}});
    if(metrics.values.length)await tx.metricObservation.createMany({data:metrics.values.map(v=>({...v,userId:athleteId,observedAt:metrics.date,source:"garmin_direct",measurementMethod:method}))});
    const previous=await tx.dailyMetrics.findUnique({where:{userId_date:{userId:athleteId,date:metrics.date}}});
    // Preserve manual reports and other providers. Source observations remain available separately.
    if(previous && previous.source!=="garmin_direct")return;
    const data:Record<string,number|null>={};
    if(summary.type==="dailies")data.restingHr=metrics.values.find(v=>v.metricType==="resting_hr")?.value??null;
    if(summary.type==="sleeps")data.sleepHours=metrics.values.find(v=>v.metricType==="sleep_hours")?.value??null;
    if(summary.type==="bodyComps")data.weightKg=metrics.values.find(v=>v.metricType==="weight_kg")?.value??null;
    if(Object.keys(data).length)await tx.dailyMetrics.upsert({where:{userId_date:{userId:athleteId,date:metrics.date}},create:{userId:athleteId,date:metrics.date,source:"garmin_direct",...data},update:data});
   });
   // Unmapped summary types are archived without inventing metrics or fetching an unverified callback URL.
   const done=await prisma.syncJob.updateMany({where:{id:job.id,userId:athleteId,leaseToken:lease,status:"working"},data:{status:"done",leasedUntil:null,leaseToken:null,lastError:null}});if(done.count)processed++;
  }catch(error){
   const superseded=error instanceof GarminError && error.code==="superseded_summary";
   const budget=error instanceof GarminBudgetError || (error instanceof GarminError && error.code==="provider_rate_limited");
   const delay=error instanceof GarminBudgetError?error.retryAfterMs:Math.min(3600000,60000*2**Math.min(job.attempts,6));
   await prisma.syncJob.updateMany({where:{id:job.id,userId:athleteId,leaseToken:lease,status:"working"},data:{status:superseded?"superseded":"pending",leasedUntil:null,leaseToken:null,availableAt:new Date(Date.now()+delay),lastError:superseded?null:"Garmin processing deferred; verify permissions or summary contract."}});
   if(budget)return {processed,pending:true,budgetDeferred:!(error instanceof GarminBudgetError && error.budgetScope==="athlete")};
  }
 }
 return {processed,pending:jobs.length===limit,budgetDeferred:false};
}
