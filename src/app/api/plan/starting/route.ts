import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { trainingAccess, ApiError, errorResponse } from "@/lib/access";
import { readPlanningSetup } from "@/lib/planning-setup-store";
import { startingCycle, STARTING_CYCLE_VERSION } from "@/lib/starting-cycle";
import { dayBounds, addDaysKey, localDate, dateKey } from "@/lib/dates";
import { prescribeToday } from "@/lib/adaptive";
import { derivedActivityPolicy } from "@/lib/derived-activity-policy";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { readScenarioJson } from "@/lib/race-scenario-http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
type Db = Prisma.TransactionClient;
async function preview(db: Db, user:{id:string;timezone:string}) {
  const day=dayBounds(user.timezone),end=localDate(addDaysKey(day.key,7),user.timezone);
  const [profile,setup,plan,records,races,activeCount]=await Promise.all([
    db.athleteProfile.findUnique({where:{userId:user.id}}),readPlanningSetup(user.id,db),
    db.trainingPlan.findFirst({where:{userId:user.id,status:"active"},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,startDate:true,weeks:true}}),
    db.workout.findMany({where:{userId:user.id,date:{gte:localDate(addDaysKey(day.key,-28),user.timezone),lt:end}},orderBy:{id:"asc"},select:{id:true,date:true,source:true,externalId:true,notes:true}}),
    db.race.findMany({where:{userId:user.id,date:{gte:new Date(`${day.key}T00:00Z`),lt:new Date(`${addDaysKey(day.key,7)}T00:00Z`)}},orderBy:{id:"asc"},select:{id:true,date:true}}),
    db.trainingPlan.count({where:{userId:user.id,status:"active"}}),
  ]);
  const policy=derivedActivityPolicy(records);
  const occupied=[...records.filter(row=>dateKey(row.date,user.timezone)>=day.key).map(row=>dateKey(row.date,user.timezone)),...races.map(row=>row.date.toISOString().slice(0,10)),...(profile?.raceDate ? [dateKey(profile.raceDate,user.timezone)] : [])];
  const cycle=startingCycle(profile,setup.setup,day.key,occupied,policy.status!=="allowed");
  const expiredStartingPlan=plan && activeCount===1 && addDaysKey(dateKey(plan.startDate,user.timezone),plan.weeks*7)<=day.key
    ? await db.auditLog.findFirst({where:{subjectId:user.id,entityId:plan.id,action:"plan.starting"},select:{id:true}}) : null;
  const previewToken=createHash("sha256").update(JSON.stringify({userId:user.id,timezone:user.timezone,profile,setupRevision:setup.revision,plan,activeCount,expiredStartingPlan,records,races,cycle})).digest("hex");
  return {cycle,profile,plan,expiredStartingPlan,previewToken};
}
async function access(req:Request) {
  const result=await trainingAccess(req);
  if(result.actor.id!==result.athlete.id)throw new ApiError("Review and confirm your own starting week.",403);
  return result.athlete;
}
export async function GET(req:Request) {
  try {const user=await access(req),p=await preview(prisma,user);return Response.json({ok:true,preview:p.cycle,previewToken:p.previewToken,existingPlanId:p.expiredStartingPlan?null:p.plan?.id??null,renewingStartingWeek:!!p.expiredStartingPlan},{headers:{"Cache-Control":"private, no-store"}});}catch(e){return errorResponse(e);}
}
export async function POST(req:Request) {
  try {
    const user=await access(req);
    if(!appMutationOriginAllowed(req))throw new ApiError("Confirm your starting week from this application.",403);
    if(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new ApiError("Expected JSON",415);
    if(!rateLimit(`starting-week:${user.id}`,20,60000).ok)throw new ApiError("Please wait before trying again.",429);
    const body=await readScenarioJson(req,1024);
    if(!body||body.confirmed!==true||typeof body.previewToken!=="string"||!/^[a-f0-9]{64}$/.test(body.previewToken)||Object.keys(body).sort().join(",")!=="confirmed,previewToken")throw new ApiError("Review and explicitly confirm the current starting-week preview.");
    const token=body.previewToken;
    const receipt=await prisma.$transaction(async tx=>{
      // Serialize duplicate starting-week confirmations; current plans are checked inside the transaction.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const prior=await tx.auditLog.findFirst({where:{actorId:user.id,subjectId:user.id,action:"plan.starting",note:token},select:{entityId:true}});
      if(prior?.entityId){const active=await tx.trainingPlan.findFirst({where:{id:prior.entityId,userId:user.id,status:"active"},select:{id:true}});if(active)return {planId:active.id,duplicate:true};throw new ApiError("This starting week is no longer active. Review your current plan.",409);}
      const p=await preview(tx,user);
      if(p.plan&&!p.expiredStartingPlan)throw new ApiError("You already have a saved plan. Review that plan before replacing it.",409);
      if(p.previewToken!==token)throw new ApiError("Your information or schedule changed. Review a fresh starting-week preview.",409);
      if(p.plan)await tx.trainingPlan.update({where:{id:p.plan.id},data:{status:"archived"}});
      const es=user.language==="es";
      const plan=await tx.trainingPlan.create({data:{userId:user.id,name:es?"Semana inicial · observar y revisar":"Starting week · observe and review",level:p.profile?.experience||"unconfirmed",distance:p.profile?.goal||"unconfirmed",weeks:1,startDate:localDate(p.cycle.startKey,user.timezone),easyPct:90}});
      for(const day of p.cycle.days){
        const date=localDate(day.dateKey,user.timezone),isTask=day.selected&&!day.occupied&&(day.kind==="review"||day.minutes>0);
        const planDay=await tx.planDay.create({data:{planId:plan.id,date,week:1,dayOfWeek:new Date(`${day.dateKey}T12:00Z`).getUTCDay(),focus:day.minutes>0?p.cycle.base.sport:"review",dayOff:!isTask,notes:JSON.stringify({version:STARTING_CYCLE_VERSION,kind:day.kind,scheduleSource:p.cycle.scheduleSource,provisional:true})}});
        if(!isTask)continue;
        const base={...p.cycle.base,durationMin:day.minutes,title:day.minutes>0?(es?"Observación cómoda · sin prueba máxima":"Comfortable observation · no maximal test"):(es?"Revisar antes de entrenar":"Review before training"),description:day.minutes>0?`${p.cycle.base.description} Record actual effort and recovery; this observation does not establish FTP, threshold pace or VO2 max.`:p.cycle.reasons.map(r=>es?r.es:r.en).join(" ")};
        const prescription=prescribeToday({session:base,adaptation:{verdict:"rest",durationFactor:0,intensityCap:"z1"}});
        await tx.workout.create({data:{userId:user.id,planDayId:planDay.id,date,source:day.minutes>0?"starter":"plan",planned:true,approved:false,completed:false,sport:base.sport,type:base.type,title:base.title,durationMin:day.minutes,intensity:"z1",notes:base.description,originalPlan:JSON.stringify(base),prescription:JSON.stringify(prescription)}});
      }
      await tx.auditLog.create({data:{actorId:user.id,subjectId:user.id,action:"plan.starting",entityId:plan.id,note:token,after:JSON.stringify({version:STARTING_CYCLE_VERSION,cycle:p.cycle})}});
      return {planId:plan.id,duplicate:false};
    },{isolationLevel:"Serializable",timeout:15000});
    return Response.json({ok:true,...receipt},{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){if((e as {code?:string})?.code==="P2034")return errorResponse(new ApiError("Your plan changed while saving. Reload and review it.",409));return errorResponse(e);}
}
