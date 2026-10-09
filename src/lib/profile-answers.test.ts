import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";
import * as planning from "./planning-setup";
import * as travel from "./travel-context";
import { hydrateOnboarding } from "./onboarding-form";

function fixture(prior:planning.PlanningSetup|null = {...planning.parsePlanningSetup({restrictions:"present",profileConfirmed:false,adultConfirmed:true,goalDescription:"Existing goal",travel:{destinationTimezone:"Asia/Tokyo"}}),confirmedAt:"2020-01-01T12:00:00.000Z",source:"coach_set"}) {
  const before={id:"profile",userId:"owner",experience:"beginner",weeklyHours:8,heightCm:170};
  const audits:any[]=[];let reads=0;
  const tx={athleteProfile:{findUnique:async()=>before,upsert:async({update}:any)=>({...before,...update})},auditLog:{create:async({data}:any)=>{audits.push(data);return data;}}};
  class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
  const output=ts.transpileModule(readFileSync("src/lib/profile-service.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loadedModule={exports:{} as any};
  runInNewContext(output,{module:loadedModule,exports:loadedModule.exports,Date,require:(name:string)=>{
    if(name==="./planning-setup")return planning;
    if(name==="./travel-context")return travel;
    if(name==="./planning-setup-store")return {readPlanningSetup:async()=>{reads++;return {setup:prior,revision:prior?"setup-old":null};}};
    if(name==="node:crypto")return {createHash};
    if(name==="./db")return {prisma:{$transaction:async(fn:any)=>fn(tx)}};
    if(name==="./access")return {ApiError};
    if(name==="./profile-import-review")return {importedWeightSuggestions:()=>[]};
    if(name==="./profile-update")return {profilePatch:(fields:Record<string,unknown>)=>({...fields})};
    throw Error(`Unexpected dependency ${name}`);
  }});
  return {prior,audits,reads:()=>reads,async save(fields:Record<string,unknown>,revision=loadedModule.exports.profileRevision(before)){return loadedModule.exports.saveProfile("owner",{id:"owner",timezone:"UTC"},{...fields,expectedRevision:revision});}};
}
test("settings experience/time merge records only supplied answers and preserves confirmation age/source/context",async()=>{
  const f=fixture();const profile=await f.save({experience:"advanced"});
  const setup=JSON.parse(f.audits.find(row=>row.action==="profile.setup").after);
  assert.equal(setup.confirmedAt,f.prior!.confirmedAt);assert.equal(setup.source,"coach_set");assert.equal(setup.restrictions,"present");assert.equal(setup.adultConfirmed,true);assert.equal(setup.profileConfirmed,false);assert.equal(setup.goalDescription,"Existing goal");assert.deepEqual(setup.travel,f.prior!.travel);
  assert.deepEqual(setup.profileAnswers,{experience:true,weeklyHours:false});
  assert.equal(hydrateOnboarding(profile,setup).profile.experience,"advanced");assert.equal(hydrateOnboarding(profile,setup).profile.weeklyHours,"");
});
test("weekly time edit preserves an already recorded experience answer without changing other evidence",async()=>{
  const prior={...planning.parsePlanningSetup({profileAnswers:{experience:true,weeklyHours:false}}),confirmedAt:"2020-01-01T12:00:00.000Z"};
  const f=fixture(prior);await f.save({weeklyHours:6});const setup=JSON.parse(f.audits.find(row=>row.action==="profile.setup").after);
  assert.deepEqual(setup.profileAnswers,{experience:true,weeklyHours:true});assert.equal(setup.confirmedAt,prior.confirmedAt);assert.equal(setup.profileConfirmed,false);
});
test("height-only edit does not read or rewrite planning setup",async()=>{
  const f=fixture();await f.save({heightCm:171});assert.equal(f.reads(),0);assert.equal(f.audits.filter(row=>row.action==="profile.setup").length,0);
});
test("new answer markers never infer safety confirmation or planning readiness",async()=>{
  const f=fixture(null);await f.save({experience:"advanced",weeklyHours:5});const setup=JSON.parse(f.audits.find(row=>row.action==="profile.setup").after);
  assert.deepEqual(setup.profileAnswers,{experience:true,weeklyHours:true});assert.equal(setup.adultConfirmed,false);assert.equal(setup.profileConfirmed,false);assert.equal(setup.restrictions,"unknown");
});
test("a stale profile revision fails before any answer markers are merged or audited",async()=>{
  const f=fixture();await assert.rejects(f.save({experience:"advanced"},"stale"),/profile changed/);assert.equal(f.reads(),0);assert.equal(f.audits.length,0);
});
