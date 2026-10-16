import { prisma } from "./db";
import {currentActivityDecisions,type ActivityDecision} from "./activity-evidence";
/** Bounded owner-scoped audit read; stale decisions are checked against current evidence by the pure grouper. */
export async function readActivityDecisions(userId:string,db:Pick<typeof prisma,"auditLog">=prisma):Promise<ActivityDecision[]> {
  const rows=await db.auditLog.findMany({where:{subjectId:userId,action:"activity.reconcile"},orderBy:[{createdAt:"desc"},{id:"desc"}],take:1000,select:{after:true}});
  return currentActivityDecisions(rows.flatMap(row=>{try{const value=JSON.parse(row.after||"null");return value?.version===1&&value.userId===userId&&["same_session","different_sessions","review_again"].includes(value.kind)&&Array.isArray(value.members)&&value.members.length>=2&&value.members.every((m:any)=>typeof m.id==="string"&&typeof m.fingerprint==="string")?[value]:[];}catch{return [];}}));
    // Latest decision for the exact member set wins; old observations are retained in the audit.
}
