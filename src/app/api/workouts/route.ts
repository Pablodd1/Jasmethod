import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { parseManualWorkout } from "@/lib/manual-workout";
import { currentOrReportedWorkoutWhere } from "@/lib/calendar-workouts";
import { createHash } from "node:crypto";
import { manualWorkoutPayloadKey, manualWorkoutRequestId } from "@/lib/manual-workout-request";
import { appMutationOriginAllowed } from "@/lib/request-origin";

export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const days = Number(new URL(req.url).searchParams.get("days") || "14");
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new ApiError("days must be 1–90");
    const plan = await prisma.trainingPlan.findFirst({ where: { userId: athlete.id, status: "active" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
    const workouts = await prisma.workout.findMany({ where: { AND: [currentOrReportedWorkoutWhere(athlete.id, plan?.id ?? null), { date: { gte: new Date(Date.now() - days * 86400000) } }] }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    return NextResponse.json({ workouts }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

// Log only what the athlete explicitly reports. No synthetic sport, minutes,
// biometrics, recovery prescription or provider side effects.
export async function POST(req: Request) {
  try {
    if (!appMutationOriginAllowed(req)) throw new ApiError("Invalid request origin", 403);
    const { actor, athlete } = await trainingAccess(req);
    const body = await req.json().catch(() => { throw new ApiError("Invalid JSON"); });
    let parsed,clientRequestId:string|null;
    try { parsed = parseManualWorkout(body, athlete.timezone); clientRequestId=manualWorkoutRequestId(body); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid activity"); }
    const requestHash=clientRequestId ? createHash("sha256").update(manualWorkoutPayloadKey(body)).digest("hex") : null;
    const receiptId=clientRequestId ? `manual-activity-v1:${createHash("sha256").update(JSON.stringify([athlete.id,clientRequestId])).digest("hex")}` : null;
    // Database-only retries are safe: record and receipt commit in one transaction.
    // Serializable conflicts may arise when another claimant waited on the lock.
    for(let attempt=0;attempt<3;attempt++){
      try {
        const result = await prisma.$transaction(async (tx) => {
          if(receiptId){
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${receiptId}))`;
            const prior=await tx.auditLog.findUnique({where:{id:receiptId}});
            if(prior){
              let note;
              try {note=JSON.parse(prior.note||"{}");}catch{throw new ApiError("The previous activity receipt needs review. Reload before trying again.",409);}
              if(prior.subjectId!==athlete.id||prior.action!=="activity.manual-report"||!note||typeof note!=="object"||Array.isArray(note)||note.version!=="manual-activity-request-v1"||note.requestHash!==requestHash)
                throw new ApiError("This request ID was already used for different activity details. Review the activity before creating another report.",409);
              const workout=prior.entityId ? await tx.workout.findFirst({where:{id:prior.entityId,userId:athlete.id}}) : null;
              if(!workout)throw new ApiError("The previously saved activity is unavailable. Reload your history before creating another report.",409);
              return {workout,replayed:true};
            }
          }
          const created = await tx.workout.create({ data: { userId: athlete.id, ...parsed, approved:false } });
          await tx.auditLog.create({ data: { ...(receiptId?{id:receiptId}:{}),actorId: actor.id, subjectId: athlete.id, action: "activity.manual-report", entityId: created.id, after: JSON.stringify(parsed),...(receiptId?{note:JSON.stringify({version:"manual-activity-request-v1",requestHash})}:{}) } });
          return {workout:created,replayed:false};
        },{isolationLevel:"Serializable"});
        return NextResponse.json({ ok: true, ...result,...(clientRequestId?{clientRequestId}:{}),replayProtected:!!clientRequestId }, { status: result.replayed?200:201,headers:{"Cache-Control":"private, no-store"} });
      } catch(error){
        if(receiptId && ["P2034","P2002"].includes((error as {code?:string})?.code||"")){
          if(attempt<2)continue;
          throw new ApiError("The activity save could not be confirmed after a conflict. Retry the same unchanged request; do not create another report yet.",409);
        }
        throw error;
      }
    }
    throw new ApiError("The activity save could not be confirmed. Retry the same unchanged request.",409);
  } catch (error) { return errorResponse(error); }
}
