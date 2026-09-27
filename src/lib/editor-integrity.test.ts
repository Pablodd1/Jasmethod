import {test} from "node:test";
import assert from "node:assert/strict";
import {prisma} from "./db";
import {updateWorkout,workoutHasHistory,workoutRevision,requireWorkoutRevision,validateWorkoutType} from "./workout-update";

test("history guard retains skipped, partial, completed and measured rows",()=>{
 const w={planned:true,completed:false};
 assert.equal(workoutHasHistory(w),false);
 for(const extra of [{completed:true},{feedbackStatus:"skipped"},{feedbackStatus:"partial"},{actualDurationMin:0},{rpe:1},{avgHr:120},{externalId:"garmin:123"},{planned:false}]) assert.equal(workoutHasHistory({...w,...extra}),true);
});
test("revision normalizes JSON date representation and rejects changed prescriptions",()=>{
 const w={id:"w",date:new Date("2026-09-27T04:00:00Z"),title:"A",durationMin:30};
 assert.equal(workoutRevision(w),workoutRevision(JSON.parse(JSON.stringify(w))));
 assert.throws(()=>requireWorkoutRevision({...w,durationMin:40},workoutRevision(w)),/changed/);
 assert.throws(()=>requireWorkoutRevision(w,undefined),/version/);
 assert.throws(()=>validateWorkoutType("anything"),/Invalid/);
 assert.equal(validateWorkoutType("speed"),"speed");
});
test("shared update preserves protocol on label/time edits, rejects stale writes, invalidates moved approval",async()=>{
 const savedTransaction=prisma.$transaction;
 const protocol={id:"reviewed-4x4",repetitions:4,restSeconds:180};
 const existing:any={id:"w",userId:"a",date:new Date("2026-09-27T04:00Z"),title:"4x4",sport:"run",type:"interval",intensity:"z4",durationMin:40,notes:"Rest 3 minutes",startTime:null,planned:true,completed:false,approved:true,planDay:null,originalPlan:JSON.stringify({title:"4x4",sport:"run",type:"interval",intensity:"z4",durationMin:40,description:"Rest 3 minutes",protocol}),prescription:'{"steps":[{"seconds":240}]}'};
 let writes=0;
 const tx:any={workout:{findFirst:async()=>existing,update:async({data}:any)=>{writes++;return {...existing,...data};}},auditLog:{create:async()=>({})}};
 (prisma as any).$transaction=async(callback:any)=>callback(tx);
 try {
  const revised=await updateWorkout("coach",{id:"a",timezone:"America/New_York"},{sessionId:"w",title:"Renamed",startTime:"07:30",expectedRevision:workoutRevision(existing),protectHistory:true});
  assert.deepEqual(JSON.parse(revised.originalPlan!).protocol,protocol);
  assert.equal(revised.approved,false);
  await assert.rejects(updateWorkout("coach",{id:"a",timezone:"America/New_York"},{sessionId:"w",durationMin:50,expectedRevision:"stale"}),/changed/);
  assert.equal(writes,1);
  await assert.rejects(updateWorkout("athlete",{id:"a",timezone:"America/New_York"},{sessionId:"w",durationMin:50}),/version/);
  assert.equal(writes,1);
  const moved=await updateWorkout("coach",{id:"a",timezone:"America/New_York"},{sessionId:"w",date:"2026-09-28",expectedRevision:workoutRevision(existing),protectHistory:true});
  assert.equal(moved.approved,false);
  assert.equal(moved.originalPlan,existing.originalPlan);
  existing.feedbackStatus="skipped";
  await assert.rejects(updateWorkout("coach",{id:"a",timezone:"America/New_York"},{sessionId:"w",title:"Erase outcome",protectHistory:true}),/cannot be rewritten/);
  assert.equal(writes,2);
  await assert.rejects(updateWorkout("athlete",{id:"a",timezone:"America/New_York"},{sessionId:"w",title:"Bypass flag",expectedRevision:workoutRevision(existing)}),/cannot be rewritten/);
  assert.equal(writes,2);
  const feedback=await updateWorkout("athlete",{id:"a",timezone:"America/New_York"},{sessionId:"w",feedbackNote:"Reason for skipped session"});
  assert.equal(feedback.feedbackNote,"Reason for skipped session");
 } finally {(prisma as any).$transaction=savedTransaction;}
});
