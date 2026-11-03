import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { readPlanningSetup } from "./planning-setup-store";
import { firstPlanDraft, firstPlanDateKeys, FIRST_PLAN_VERSION } from "./first-plan";
import { ACTIVITY_EVIDENCE_SELECT } from "./activity-evidence";
import { dayBounds, addDaysKey, localDate, dateKey } from "./dates";
import { currentOrReportedWorkoutWhere } from "./calendar-workouts";
import { prescribeToday } from "./adaptive";

/** Only creates a first provisional week. Every active plan, even an expired
 * plan, is retained for explicit review. All writes and receipt share one tx. */
export async function ensureFirstPlan(userId:string, db = prisma) {
  for(let attempt=0;attempt<3;attempt++) {
    try {
      return await db.$transaction(async (tx:Prisma.TransactionClient)=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const existing=await tx.trainingPlan.findFirst({where:{userId,status:"active"},orderBy:[{createdAt:"desc"},{id:"desc"}],select:{id:true,distance:true}});
        if(existing)return {created:false,planId:existing.id,distance:existing.distance,status:"existing"};
        const user=await tx.user.findUnique({where:{id:userId},include:{profile:true}});
        if(!user)throw new Error("User not found");
        const day=dayBounds(user.timezone),end=localDate(addDaysKey(day.key,7),user.timezone);
        const [setup,records,races]=await Promise.all([
          readPlanningSetup(userId,tx),
          tx.workout.findMany({where:{userId,AND:[currentOrReportedWorkoutWhere(userId,null)],date:{gte:localDate(addDaysKey(day.key,-28),user.timezone),lt:end}},orderBy:{id:"asc"},select:ACTIVITY_EVIDENCE_SELECT}),
          tx.race.findMany({where:{userId,date:{gte:new Date(`${addDaysKey(day.key,-28)}T00:00Z`),lt:new Date(`${addDaysKey(day.key,35)}T00:00Z`)}},orderBy:{id:"asc"},select:{id:true,name:true,date:true,priority:true,distance:true}}),
        ]);
        const events=races.map(r=>({id:r.id,name:r.name,dateKey:r.date.toISOString().slice(0,10),priority:r.priority as 1|2|3,distance:r.distance,source:"stored" as const}));
        if(user.profile?.raceDate&&!events.some(e=>e.dateKey===dateKey(user.profile!.raceDate!,user.timezone)))events.push({id:"profile-event",name:"Profile event",dateKey:dateKey(user.profile.raceDate,user.timezone),priority:1,distance:user.profile.goal??"",source:"stored"});
        const draft=firstPlanDraft(user.profile,setup.setup,day.key,user.timezone,records,events);
        if(!draft)return {created:false,planId:null,distance:user.profile?.goal??null,status:"choose_sport"};
        const es=user.language==="es";
        const name=draft.kind==="reported_capacity"?(user.profile?.goal==="hyrox"?(es?"HYROX · semana preparatoria provisional":"HYROX · provisional preparatory week"):(es?"Primera semana provisional · capacidad declarada":"Provisional first week · reported capacity")):(es?"Semana inicial · observar y revisar":"Starting week · observe and review");
        const plan=await tx.trainingPlan.create({data:{userId,name,level:user.profile?.experience||"unconfirmed",distance:user.profile!.goal!,weeks:1,startDate:day.start,easyPct:90}});
        for(const [slot,key] of firstPlanDateKeys(day.key).entries()){
          const sessions=draft.sessions.filter(s=>s.slot===slot),date=localDate(key,user.timezone);
          // A protected current/reported workout is not a newly prescribed rest
          // day merely because no duplicate session is allocated to this plan.
          // Events remain separate protection; they do not invent performed work.
          const occupiedWorkout=records.find(row=>dateKey(row.date,user.timezone)===key&&row.source!=="starter-rest");
          const pd=await tx.planDay.create({data:{planId:plan.id,date,week:1,dayOfWeek:new Date(`${key}T12:00Z`).getUTCDay(),focus:sessions[0]?.base.sport??occupiedWorkout?.sport??"recovery",dayOff:!sessions.length&&!occupiedWorkout,notes:JSON.stringify({version:FIRST_PLAN_VERSION,provisional:true,kind:draft.kind,note:draft.note})}});
          for(const session of sessions){
            const prescription=prescribeToday({session:session.base,adaptation:{verdict:"rest",durationFactor:0,intensityCap:"z1"}});
            await tx.workout.create({data:{userId,planDayId:pd.id,date,source:session.source,planned:true,approved:false,completed:false,sport:session.base.sport,type:session.base.type,title:session.base.title,durationMin:session.base.durationMin,intensity:session.base.intensity,notes:session.base.description,originalPlan:JSON.stringify(session.base),prescription:JSON.stringify({...prescription,planningStatus:"provisional",planningNote:draft.note})}});
          }
        }
        await tx.auditLog.create({data:{actorId:userId,subjectId:userId,action:"plan.first",entityId:plan.id,after:JSON.stringify({version:FIRST_PLAN_VERSION,setupRevision:setup.revision,draft})}});
        return {created:true,planId:plan.id,distance:user.profile!.goal,status:draft.kind,totalMinutes:draft.totalMinutes,note:draft.note};
      },{isolationLevel:"Serializable",timeout:30000});
    }catch(error){if((error as {code?:string})?.code==="P2034"&&attempt<2)continue;throw error;}
  }
  throw new Error("First plan could not be saved; retry");
}
