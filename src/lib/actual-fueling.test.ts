import assert from "node:assert/strict";
import test from "node:test";
import { actualFuelingFromForm, actualFuelingRates, parseActualFueling, readActualFueling } from "./actual-fueling";
import { updateWorkout } from "./workout-update";

test("actual intake accepts reported zero, rejects coercion/foreign units and derives rates only from actual minutes", () => {
  assert.deepEqual(parseActualFueling({carbsG:0,fluidMl:0,giSymptoms:"none"}),{carbsG:0,fluidMl:0,giSymptoms:"none"});
  for(const bad of [undefined,[],"90",{carbsG:"90"},{carbsG:true},{carbsG:-1},{carbsG:1501},{fluidMl:Number.NaN},{fluidMl:30001},{giSymptoms:["none"]},{giSymptoms:{}},{carbsGPerHour:90},{fluidOz:16},{gutTrained:true}])assert.throws(()=>parseActualFueling(bad));
  assert.equal(parseActualFueling(null),null);
  const report={schemaVersion:1 as const,carbsG:90,fluidMl:1000,giSymptoms:"mild" as const};
  assert.deepEqual(actualFuelingRates(report,90),{durationMin:90,carbsGPerHour:60,fluidMlPerHour:1000*60/90});
  for(const duration of [null,undefined,0,-1,"90",Number.NaN,1.5])assert.equal(actualFuelingRates(report,duration).carbsGPerHour,null);
  assert.equal(actualFuelingRates({...report,carbsG:0},90).carbsGPerHour,0);
  assert.equal(readActualFueling("malformed"),null);
  assert.equal(readActualFueling(JSON.stringify({schemaVersion:1,values:{},fueling:{...report,carbsG:"90"}})),null);
  const form=new FormData();form.set("actualCarbsG","0");form.set("actualFluidMl","");form.set("actualGiSymptoms","none");
  assert.deepEqual(actualFuelingFromForm(form),{carbsG:0,fluidMl:null,giSymptoms:"none"});
});

test("owner-scoped intake persists and reloads without erasing quantities or auto-increasing a prescription",async()=>{
  const athlete={id:"athlete-a",timezone:"UTC"};
  let row:any={id:"session-a",userId:athlete.id,date:new Date(),title:"Reported bike",sport:"bike",planned:true,completed:false,durationMin:120,actualDurationMin:90,
    prescription:'{"sport":"bike","durationMin":120}',originalPlan:'{"durationMin":120}',actualDetails:JSON.stringify({schemaVersion:1,source:"athlete_report",values:{distanceKm:42,reps:null},extraReviewedContext:{retained:true}})};
  const originalPrescription=row.prescription;let audits=0,writes=0;
  const tx:any={workout:{findFirst:async({where}:any)=>where.userId===row.userId&&where.id===row.id?row:null,update:async({data}:any)=>{writes++;row={...row,...data};return row;}},auditLog:{create:async()=>{audits++;return {};}}};
  const save=(fields:Record<string,unknown>)=>updateWorkout(athlete.id,athlete,{sessionId:row.id,...fields},tx);
  await save({actualFueling:{carbsG:90,fluidMl:1000,giSymptoms:"mild"}});
  let details=JSON.parse(row.actualDetails);
  assert.deepEqual(details.values,{distanceKm:42,reps:null});assert.deepEqual(details.extraReviewedContext,{retained:true});
  assert.deepEqual(readActualFueling(row.actualDetails),{schemaVersion:1,carbsG:90,fluidMl:1000,giSymptoms:"mild"});
  assert.equal(actualFuelingRates(readActualFueling(row.actualDetails),row.actualDurationMin).carbsGPerHour,60);
  assert.equal(row.prescription,originalPrescription);assert.equal(row.durationMin,120);assert.equal(audits,1);
  await save({actualDetails:{distanceKm:43}});assert.equal(readActualFueling(row.actualDetails)?.carbsG,90);
  await save({actualFueling:{carbsG:0}});assert.equal(readActualFueling(row.actualDetails)?.fluidMl,1000);assert.equal(readActualFueling(row.actualDetails)?.carbsG,0);
  const saved=row.actualDetails;await save({feedbackNote:"Felt fine"});assert.equal(row.actualDetails,saved,"omitted intake leaves the original report intact");
  await save({actualFueling:{carbsG:null}});assert.equal(readActualFueling(row.actualDetails)?.carbsG,null);assert.equal(readActualFueling(row.actualDetails)?.fluidMl,1000);
  await save({actualDetails:null});assert.deepEqual(JSON.parse(row.actualDetails).values,{});assert.equal(readActualFueling(row.actualDetails)?.fluidMl,1000);
  await save({actualFueling:null});assert.equal(readActualFueling(row.actualDetails),null);assert.deepEqual(JSON.parse(row.actualDetails).extraReviewedContext,{retained:true});
  const before=writes;
  await assert.rejects(updateWorkout("outsider",{id:"other-athlete",timezone:"UTC"},{sessionId:row.id,actualFueling:{carbsG:100}},tx),/Session not found/);assert.equal(writes,before);
  await assert.rejects(save({actualFueling:{carbsG:"100"}}),/reported total/);assert.equal(writes,before);
  row={...row,date:new Date(Date.now()+2*86400000)};await assert.rejects(save({actualFueling:{carbsG:10}}),/Future sessions/);assert.equal(writes,before);
});
