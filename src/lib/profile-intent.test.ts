import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";
import * as planning from "./planning-setup";
import { profilePatch } from "./profile-update";

function fixture(existing = true, invalid = false) {
  const before = {id:"profile",userId:"owner",goal:"run-only",ftp:230};
  const prior = existing ? {...planning.parsePlanningSetup({restrictions:"present",qualifiedReview:"required",profileConfirmed:true,adultConfirmed:true,baselineWeeklyMinutes:200,baselineObservedAt:"2020-01-01",goalDescription:"Prior goal",planWeeks:12,travel:{destinationTimezone:"Asia/Tokyo"},targetGoal:{sport:"run",metric:"completion",targetDate:"2020-01-01"}},new Date(),"UTC",{allowPastTarget:true}),confirmedAt:"2020-01-01T12:00:00.000Z",source:"coach_set"} : null;
  const audits:any[]=[];const writes:any[]=[];
  const tx={athleteProfile:{findUnique:async()=>before,upsert:async({update}:any)=>{writes.push(update);return{...before,...update};}},auditLog:{create:async({data}:any)=>{audits.push(data);return data;}}};
  const output = ts.transpileModule(readFileSync("src/lib/profile-service.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded = {exports:{} as any};
  class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
  runInNewContext(output,{module:loaded,exports:loaded.exports,Date,require:(name:string)=>{
    if (name === "./planning-setup") return planning;
    if (name === "./travel-context") return {};
    if (name === "./planning-setup-store") return {readPlanningSetup:async()=>({setup:prior,revision:existing || invalid?"s1":null})};
    if (name === "./profile-update") return {profilePatch};
    if (name === "./profile-import-review") return {importedWeightSuggestions:()=>{throw Error("No imported weight writes in a goal edit");}};
    if (name === "./access") return {ApiError};
    if (name === "node:crypto") return {createHash};
    if (name === "./db") return {prisma:{$transaction:async(fn:any)=>fn(tx)}};
    throw Error(name);
  }});
  return {prior,audits,writes,body:{expectedRevision:loaded.exports.profileRevision(before),expectedSetupRevision:existing || invalid?"s1":null,setupSection:"intent",goal:"cycle",setup:{goalDescription:"Steady endurance",planWeeks:"24"}},save:(body:any)=>loaded.exports.saveProfile("owner",{id:"owner",timezone:"UTC"},body)};
}

test("short goal saves preserve safety, source, confirmation age, existing training baseline and manual thresholds", async()=>{
  const f=fixture();const result=await f.save(f.body);
  const setup=JSON.parse(f.audits.find(row=>row.action==="profile.setup").after);
  assert.deepEqual(setup,JSON.parse(JSON.stringify({...f.prior,goalDescription:"Steady endurance",planWeeks:24})));
  assert.equal(result.ftp,230);assert.equal(result.goal,"cycle");assert.equal(setup.confirmedAt,"2020-01-01T12:00:00.000Z");assert.equal(setup.source,"coach_set");
});

test("short goal saves cannot smuggle safety confirmations or unrelated profile fields",async()=>{
  const f=fixture();
  for (const patch of [{setup:{...f.body.setup,restrictions:"none"}},{setup:{...f.body.setup,adultConfirmed:true}},{weightKg:90},{reviewedWeightObservationId:"foreign"},{setup:null}]) await assert.rejects(()=>f.save({...f.body,...patch}),/Goal updates require only/);
  assert.equal(f.audits.length,0);assert.equal(f.writes.length,0);
});

test("a first goal creates only the athlete's actual intent and no fictional baseline or eligibility",async()=>{
  const f=fixture(false);await f.save(f.body);const setup=JSON.parse(f.audits.find(row=>row.action==="profile.setup").after);
  assert.equal(setup.goalDescription,"Steady endurance");assert.equal(setup.planWeeks,24);assert.equal(setup.adultConfirmed,false);assert.equal(setup.profileConfirmed,false);assert.equal(setup.baselineWeeklyMinutes,null);assert.equal(setup.restrictions,"unknown");
});

test("stale revisions or unreadable saved context block goal-only saves without writes",async()=>{
  const f=fixture();await assert.rejects(()=>f.save({...f.body,expectedRevision:"old"}),/profile changed/);await assert.rejects(()=>f.save({...f.body,expectedSetupRevision:"old"}),/setup changed/);assert.equal(f.writes.length,0);
  const invalid=fixture(false,true);await assert.rejects(()=>invalid.save(invalid.body),/Review invalid saved setup/);assert.equal(invalid.writes.length,0);
});


test("reviewed full-cycle experience saves without a weekly-hours guess",async()=>{
  const f=fixture(false);
  await f.save({expectedRevision:f.body.expectedRevision,expectedSetupRevision:null,experience:"advanced",goal:"cycle",setup:{adultConfirmed:true,profileConfirmed:true,profileAnswers:{experience:true,weeklyHours:false},goalDescription:"Ride consistently",planWeeks:12}});
  assert.equal(f.writes[0].experience,"advanced");assert.equal("weeklyHours" in f.writes[0],false);
  const setup=JSON.parse(f.audits.find(row=>row.action==="profile.setup").after);
  assert.equal(setup.profileConfirmed,true);assert.equal(setup.profileAnswers.weeklyHours,false);
});
