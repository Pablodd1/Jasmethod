import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError,errorResponse } from "@/lib/access";
import { activityFingerprint,publicActivityReconciliation,type ActivityDecision } from "@/lib/activity-evidence";
import { readActivityDecisions } from "@/lib/activity-reconciliation";
import {appMutationOriginAllowed} from "@/lib/request-origin";
import {readScenarioJson} from "@/lib/race-scenario-http";
import {rateLimit} from "@/lib/ratelimit";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const failure=(error:unknown)=>{const response=errorResponse(error);response.headers.set("Cache-Control","private, no-store");return response;};
const query=(userId:string)=>({where:{userId,planned:false,completed:true,date:{gte:new Date(Date.now()-180*86400000),lte:new Date()}},orderBy:[{date:"desc" as const},{id:"desc" as const}],take:2001});
export async function GET(){const user=await getCurrentUser();if(!user)return Response.json({error:"Sign in to review your own activity records."},{status:401,headers});try{const [rows,decisions]=await Promise.all([prisma.workout.findMany(query(user.id)),readActivityDecisions(user.id)]);return Response.json({...publicActivityReconciliation(rows.slice(0,2000),decisions),truncated:rows.length>2000}, {headers});}catch(e){return failure(e);}}
export async function POST(req:Request){
  try{
    const user=await getCurrentUser();if(!user)throw new ApiError("Sign in to review your own activity records.",401);
    if(!appMutationOriginAllowed(req))throw new ApiError("Use the app to review your records.",403);
    if(!rateLimit(`activity-reconcile:${user.id}`,30,60000).ok)throw new ApiError("Please wait before saving another review.",429);
    const b=await readScenarioJson(req,8192);
    if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).some(k=>!["kind","ids","primaryId","revision","confirmed"].includes(k))||typeof b.kind!=="string"||!["same_session","different_sessions","review_again"].includes(b.kind)||b.confirmed!==true||!Array.isArray(b.ids)||b.ids.length<2||b.ids.length>20||b.ids.some((id:unknown)=>typeof id!=="string"||!id||id.length>200)||new Set(b.ids).size!==b.ids.length||typeof b.revision!=="string"||!/^[a-f0-9]{64}$/.test(b.revision))throw new ApiError("Explicitly review a current group and choose whether it is one session or separate sessions.");
    if(b.kind==="same_session"&&(!b.ids.includes(b.primaryId)||typeof b.primaryId!=="string"))throw new ApiError("Choose the source record whose actual results should count.");
    if(b.kind!=="same_session"&&b.primaryId!==null)throw new ApiError("Separate sessions and reopened reviews do not use a primary source record.");
    const ids=b.ids as string[];
    const kind=b.kind as ActivityDecision["kind"];
    const primaryId=b.primaryId as string|null;
    const revision=b.revision as string;
    const decision=await prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
      const [rows,previous]=await Promise.all([tx.workout.findMany(query(user.id)),readActivityDecisions(user.id,tx)]);
      const summary=publicActivityReconciliation(rows.slice(0,2000),previous);
      const candidate=kind==="review_again"
        ? summary.reviewedDecisions.find(d=>d.revision===revision&&d.records.length===ids.length&&ids.every(id=>d.records.some(r=>r.id===id)))
        : summary.pending.find(p=>p.revision===revision&&ids.every((id:string)=>p.records.some(r=>r.id===id)));
      if(!candidate)throw new ApiError("The records or review changed. Reload the group before confirming.",409);
      const selected=rows.filter(r=>ids.includes(r.id));if(selected.length!==ids.length)throw new ApiError("These records are unavailable for this account.",404);
      if(kind==="same_session"&&previous.some(d=>d.kind==="different_sessions"&&d.members.filter(m=>ids.includes(m.id)&&selected.some(row=>row.id===m.id&&activityFingerprint(row)===m.fingerprint)).length>=2))throw new ApiError("An existing current review says these were separate sessions. Deliberately reopen that decision before choosing a replacement.",409);
      const value:ActivityDecision={version:1,userId:user.id,kind,primaryId:kind==="same_session"?primaryId:null,recordedAt:new Date().toISOString(),members:selected.map(row=>({id:row.id,fingerprint:activityFingerprint(row)}))};
      await tx.auditLog.create({data:{actorId:user.id,subjectId:user.id,action:"activity.reconcile",entityId:primaryId||selected[0].id,after:JSON.stringify(value),note:kind==="review_again"?"Owner reopened their current explicit decision. Source records and earlier audits are unchanged; manual review and a fresh check-in required.":"Explicit owner review; raw provider observations and profile capacity unchanged. Complete a fresh check-in before further training."}});
      return value;
    },{isolationLevel:"Serializable"});
    return Response.json({ok:true,decision,requiresCheckin:true},{headers});
  }catch(e:any){if(e.code==="P2034")return failure(new ApiError("The review changed. Reload before confirming.",409));return failure(e);}
}
