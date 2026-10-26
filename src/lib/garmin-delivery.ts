import { prisma } from "./db";
import { GarminError, GarminBudgetError, garminConfig } from "./garmin-config";
import { getGarminAuthorization } from "./garmin-oauth";
import { effectivePrescription } from "./effective-prescription";
import { createGarminDeliveryService, type GarminDeliveryReceipt, type GarminDeliveryStore } from "./garmin-delivery-service";
import { createGarminTrainingProtocol, GarminTrainingError } from "./garmin-training-protocol";
import { dateKey,addDaysKey } from "./dates";
import { garminPublicationEligible } from "./garmin-workout";

const action = "garmin.delivery.v1";
export function readGarminReceipt(text: string | null | undefined): GarminDeliveryReceipt | null {
  try {
    const r = JSON.parse(text || "null");
    return r?.version === 1 && typeof r.athleteId === "string" && typeof r.sessionId === "string" && typeof r.providerUserId === "string"
      && typeof r.revision === "string" && typeof r.lease === "string" && typeof r.leaseUntil === "number"
      && ["working","published","cancelled","unknown","failed"].includes(r.status) && r.deviceReceived === false ? r : null;
  } catch { return null; }
}
export const garminDeliveryStore: GarminDeliveryStore = {
  async claim(seed) {
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`garmin-delivery:${seed.athleteId}:${seed.sessionId}`}))`;
      const last = await tx.auditLog.findFirst({where:{subjectId:seed.athleteId,actorId:seed.athleteId,entityId:seed.sessionId,action},orderBy:[{createdAt:"desc"},{id:"desc"}]});
      const previous = readGarminReceipt(last?.after);
      if (last && !previous) throw new GarminError("invalid_receipt","Garmin receipt needs operator review.",409);
      if (!previous && !seed.date) throw new GarminError("session_not_found","No owned session or Garmin publication was found.",404);
      if (previous && (previous.leaseUntil > Date.now() || (previous.retryAt ?? 0) > Date.now())) return null;
      if (previous && previous.providerUserId !== seed.providerUserId) throw new GarminError("garmin_account_changed","Reconcile the original Garmin account before linking delivery to a new account.",409);
      const receipt = previous ? {...previous,lease:seed.lease,leaseUntil:seed.leaseUntil,
        ...(previous.status === "working" ? {status:previous.stage==="claimed"?"failed" as const:"unknown" as const} : {})} : seed;
      await tx.auditLog.create({data:{actorId:seed.athleteId,subjectId:seed.athleteId,entityId:seed.sessionId,action,after:JSON.stringify(receipt),createdAt:new Date(Math.max(Date.now(),(last?.createdAt.getTime()??0)+1))}});
      return receipt;
    });
  },
  async save(expected,next) {
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`garmin-delivery:${expected.athleteId}:${expected.sessionId}`}))`;
      const last = await tx.auditLog.findFirst({where:{subjectId:expected.athleteId,actorId:expected.athleteId,entityId:expected.sessionId,action},orderBy:[{createdAt:"desc"},{id:"desc"}]});
      const actual = readGarminReceipt(last?.after);
      if (!actual || actual.lease !== expected.lease || actual.stage !== expected.stage || actual.status !== expected.status || actual.workoutId !== expected.workoutId)
        throw new GarminError("delivery_changed","Garmin delivery changed; refresh before trying again.",409);
      await tx.auditLog.create({data:{actorId:next.athleteId,subjectId:next.athleteId,entityId:next.sessionId,action,after:JSON.stringify(next),createdAt:new Date(Math.max(Date.now(),last!.createdAt.getTime()+1))}});
    });
  },
};

/** Persistent rolling budgets shared by all instances. OAuth calls also reserve the app budget. */
export async function reserveGarminRequest(athleteId: string, oauth = false) {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"garmin-api-budget"}))`;
    const now = new Date(), minute = new Date(now.getTime()-60000), day = new Date(now.getTime()-86400000);
    const app = await tx.auditLog.count({where:{action:{in:["garmin.api","garmin.oauth"]},createdAt:{gt:minute}}});
    const athlete = oauth ? 0 : await tx.auditLog.count({where:{subjectId:athleteId,action:"garmin.api",createdAt:{gt:day}}});
    if (app >= 90) throw new GarminBudgetError("app",60000);
    if (athlete >= 190) {
      const oldest=await tx.auditLog.findFirst({where:{subjectId:athleteId,action:"garmin.api",createdAt:{gt:day}},orderBy:{createdAt:"asc"},select:{createdAt:true}});
      throw new GarminBudgetError("athlete",Math.max(60000,(oldest?.createdAt.getTime()??now.getTime())+86401000-now.getTime()));
    }
    await tx.auditLog.create({data:{actorId:athleteId,subjectId:athleteId,action:oauth?"garmin.oauth":"garmin.api",note:"Request reservation; no payload or credential stored."}});
  });
}
export async function currentGarminSession(athleteId:string,sessionId:string) {
  const workout = await prisma.workout.findFirst({where:{userId:athleteId,id:sessionId},include:{planDay:{include:{plan:{select:{status:true}}}}}});
  if (!workout || workout.completed || !workout.planned || (workout.planDay && workout.planDay.plan.status !== "active")) return null;
  return (await effectivePrescription(athleteId,sessionId))?.canonical ?? null;
}
export async function publishGarminWorkout(input:{athleteId:string;sessionId:string;expectedRevision:string;cancel?:boolean;automatic?:boolean}) {
  garminConfig();
  if (process.env.ENABLE_GARMIN_TRAINING !== "true") throw new GarminError("garmin_training_unavailable","Direct Garmin training is awaiting verified production activation.",503);
  const protocol = createGarminTrainingProtocol(async (url,init) => {await reserveGarminRequest(input.athleteId);return fetch(url,init);});
  const service = createGarminDeliveryService({store:garminDeliveryStore,protocol,
    authorization:id => getGarminAuthorization(id,["WORKOUT_IMPORT"]),current:currentGarminSession,
    creationAllowed:async continuing=>{
      if(!input.automatic || continuing)return true;
      const connector=await prisma.connector.findUnique({where:{userId_provider:{userId:input.athleteId,provider:"garmin_direct"}},select:{externalRef:true,status:true}});
      return connector?.status==="connected" && !!connector.externalRef && await garminAutoPublishEnabled(input.athleteId,connector.externalRef);
    }});
  return service(input);
}
export async function garminAutoPublishEnabled(athleteId:string,providerUserId:string) {
  const row = await prisma.auditLog.findFirst({where:{actorId:athleteId,subjectId:athleteId,action:"garmin.auto_publish"},orderBy:[{createdAt:"desc"},{id:"desc"}]});
  try {const p=JSON.parse(row?.after || "null");return p?.version===1 && p.enabled===true && p.providerUserId===providerUserId;} catch {return false;}
}
/** Reconcile existing receipts even after opt-out; new publications require fresh per-athlete opt-in. */
export async function reconcileGarminPublications(athleteId:string,deadline=Date.now()+60000) {
  const connector = await prisma.connector.findUnique({where:{userId_provider:{userId:athleteId,provider:"garmin_direct"}}});
  if (connector?.status !== "connected" || !connector.externalRef) return {published:0,cancelled:0,attention:0};
  const auto = await garminAutoPublishEnabled(athleteId,connector.externalRef), now=Date.now();
  const user=await prisma.user.findUniqueOrThrow({where:{id:athleteId},select:{timezone:true}});
  const first=dateKey(new Date(now),user.timezone),last=addDaysKey(first,6);
  const upcoming = await prisma.workout.findMany({where:{userId:athleteId,planned:true,date:{gte:new Date(now-86400000),lte:new Date(now+7*86400000)}},select:{id:true},take:100,orderBy:{date:"asc"}});
  const audits = await prisma.auditLog.findMany({where:{subjectId:athleteId,actorId:athleteId,action},orderBy:[{createdAt:"desc"},{id:"desc"}],distinct:["entityId"]});
  const receipts = new Map<string,GarminDeliveryReceipt>();
  for (const a of audits) {const r=readGarminReceipt(a.after);if(r && !receipts.has(r.sessionId)) receipts.set(r.sessionId,r);}
  const ids=new Set([...upcoming.map(w=>w.id),...receipts.keys()]), totals={published:0,cancelled:0,attention:0,budgetDeferred:false};
  let newPublications=0;
  for (const sessionId of ids) {
    if(Date.now()>deadline)break;
    const receipt=receipts.get(sessionId);
    if(receipt && receipt.date<first)continue; // Do not rewrite historical calendar entries.
    const session=await currentGarminSession(athleteId,sessionId);
    const eligible=!!session && session.dateLocal>=first && session.dateLocal<=last && garminPublicationEligible(session);
    if (!receipt && (!auto || !eligible)) continue;
    if (!receipt && newPublications>=1) continue; // Give every athlete today's session before filling one athlete's week.
    if (receipt?.status==="failed" && !receipt.workoutId && !auto) continue;
    if (receipt?.status==="published" && eligible && receipt.revision===session!.revision) continue;
    if (receipt?.status==="unknown" && !receipt.workoutId) {totals.attention++;continue;}
    if (receipt?.status==="cancelled" && (!auto || !eligible)) continue;
    if (receipt && (receipt.leaseUntil>now || (receipt.retryAt??0)>now)) continue;
    try {const result=await publishGarminWorkout({athleteId,sessionId,expectedRevision:session?.revision??receipt!.revision,cancel:!eligible,automatic:true});
      if(result?.status==="published") {totals.published++;if(!receipt)newPublications++;}else if(result?.status==="cancelled") totals.cancelled++;else totals.attention++;
    } catch(error) {
      totals.attention++;
      if(error instanceof GarminBudgetError || (error instanceof GarminTrainingError && error.code==="garmin_rate_limited")) {
        totals.budgetDeferred=error.budgetScope!=="athlete";break;
      }
    }
  }
  return totals;
}
