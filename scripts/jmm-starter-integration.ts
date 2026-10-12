/** Synthetic isolated database acceptance. Never runs against production/providers. */
import assert from "node:assert/strict";
import { randomBytes,randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { hashToken } from "../src/lib/auth";
import { dayBounds,addDaysKey,localDate } from "../src/lib/dates";
for(const key of ["DATABASE_URL","DIRECT_URL"]) {
 const url=new URL(process.env[key]||"");
 assert.equal(url.hostname,"127.0.0.1");assert.equal(url.port,"55432");assert.equal(url.pathname,"/jmm_launch_integration_test");
}
assert.notEqual(process.env.VERCEL_ENV,"production");
const db=new PrismaClient(),base="http://127.0.0.1:3220",day=dayBounds("UTC");
let userId="";
async function main() {
 const user=await db.user.create({data:{name:"Synthetic day-zero athlete",email:`starter-${randomUUID()}@example.invalid`,passwordHash:bcrypt.hashSync(randomBytes(32).toString("hex"),4),timezone:"UTC",onboarded:false}});userId=user.id;
 const token=randomBytes(32).toString("hex");await db.authSession.create({data:{userId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});
 async function api(path:string,body?:unknown,status=200) {
   const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{"Content-Type":"application/json",cookie:`jmm_session=${token}`},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"manual"});
   const result=await response.json();assert.equal(response.status,status,`${path}: ${JSON.stringify(result).slice(0,500)}`);return result;
 }
 const unauthorized=await fetch(base+"/api/plan/starter",{method:"POST"});assert.equal(unauthorized.status,401);
 await api("/api/onboard",{});
 assert.equal(await db.athleteProfile.count({where:{userId}}),0,"onboarding never fabricates a profile or athlete baseline");
 assert.equal(await db.workout.count({where:{userId}}),1);
 let today=await api("/api/today");assert.notEqual(today.sessions[0].verdict,"ready","missing safety cannot grant training clearance");
 await api("/api/plan/starter",{});assert.equal(await db.workout.count({where:{userId}}),1,"repeat mutation never adds a second starter");
 const checkin={sleep:4,soreness:2,motivation:4,energy:4,stress:2,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:20};
 await api("/api/checkin",checkin);
 today=await api("/api/today");assert.equal(today.sessions[0].verdict,"ready");assert.equal(today.sessions[0].durationMin,20);assert.equal(today.sessions[0].sport,"mobility");
 await api("/api/checkin",{...checkin,availableMinutes:10});today=await api("/api/today");assert.ok(today.sessions[0].durationMin<=10);
 await api("/api/checkin",{...checkin,sick:true});today=await api("/api/today");assert.notEqual(today.sessions[0].verdict,"ready");assert.equal(today.sessions[0].durationMin,0);
 await db.workout.deleteMany({where:{userId}});
 const count=await db.workout.count({where:{userId}});await api("/api/today");assert.equal(await db.workout.count({where:{userId}}),count,"GET remains read-only");
 await db.race.create({data:{userId,name:"Synthetic event",date:day.start,distance:"5k"}});
 const event=await api("/api/plan/starter",{});assert.equal(event.created,false);
 await db.race.deleteMany({where:{userId}});
 const first=await api("/api/plan/starter",{});
 await db.workout.update({where:{id:first.workoutId},data:{date:localDate(addDaysKey(day.key,-2),"UTC")}});
 await api("/api/plan/starter",{});today=await api("/api/today");assert.equal(today.recovery.mode,"planned-rest");
 assert.equal(await db.metricObservation.count({where:{userId,metricType:"jmm_rest_day"}}),0,"planned recovery never fabricates completed rest");
 await db.workout.deleteMany({where:{userId}});
 await db.athleteProfile.create({data:{userId,injured:true}});
 const injury=await api("/api/plan/starter",{});assert.equal(injury.created,false);
 console.log("DAY_ZERO_ACCEPTANCE_PASSED",JSON.stringify({authenticated:true,noInventedProfile:true,idempotent:true,checkinRequired:true,availableTimeBounded:true,illnessHold:true,readOnlyGet:true,eventProtected:true,starterRestProtected:true,injuryHold:true}));
}
try {await main();} finally {if(userId) await db.user.delete({where:{id:userId}});await db.$disconnect();}
