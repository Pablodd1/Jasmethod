import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCoach, canAccessAthlete, ApiError, errorResponse } from "@/lib/access";
import { localDate, addDaysKey, dateKey } from "@/lib/dates";
import { saveProfile, profileRevision } from "@/lib/profile-service";
import { updateWorkout, workoutHasHistory, requireWorkoutRevision, validateWorkoutType } from "@/lib/workout-update";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
 try {
  const {id} = await params;
  const actor = await getCurrentUser();
  if (!actor) throw new ApiError("Sign in",401);
  if (!canCoach(actor) || !(await canAccessAthlete(actor,id))) throw new ApiError("Coach access is not granted",403);
  const athlete = await prisma.user.findUnique({where:{id},select:{id:true,timezone:true}});
  if (!athlete) throw new ApiError("Athlete not found",404);
  let body; try {body=await req.json();} catch {throw new ApiError("Invalid JSON");}
  if(!body || typeof body!=="object" || Array.isArray(body)) throw new ApiError("An editor action is required");
  const action=body.action;
  if(action==="setProfile") {
    if(typeof body.expectedRevision!=="string") throw new ApiError("Reload the profile before saving",409);
    const {action:_,...fields}=body;
    const profile=await saveProfile(actor.id,athlete,fields);
    return Response.json({ok:true,profile,revision:profileRevision(profile)});
  }
  if(action==="moveWorkout" || action==="editWorkout") {
    if(typeof body.expectedRevision!=="string") throw new ApiError("Reload the session before saving",409);
    const fields:Record<string,unknown>={sessionId:String(body.workoutId||""),expectedRevision:body.expectedRevision,protectHistory:true};
    for(const key of action==="moveWorkout"?["date"]:["title","sport","type","intensity","durationMin","startTime","notes"])
      if(body[key]!==undefined) fields[key]=body[key];
    if(action==="moveWorkout"&&body.date===undefined) throw new ApiError("A destination date is required");
    return Response.json({ok:true,workout:await updateWorkout(actor.id,athlete,fields)});
  }
  if(!["deleteWorkout","clearDay","addWorkout","setDayOff"].includes(action)) throw new ApiError("Unknown editor action");
  let date:Date | undefined;
  if(action!=="deleteWorkout") {
    try {date=localDate(String(body.date),athlete.timezone);} catch {throw new ApiError("Invalid calendar date");}
  }
  const result=await prisma.$transaction(async tx=>{
    const audit=async(entityId:string|null,before:unknown,after:unknown)=>tx.auditLog.create({data:{actorId:actor.id,subjectId:id,action:`admin.${action}`,entityId,before:before==null?null:JSON.stringify(before),after:after==null?null:JSON.stringify(after)}});
    if(action==="deleteWorkout") {
      const w=await tx.workout.findFirst({where:{id:String(body.workoutId||""),userId:id}});
      if(!w) throw new ApiError("Workout not found",404);
      requireWorkoutRevision(w,body.expectedRevision);
      if(workoutHasHistory(w)) throw new ApiError("Completed sessions and athlete feedback are retained. Edit the recorded outcome separately.",409);
      await tx.workout.delete({where:{id:w.id}});
      await audit(w.id,w,null);
      return {ok:true};
    }
    if(action==="clearDay") {
      const next=localDate(addDaysKey(String(body.date),1),athlete.timezone);
      const rows=await tx.workout.findMany({where:{userId:id,date:{gte:date!,lt:next},planned:true,completed:false}});
      const eligible=rows.filter(w=>!workoutHasHistory(w));
      // Deletions use the displayed versions, so stale boards cannot erase new work.
      if(!body.revisions || typeof body.revisions!=="object") throw new ApiError("Reload the day before clearing it",409);
      for(const w of eligible) requireWorkoutRevision(w,body.revisions[w.id]);
      const removed=await tx.workout.deleteMany({where:{id:{in:eligible.map(w=>w.id)},userId:id}});
      await audit(null,eligible,{date:body.date,removed:removed.count,retained:rows.length-eligible.length});
      return {ok:true,removed:removed.count,retained:rows.length-eligible.length};
    }
    const plan=await tx.trainingPlan.findFirst({where:{userId:id,status:"active"},orderBy:{createdAt:"desc"}});
    const day=plan?await tx.planDay.findFirst({where:{planId:plan.id,date:date!}}):null;
    if(action==="setDayOff") {
      if(typeof body.dayOff!=="boolean") throw new ApiError("dayOff must be true or false");
      if(!plan) throw new ApiError("No active plan",404);
      const offset=Math.round((Date.parse(String(body.date))-Date.parse(dateKey(plan.startDate,athlete.timezone)))/86400000);
      const after=day?await tx.planDay.update({where:{id:day.id},data:{dayOff:body.dayOff}}):await tx.planDay.create({data:{planId:plan.id,date:date!,week:Math.max(1,Math.floor(offset/7)+1),dayOfWeek:new Date(`${body.date}T12:00Z`).getUTCDay(),focus:body.dayOff?"rest":null,dayOff:body.dayOff}});
      // Published prescriptions no longer represent a newly declared rest day.
      if(body.dayOff) await tx.workout.updateMany({where:{userId:id,date:{gte:date!,lt:localDate(addDaysKey(String(body.date),1),athlete.timezone)},planned:true,completed:false},data:{approved:false}});
      await audit(after.id,day,after);
      return {ok:true,planDay:after};
    }
    const duration=Number(body.durationMin);
    if(!Number.isInteger(duration)||duration<1||duration>600) throw new ApiError("durationMin must be an integer from 1 to 600");
    if(typeof body.title!=="string"||!body.title.trim()||body.title.length>200) throw new ApiError("A title of 1–200 characters is required");
    if(!["run","bike","swim","strength","mobility","recovery","brick","hyrox","boxing","other"].includes(body.sport)) throw new ApiError("Invalid sport");
    const type=validateWorkoutType(body.type);
    if(body.intensity!=null&&!/^z[1-7]$/.test(body.intensity)) throw new ApiError("Invalid intensity");
    if(body.startTime!=null&&body.startTime!==""&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime)) throw new ApiError("Invalid start time");
    if(day?.dayOff && body.sport!=="recovery") throw new ApiError("This is a rest day. Change the day setting before adding training.",409);
    const w=await tx.workout.create({data:{userId:id,planDayId:day?.id??null,date:date!,startTime:body.startTime||null,sport:body.sport,title:body.title.trim(),type,durationMin:duration,intensity:body.intensity??null,planned:true,completed:false,source:"admin",notes:body.notes==null?null:String(body.notes).slice(0,4000)}});
    await audit(w.id,null,w);
    return {ok:true,workout:w};
  },{isolationLevel:"Serializable"});
  return Response.json(result);
 } catch(e:any) {
  if(e.code==="P2034") return errorResponse(new ApiError("Another edit was saved. Reload and retry.",409));
  return errorResponse(e);
 }
}
