import {profileRevision} from "@/lib/profile-service";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { scheduleTests } from "@/lib/adaptive";
import { benchmarkResult } from "@/lib/benchmark-result";
import { parseDate } from "@/lib/dates";
export const dynamic="force-dynamic";
export async function GET(req:Request) {
 try {const {athlete}=await trainingAccess(req);const profile=await prisma.athleteProfile.findUnique({where:{userId:athlete.id}});return Response.json({profileRevision:profileRevision(profile),tests:await prisma.benchmarkTest.findMany({where:{userId:athlete.id},orderBy:{date:"asc"}})});}catch(e){return errorResponse(e);}
}
export async function POST(req:Request) {
 try {
  const {actor,athlete}=await trainingAccess(req);
  let body;try{body=await req.json();}catch{throw new ApiError("Invalid JSON");}
  if(!body||!["record","schedule"].includes(body.action))throw new ApiError("Choose record or schedule");
  if(body.action==="record") return await record(actor.id,athlete,body);
  const plan=await prisma.trainingPlan.findFirst({where:{userId:athlete.id,status:"active"},orderBy:{createdAt:"desc"}});
  if(!plan)throw new ApiError("No active plan — generate one first");
  const races=await prisma.race.findMany({where:{userId:athlete.id,date:{gte:plan.startDate}}});
  const scheduled=scheduleTests(plan.startDate,plan.weeks,races.map(r=>({date:r.date})));
  const created=await prisma.$transaction(async tx=>{
   await tx.benchmarkTest.deleteMany({where:{userId:athlete.id,completed:false}});
   const result=await tx.benchmarkTest.createMany({data:scheduled.map(t=>({userId:athlete.id,date:t.date,type:t.type,name:t.name,skipped:t.skipped,reason:t.reason||null}))});
   await tx.auditLog.create({data:{actorId:actor.id,subjectId:athlete.id,action:"benchmarks.schedule",after:JSON.stringify({planId:plan.id,count:result.count})}});
   return result;
  });
  return Response.json({ok:true,count:created.count,tests:scheduled});
 }catch(e){return errorResponse(e);}
}
async function record(actorId:string,athlete:{id:string;timezone:string},body:any) {
 try {
  const result=await prisma.$transaction(async tx=>{
   const existing=body.id?await tx.benchmarkTest.findFirst({where:{id:String(body.id),userId:athlete.id}}):null;
   if(body.id&&!existing)throw new ApiError("Test not found",404);
   if(existing?.completed)throw new ApiError("Completed tests are preserved. Record a new corrected test with a reason.",409);
   const type=existing?.type||String(body.type);
   let measured;try{measured=benchmarkResult(type,body.result);}catch(e){throw new ApiError((e as Error).message);}
   let date:Date;try{date=existing?.date||parseDate(String(body.date),athlete.timezone);}catch{throw new ApiError("Enter a valid test date");}
   if(date.getTime()>Date.now())throw new ApiError("A completed test cannot be dated in the future");
   const data={completed:true,result:measured.result,skipped:false};
   const test=existing?await tx.benchmarkTest.update({where:{id:existing.id},data}):await tx.benchmarkTest.create({data:{userId:athlete.id,date,type,name:String(body.name||`${type} manual test`).slice(0,200),...data}});
   const apply=body.applyBaseline===true;
   if(apply&&Object.keys(measured.patch).length){
    const before=await tx.athleteProfile.findUnique({where:{userId:athlete.id}});
    if(typeof body.expectedRevision!=="string"||body.expectedRevision!==profileRevision(before))throw new ApiError("Profile changed. Reload and review before applying this baseline.",409);
    if(type==="lthr"&&before?.maxHr&&measured.result>before.maxHr)throw new ApiError("Threshold heart rate cannot exceed saved maximum heart rate");
    const later=await tx.benchmarkTest.findFirst({where:{userId:athlete.id,type,completed:true,date:{gt:date}}});
    if(later)throw new ApiError("A newer completed test exists. Record this result without applying it as today's baseline.",409);
    const after=await tx.athleteProfile.upsert({where:{userId:athlete.id},create:{userId:athlete.id,...measured.patch},update:measured.patch});
    await tx.auditLog.create({data:{actorId,subjectId:athlete.id,action:"baseline.fromTest",entityId:test.id,before:JSON.stringify(before),after:JSON.stringify(after)}});
   }
   await tx.auditLog.create({data:{actorId,subjectId:athlete.id,action:"benchmark.record",entityId:test.id,before:JSON.stringify(existing),after:JSON.stringify(test),note:typeof body.reason==="string"?body.reason.slice(0,1000):null}});
   return {test,baselineApplied:apply&&Object.keys(measured.patch).length>0};
  },{isolationLevel:"Serializable"});
  return Response.json({ok:true,...result});
 }catch(e:any){if(e.code==="P2034")throw new ApiError("Another change was saved. Reload and retry.",409);throw e;}
}
export async function PUT(req:Request){try{const {actor,athlete}=await trainingAccess(req);const b=await req.json();if(!b.id)throw new ApiError("Test ID required");return await record(actor.id,athlete,b);}catch(e){return errorResponse(e);}}
