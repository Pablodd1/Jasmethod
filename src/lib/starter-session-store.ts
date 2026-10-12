import { prisma } from "./db";
import { dayBounds, dateKey, addDaysKey } from "./dates";
import { readPlanningSetup } from "./planning-setup-store";
import { starterSession, starterRestriction } from "./starter-session";
import { prescribeToday } from "./adaptive";

/** Explicit mutation only. Never add work over a plan, rest/event day or actual activity. */
export async function ensureStarterWorkout(userId:string,actorId=userId) {
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const user=await tx.user.findUnique({where:{id:userId},include:{profile:true}});
    if(!user) throw Error("Athlete not found");
    const day=dayBounds(user.timezone);
    const [existing,plan,event,setup,recent,firstStarter]=await Promise.all([
      tx.workout.findFirst({where:{userId,date:{gte:day.start,lt:day.end}}}),
      tx.trainingPlan.findFirst({where:{userId,status:"active"},select:{id:true}}),
      tx.race.findFirst({where:{userId,date:{gte:new Date(`${day.key}T00:00:00Z`),lt:new Date(`${addDaysKey(day.key,1)}T00:00:00Z`)}}}),
      readPlanningSetup(userId,tx),
      tx.workout.findFirst({where:{userId,completed:true,date:{lt:day.start}},orderBy:{date:"desc"},select:{sport:true}}),
      tx.workout.findFirst({where:{userId,source:{in:["starter","starter-rest"]}},orderBy:{date:"asc"},select:{date:true}}),
    ]);
    if(existing||plan||event||starterRestriction(user.profile,setup.setup) || (user.profile?.raceDate && dateKey(user.profile.raceDate,user.timezone)===day.key)) return {created:false,workoutId:existing?.id??null};
    const elapsed=firstStarter ? Math.round((Date.parse(day.key)-Date.parse(dateKey(firstStarter.date,user.timezone)))/86400000) : 0;
    const cycleDay=((elapsed%7)+7)%7;
    const level=user.profile?.experience;
    const rest=level === "pro" ? false : level === "amateur" || level === "advanced" ? cycleDay===6 : cycleDay===2 || cycleDay===6;
    const available=!setup.setup?.trainingDays.length || setup.setup.trainingDays.includes(new Date(`${day.key}T12:00Z`).getUTCDay());
    const recoveryDay=rest || !available;
    const base=recoveryDay ? {...starterSession(user.profile?.goal,recent?.sport),title:"Starter recovery day",sport:"recovery",durationMin:0,description:"Planned recovery: no compulsory workout or catch-up work. Prioritize sleep, familiar meals and recovery. Optional gentle movement is reviewed separately after today's check-in; a planned rest day is not a completed-rest report."} : starterSession(user.profile?.goal,recent?.sport);
    const prescription=prescribeToday({session:base,adaptation:{verdict:"rest",durationFactor:0,intensityCap:"z1"}});
    const workout=await tx.workout.create({data:{userId,date:day.start,source:recoveryDay ? "starter-rest" : "starter",planned:true,approved:false,
      title:base.title,sport:base.sport,type:base.type,intensity:base.intensity,durationMin:base.durationMin,notes:base.description,
      originalPlan:JSON.stringify(base),prescription:JSON.stringify(prescription)}});
    await tx.auditLog.create({data:{actorId,subjectId:userId,action:"workout.starter",entityId:workout.id,after:JSON.stringify(base)}});
    return {created:true,workoutId:workout.id};
  },{isolationLevel:"Serializable"});
}
