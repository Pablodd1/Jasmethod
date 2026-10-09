import { parseNutritionContext } from "./nutrition-context";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { ONBOARDING_METRICS, onboardingObservations } from "./onboarding-imports";
const require = createRequire(import.meta.url), ts = require("typescript");
function load(path:string,deps:Record<string,unknown>) {
  const exports:any={};
  vm.runInNewContext(ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(key:string)=>{if(!(key in deps))throw Error(`Unmocked dependency ${key}`);return deps[key]},Response,Request,URL,Date});
  return exports;
}
function fixture() {
  const state={authenticated:true,weight:75 as unknown,athleteId:123,connected:true,stored:false,fetches:0,created:[] as any[],queries:[] as any[]};
  const metrics={findFirst:async(q:any)=>{state.queries.push(q);return state.stored?{id:"row"}:null},create:async(q:any)=>{state.created.push(q);state.stored=true;return{id:"row"}}};
  const db:any={metricObservation:metrics,connector:{findFirst:async(q:any)=>{state.queries.push(q);return state.connected?{id:"connector"}:null}},$executeRaw:async()=>{}};
  db.$transaction=async(fn:any)=>fn(db);
  const helper=load("src/lib/profile-import-review.ts",{"./db":{prisma:db},"./provider-fetch":{providerFetch:async()=>{state.fetches++;return Response.json({id:state.athleteId,weight:state.weight,firstname:"Private",sex:"F",access_token:"must-not-store"})}}});
  return{state,helper,db};
}
test("Strava profile import stores only bound reported weight and never writes canonical identity/profile",async()=>{
  const{state,helper}=fixture();
  await helper.importStravaProfileWeight("user-a","connector","123","fixture-token");
  assert.equal(state.created.length,1);const row=state.created[0].data;
  assert.equal(row.userId,"user-a");assert.equal(row.value,75);assert.equal(row.measurementMethod,"provider_profile_reported");
  assert.equal(row.source,"strava");assert.ok(!JSON.stringify(row).includes("Private"));assert.ok(!JSON.stringify(row).includes("must-not-store"));
  await helper.importStravaProfileWeight("user-a","connector","123","fixture-token");assert.equal(state.fetches,1);
  assert.ok(state.queries.every(q=>q.where.userId==="user-a"));
});
test("Strava omitted or invalid weight is missing; wrong athlete and disconnected binding never persist",async()=>{
  for(const weight of [null,undefined,"75",0,NaN,500]){const{state,helper}=fixture();state.weight=weight;await helper.importStravaProfileWeight("u","c","123","t");assert.equal(state.created.length,0)}
  const wrong=fixture();await assert.rejects(()=>wrong.helper.importStravaProfileWeight("u","c","999","t"),/binding mismatch/);assert.equal(wrong.state.created.length,0);
  const disconnected=fixture();disconnected.state.connected=false;await assert.rejects(()=>disconnected.helper.importStravaProfileWeight("u","c","123","t"),/connection changed/);assert.equal(disconnected.state.created.length,0);
});
test("import review preserves old observations, returns scoped history and no secrets, blocks anonymous users",async()=>{
  const{state,helper,db}=fixture();const date=new Date();
  const row={id:"weight",metricType:"weight_kg",value:75,unit:"kg",source:"strava",observedAt:date,qualityFlag:"ok",measurementMethod:"provider_profile_reported"};
  db.metricObservation.findMany=async(q:any)=>{state.queries.push(q);return[row]};
  db.connector.findMany=async(q:any)=>{state.queries.push(q);return[{provider:"strava",status:"connected",lastSyncAt:date,lastSyncCount:1}]};
  db.workout={aggregate:async(q:any)=>{state.queries.push(q);return{_count:{_all:1},_min:{date},_max:{date}}},groupBy:async(q:any)=>{state.queries.push(q);return[{sport:"run",_count:{_all:1}}]}};
  const api=load("src/app/api/onboard/import-review/route.ts",{"@/lib/auth":{getCurrentUser:async()=>state.authenticated?{id:"user-a"}:null},"@/lib/db":{prisma:db},"@/lib/onboarding-imports":{ONBOARDING_METRICS,onboardingObservations},"@/lib/profile-import-review":helper});
  const response=await api.GET(),body=await response.json();assert.equal(response.status,200);assert.equal(body.observations.length,1);assert.equal(body.suggestions[0].kind,"reported");assert.equal(body.history.count,1);assert.equal(body.history.sports[0].sport,"run");assert.equal(state.fetches,0);assert.ok(state.queries.every(q=>q.where.userId==="user-a"));assert.match(response.headers.get("cache-control"),/no-store/);
  state.authenticated=false;const before=state.queries.length;assert.equal((await api.GET()).status,401);assert.equal(state.queries.length,before);
});
test("weight suggestions omit stale, disconnected and suspect values without guessing measurements",()=>{
  const{helper}=fixture(),now=new Date();const row={id:"weight",value:75,unit:"kg",source:"strava",observedAt:now,qualityFlag:"ok",measurementMethod:"provider_profile_reported"};
  assert.equal(helper.importedWeightSuggestions([row],[],now).length,0);
  assert.equal(helper.importedWeightSuggestions([{...row,qualityFlag:"suspect"}],["strava"],now).length,0);
  assert.equal(helper.importedWeightSuggestions([{...row,observedAt:new Date(now.getTime()-31*86400000)}],["strava"],now).length,0);
  assert.equal(helper.importedWeightSuggestions([row],["strava"],now)[0].requiresConfirmation,true);
});

function adoptionFixture(weightSource="manual") {
  const {helper}=fixture();
  class ApiError extends Error { constructor(message:string, public status=400){super(message)} }
  const patch=load("src/lib/profile-update.ts",{"./nutrition-context":{parseNutritionContext},"./access":{ApiError},"./dates":{parseDate:()=>{throw Error("unexpected date edit")}}});
  const state={source:"strava",method:"provider_profile_reported",connected:true,quality:"ok",observedAt:new Date(),writes:[] as any[],audits:[] as any[]};
  const before={id:"profile",userId:"owner",weightKg:70,weightSource};
  const tx={
    athleteProfile:{findUnique:async()=>before,upsert:async(q:any)=>{state.writes.push(q);return{...before,...q.update}}},
    metricObservation:{findFirst:async(q:any)=>{assert.equal(q.where.userId,"owner");return q.where.id==="own-weight"?{id:"own-weight",value:75,unit:"kg",source:state.source,observedAt:state.observedAt,qualityFlag:state.quality,measurementMethod:state.method}:null}},
    connector:{findFirst:async(q:any)=>{assert.equal(q.where.userId,"owner");return state.connected?{provider:state.source}:null}},
    auditLog:{create:async(q:any)=>{state.audits.push(q);return q}},
  };
  const api=load("src/lib/profile-service.ts",{"./planning-setup":{},"./travel-context":{},"./planning-setup-store":{},"node:crypto":{createHash},"./db":{prisma:{$transaction:async(fn:any)=>fn(tx)}},"./access":{ApiError},"./profile-update":patch,"./profile-import-review":helper});
  const body={expectedRevision:api.profileRevision(before),weightKg:75,reviewedWeightObservationId:"own-weight"};
  return{api,state,body};
}
test("reviewed weight adoption preserves provider source; independent manual edits stay manual",async()=>{
  const f=adoptionFixture();const saved=await f.api.saveProfile("owner",{id:"owner",timezone:"UTC"},f.body);
  assert.equal(saved.weightSource,"strava");assert.equal(saved.weightKg,75);assert.equal(f.state.audits.length,1);
  const manual=adoptionFixture();const value=await manual.api.saveProfile("owner",{id:"owner",timezone:"UTC"},{expectedRevision:manual.body.expectedRevision,weightKg:72});assert.equal(value.weightSource,"manual");
});
test("foreign, stale, invalid, mismatched or spoofed weight adoption produces no profile writes",async()=>{
  for(const kind of ["foreign","stale","quality","disconnected","source","mismatch","spoof","coach"]){
    const f=adoptionFixture(),body:any={...f.body};
    if(kind==="foreign")body.reviewedWeightObservationId="another-user-weight";
    if(kind==="stale")f.state.observedAt=new Date(Date.now()-31*86400000);
    if(kind==="quality")f.state.quality="suspect";
    if(kind==="disconnected")f.state.connected=false;
    if(kind==="source")f.state.source="untrusted";
    if(kind==="mismatch")body.weightKg=74;
    if(kind==="spoof")body.weightSource="manual";
    await assert.rejects(()=>f.api.saveProfile(kind==="coach"?"coach":"owner",{id:"owner",timezone:"UTC"},body));
    assert.equal(f.state.writes.length,0,kind);assert.equal(f.state.audits.length,0,kind);
  }
});

test("saving an unchanged weight preserves its existing provider provenance",async()=>{
 const f=adoptionFixture("strava");const saved=await f.api.saveProfile("owner",{id:"owner",timezone:"UTC"},{expectedRevision:f.body.expectedRevision,weightKg:70,sex:"female"});assert.equal(saved.weightSource,"strava");
});


test("uploaded Apple weight can be reviewed without pretending a device is connected",()=>{
  const {helper}=fixture(),now=new Date();
  const row={id:"file-weight",value:72,unit:"kg",source:"apple_health",observedAt:now,qualityFlag:"ok",measurementMethod:"uploaded_file"};
  assert.equal(helper.importedWeightSuggestions([row],[],now)[0].kind,"uploaded_file");
  assert.equal(helper.importedWeightSuggestions([{...row,source:"strava"}],[],now).length,0);
  assert.equal(helper.importedWeightSuggestions([{...row,measurementMethod:"optical_sensor"}],[],now).length,0);
  assert.equal(helper.importedWeightSuggestions([{...row,observedAt:new Date(now.getTime()+1000)}],[],now).length,0);
});

test("adopting uploaded Apple weight keeps file source and rejects foreign record IDs", async()=>{
  const f=adoptionFixture();f.state.source="apple_health";f.state.method="uploaded_file";f.state.connected=false;
  const saved=await f.api.saveProfile("owner",{id:"owner",timezone:"UTC"},f.body);
  assert.equal(saved.weightSource,"apple_health");assert.equal(saved.weightKg,75);
  const foreign=adoptionFixture();foreign.state.source="apple_health";foreign.state.method="uploaded_file";foreign.state.connected=false;
  await assert.rejects(()=>foreign.api.saveProfile("owner",{id:"owner",timezone:"UTC"},{...foreign.body,reviewedWeightObservationId:"other-athlete-weight"}));
  assert.equal(foreign.state.writes.length,0);
});
