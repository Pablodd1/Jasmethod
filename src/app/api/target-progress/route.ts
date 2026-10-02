import { trainingAccess, ApiError, errorResponse } from "@/lib/access";
import { prisma } from "@/lib/db";
import { readTargetProgress, TARGET_MEASUREMENT_ACTION } from "@/lib/target-progress-store";
import { parseProgressReport } from "@/lib/target-progress";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const {athlete}=await trainingAccess(req);
    const {reports: _reports,...state}=await readTargetProgress(athlete);
    return Response.json(state,{headers:{"Cache-Control":"private, no-store"}});
  } catch(e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const {actor,athlete}=await trainingAccess(req);
    let body: Record<string,unknown>;
    try { body=await req.json(); } catch { throw new ApiError("Invalid measurement JSON"); }
    if (!body || typeof body!=="object" || Array.isArray(body)) throw new ApiError("Invalid measurement report");
    const saved=await prisma.$transaction(async tx=>{
      const state=await readTargetProgress(athlete,tx);
      if (typeof body.expectedRevision!=="string" || body.expectedRevision!==state.revision || body.expectedSetupRevision!==state.setupRevision) throw new ApiError("The target or evidence changed. Reload and review before reporting a result.",409);
      let report;
      try { report=parseProgressReport(body,state.progress.target,new Date(),athlete.timezone); } catch(e) { throw new ApiError((e as Error).message); }
      if (report.supersedesId) {
        const prior=state.reports.find(r=>r.id===report.supersedesId);
        if (!prior || prior.sport!==report.sport || prior.metric!==report.metric || prior.context!==report.context || prior.contextDescription!==report.contextDescription) throw new ApiError("The original report does not match this athlete and target context",404);
        if (state.reports.some(r=>r.supersedesId===prior.id)) throw new ApiError("That report already has a correction. Reload and select the latest report.",409);
      }
      const audit=await tx.auditLog.create({data:{actorId:actor.id,subjectId:athlete.id,action:TARGET_MEASUREMENT_ACTION,after:JSON.stringify({version:"target-report-v1",targetAtEntry:state.progress.target,setupRevision:state.setupRevision,report}),note:report.note??"Manual progress report only; does not set capacity or change training"}});
      return {id:audit.id};
    },{isolationLevel:"Serializable"});
    return Response.json({ok:true,...saved,meaning:"Report saved separately. No benchmark, capacity anchor or prescription was changed."},{status:201});
  } catch(e:any) {
    if (e.code==="P2034") return errorResponse(new ApiError("Another change was saved. Reload and review before retrying.",409));
    return errorResponse(e);
  }
}
