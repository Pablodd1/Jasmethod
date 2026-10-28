import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError,errorResponse } from "@/lib/access";
import { parseSportEntry,SPORT_MANUAL_SOURCE } from "@/lib/sport-measurements";
import { readSportEvidence } from "@/lib/sport-evidence-store";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { readScenarioJson } from "@/lib/race-scenario-http";
import { rateLimit } from "@/lib/ratelimit";
import { sportDistanceSupplement } from "@/lib/sport-distance-supplement";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","X-JMM-Data-Provenance":"protected_sport_evidence"};
async function owner(req:Request) {
  const user=await getCurrentUser();if(!user)throw new ApiError("Sign in first.",401);
  if(new URL(req.url).search)throw new ApiError("This view is for your own account.",403);
  return user;
}
export async function GET(req:Request) {try {const user=await owner(req);return Response.json({ok:true,...await readSportEvidence(user)},{headers});}catch(e){return errorResponse(e);}}
export async function POST(req:Request) {
  try {
    const user=await owner(req);
    if(!appMutationOriginAllowed(req))throw new ApiError("Review the activity inside this app.",403);
    if(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new ApiError("Expected JSON.",415);
    if(!rateLimit("sport-evidence:"+user.id,30,60000).ok)throw new ApiError("Please wait before trying again.",429);
    const body=await readScenarioJson(req,8192);
    if(body&&["preview-distance","save-distance"].includes(String(body.mode)))return Response.json(await sportDistanceSupplement(user,body),{headers});
    if(!body||Object.keys(body).some(k=>!["mode","entry","requestId","previewToken","confirmed"].includes(k))||typeof body.mode!=="string"||!["preview","save"].includes(body.mode)||
      typeof body.requestId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.requestId))throw new ApiError("Invalid activity review.");
    let parsed;try {parsed=parseSportEntry(body.entry,user.timezone);}catch(e){throw new ApiError(e instanceof Error?e.message:"Invalid measurements.");}
    const {workout,measurements}=parsed;
    const summary={sport:workout.sport,date:workout.date.toISOString(),measurements,avgHr:workout.avgHr??null,maxHr:workout.maxHr??null,avgPower:workout.avgPower??null,np:workout.np??null,calories:workout.calories??null,rpe:workout.rpe};
    const token=createHash("sha256").update(JSON.stringify({userId:user.id,requestId:body.requestId,summary})).digest("hex");
    if(body.mode==="preview")return Response.json({ok:true,state:"proposed",preview:summary,previewToken:token},{headers});
    if(body.confirmed!==true||body.previewToken!==token)throw new ApiError("Review the current calculation and confirm it.",409);
    const externalId="manual-sport:"+body.requestId;
    const saved=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const existing=await tx.workout.findFirst({where:{userId:user.id,source:SPORT_MANUAL_SOURCE,externalId},select:{id:true}});
      if(existing){const audit=await tx.auditLog.findFirst({where:{actorId:user.id,subjectId:user.id,entityId:existing.id,action:"activity.sport-report",note:token},select:{id:true}});
        if(!audit)throw new ApiError("This request already saved different information. Start a new review.",409);return {id:existing.id,duplicate:true};}
      const created=await tx.workout.create({data:{userId:user.id,...workout,externalId,title:user.language==="es"?({bike:"Ciclismo",swim:"Natación",run:"Carrera"}[workout.sport]||workout.title):workout.title}});
      await tx.auditLog.create({data:{actorId:user.id,subjectId:user.id,action:"activity.sport-report",entityId:created.id,note:token,after:JSON.stringify(summary)}});
      return {id:created.id,duplicate:false};
    },{timeout:15000});
    return Response.json({ok:true,state:"saved",workoutId:saved.id,duplicate:saved.duplicate,observation:summary},{status:saved.duplicate?200:201,headers});
  }catch(e){return errorResponse(e);}
}
