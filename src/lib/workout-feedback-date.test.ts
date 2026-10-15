import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateWorkout,workoutRevision,workoutHasHistory} from './workout-update';
import {localDate,dateKey} from './dates';
test('shared workout writer rejects future actuals across channels but preserves future plan edits and local-day reports',async context=>{
 context.mock.timers.enable({apis:['Date'],now:new Date('2030-01-02T02:00:00Z').getTime()});
 const timezone='America/New_York',actor={id:'synthetic-athlete',timezone};assert.equal(dateKey(new Date(),timezone),'2030-01-01');
 let writes=0,audits=0;
 const row:any={id:'synthetic-session',userId:actor.id,date:localDate('2030-01-02',timezone),title:'Future run',sport:'run',type:'endurance',intensity:'z2',durationMin:30,planned:true,completed:false,planDay:null};
 const tx:any={workout:{findFirst:async()=>row,update:async({data}:any)=>{writes++;return {...row,...data};}},auditLog:{create:async()=>{audits++;return {};}}};
 for(const fields of [{feedbackStatus:'completed',actualDurationMin:20},{completed:true},{actualDurationMin:10},{rpe:3},{avgHr:140},{actualDetails:{distanceKm:3}},{feedbackNote:'Finished'}])await assert.rejects(updateWorkout(actor.id,actor,{sessionId:row.id,...fields},tx),/Future sessions cannot have recorded results/);
 assert.equal(writes,0);assert.equal(audits,0);
 const edited=await updateWorkout(actor.id,actor,{sessionId:row.id,title:'Tomorrow easy run',expectedRevision:workoutRevision(row)},tx);assert.equal(edited.title,'Tomorrow easy run');assert.equal(edited.completed,false);
 for(const day of ['2030-01-01','2029-12-31']){row.date=localDate(day,timezone);const result=await updateWorkout(actor.id,actor,{sessionId:row.id,feedbackStatus:'completed',actualDurationMin:20},tx);assert.equal(result.completed,true);assert.equal(result.actualDurationMin,20);}
 await assert.rejects(updateWorkout(actor.id,actor,{sessionId:row.id,date:'2030-01-02',feedbackStatus:'completed',expectedRevision:workoutRevision(row)},tx),/Future sessions/);
 assert.equal(writes,3);assert.equal(audits,3);
});

test('measurement-only history including zero cannot be rewritten by plan or protected chat edits',async()=>{
 const actor={id:'synthetic-athlete',timezone:'UTC'};
 const base:any={id:'synthetic-session',userId:actor.id,date:new Date(),title:'Reported ride',sport:'bike',type:'endurance',intensity:'z2',durationMin:30,planned:true,completed:false,planDay:null};
 assert.equal(workoutHasHistory(base),false);
 for(const field of ['maxHr','np','distanceKm','preWeightKg','postWeightKg']) for(const value of [0,12]){
  const row={...base,[field]:value};let writes=0;
  const tx:any={workout:{findFirst:async()=>row,update:async()=>{writes++;return row;}},auditLog:{create:async()=>{throw Error('Recorded history must be rejected before audit/write');}}};
  assert.equal(workoutHasHistory(row),true,`${field}=${value}`);
  for(const protectHistory of [false,true])await assert.rejects(updateWorkout(actor.id,actor,{sessionId:row.id,title:'Rewritten plan',expectedRevision:workoutRevision(row),protectHistory},tx),/Recorded sessions and feedback cannot be rewritten/);
  assert.equal(writes,0);
 }
});
