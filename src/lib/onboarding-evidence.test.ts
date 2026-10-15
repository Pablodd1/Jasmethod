import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { appendManualPersonalBest, missingOnboardingAnchors, observationKind, onboardingRaceResults, readManualPersonalBests } from "./onboarding-evidence";
import { onboardingSectionPayload } from "./onboarding-save";
import { EMPTY_PROFILE, EMPTY_SETUP, EMPTY_RACE, restoreOnboardingDraft } from "./onboarding-form";
import { profilePatch } from "./profile-update";
import * as importedTraining from "./imported-training-review";
import { localDate } from "./dates";

const today = "2026-10-12";
test("only unknown thresholds are collected; manually saved anchors survive new imports", () => {
  const profile = {ftp:245,lthr:165,runPaceBase:270};
  assert.deepEqual(missingOnboardingAnchors(profile).map(row=>row.field),["maxHr","swimPaceBase"]);
  const payload = onboardingSectionPayload("essentials",{...profile,maxHr:"187",swimPaceBase:"",manualPrs:""},{},{profile,setup:null},null);
  assert.deepEqual(payload,{maxHr:"187"});
  assert.deepEqual(onboardingSectionPayload("essentials",{...EMPTY_PROFILE,...profile},{},{profile,setup:null},null),{});
});

test("known sport asks only applicable optional references; triathlon and unknown goals retain all", () => {
  assert.deepEqual(missingOnboardingAnchors({goal:"swim-only"}).map(r=>r.field),["lthr","maxHr","swimPaceBase"]);
  assert.deepEqual(missingOnboardingAnchors({goal:"cycle"}).map(r=>r.field),["lthr","maxHr","ftp"]);
  for (const goal of ["run-only","hyrox","track-sprint","10k"]) assert.deepEqual(missingOnboardingAnchors({goal}).map(r=>r.field),["lthr","maxHr","runPaceBase"]);
  for (const goal of [undefined,"olympic","sprint","half","full"]) assert.equal(missingOnboardingAnchors({goal}).length,5);
  assert.deepEqual(missingOnboardingAnchors({goal:"swim-only",swimPaceBase:102,maxHr:180}).map(r=>r.field),["lthr"]);
});

test("manual PB saves preserve previous entries and do not invent dates or transform PBs into thresholds", () => {
  const original = [{label:"100 m",value:13.4,unit:"sec",date:"2025-07-11"}];
  const result = appendManualPersonalBest(JSON.stringify(original),{label:"5K race",value:"24.5",unit:"min",date:""},today);
  assert.deepEqual(readManualPersonalBests(result),[...original,{label:"5K race",value:24.5,unit:"min",date:""}]);
  assert.deepEqual(profilePatch({manualPrs:result},"UTC"),{manualPrs:result});
  const payload = onboardingSectionPayload("essentials",{...EMPTY_PROFILE,manualPrs:result},{},{profile:{manualPrs:JSON.stringify(original),weightKg:71},setup:null},null);
  assert.deepEqual(payload,{manualPrs:result});
});

test("bad saved PBs cannot become an empty replacement and repeated results are rejected", () => {
  const input = {label:"5K race",value:"24.5",unit:"min",date:""};
  for (const raw of ["{",'{}','[{"label":"broken"}]']) {
    assert.equal(readManualPersonalBests(raw),null);
    assert.throws(()=>appendManualPersonalBest(raw,input,today),/could not be verified/);
    assert.throws(()=>profilePatch({manualPrs:raw},"UTC"),/Invalid personal bests/);
  }
  const first = appendManualPersonalBest(null,input,today);
  assert.throws(()=>appendManualPersonalBest(first,{...input,label:" 5k RACE "},today),/already saved/);
  for (const patch of [{value:""},{value:"-1"},{unit:""},{date:"2026-02-30"},{date:"2027-01-01"}]) assert.throws(()=>appendManualPersonalBest(null,{...input,...patch},today));
});

test("import acknowledgment never labels reported, file or derived values as measured", () => {
  assert.equal(observationKind("strava","provider_profile_reported"),"reported");
  assert.equal(observationKind("apple_health","uploaded_file"),"imported");
  assert.equal(observationKind("garmin","derived"),"estimated");
  assert.equal(observationKind("manual","manual_entry"),"manual");
  assert.equal(observationKind("garmin","chest_strap"),"measured");
  assert.equal(observationKind("oura","device_sync"),"imported");
});

test("actual race results keep provenance; targets, future results and missing results cannot masquerade as PBs", () => {
  const base = {id:"r",name:"5K",distance:"5k",resultMin:24,date:new Date("2026-10-10"),source:"athlinks"};
  const results = onboardingRaceResults([base,{...base,id:"manual",source:"manual"},{...base,id:"unknown",source:null},{...base,id:"target",resultMin:null},{...base,id:"zero",resultMin:0},{...base,id:"future",date:new Date("2027-01-01")}],new Date(today));
  assert.deepEqual(results.map(row=>row.kind),["imported","manual","unverified"]);
  assert.equal(results[0].minutes,24);
  assert.equal("threshold" in results[0],false);
});

test("PB entry drafts survive interruption and old drafts remain readable", () => {
  const personalBest = {label:"100 m",value:"13.1",unit:"sec",date:""};
  const draft = {version:1,userId:"u",revision:"r",setupRevision:null,profile:{...EMPTY_PROFILE},setup:{...EMPTY_SETUP},race:{...EMPTY_RACE},raceId:null,reviewedWeightId:null,step:2,personalBest};
  assert.deepEqual(restoreOnboardingDraft(JSON.stringify(draft),"u","r",null)?.personalBest,personalBest);
  const {manualPrs: _ignored,...oldProfile} = draft.profile;
  assert.equal(restoreOnboardingDraft(JSON.stringify({...draft,profile:oldProfile,personalBest:undefined}),"u","r",null,null)?.profile.manualPrs,"");
  assert.equal(restoreOnboardingDraft(JSON.stringify({...draft,profile:oldProfile}),"u","r",null),null);
  const savedPBs=JSON.stringify([{label:"Older 100 m",value:13.7,unit:"sec",date:"2025-07-01"}]);
  const restored=restoreOnboardingDraft(JSON.stringify({...draft,profile:{...oldProfile,weightKg:"62"},personalBest:undefined}),"u","r",null,{manualPrs:savedPBs});
  assert.equal(restored?.profile.manualPrs,savedPBs);assert.equal(restored?.profile.weightKg,"62");
  assert.equal(restoreOnboardingDraft(JSON.stringify({...draft,profile:{...draft.profile,manualPrs:null}}),"u","r",null,{manualPrs:savedPBs}),null);
  assert.equal(restoreOnboardingDraft(JSON.stringify(draft),"different-user","r",null),null);
});

test("import review is authenticated, athlete-scoped and backed by real stored records", async () => {
  let authenticated = true;
  const calls: {table:string;args:any}[] = [];
  const row = {id:"race-result",name:"Recorded 5K",distance:"5k",resultMin:23.5,date:new Date("2025-10-10"),source:"athlinks"};
  const prisma = Object.fromEntries(["metricObservation","connector","workout","race"].map(table=>[table,Object.fromEntries(["findMany","aggregate","groupBy"].map(method=>[method,async(args:any)=>{
    calls.push({table,args});
    assert.equal(args.where.userId,"owner");
    if (method === "aggregate") return {_count:{_all:7},_min:{date:new Date("2025-01-01")},_max:{date:new Date("2026-09-01")}};
    if (table === "race") return [row];
    return [];
  }]))]));
  const js = ts.transpileModule(readFileSync("src/app/api/onboard/import-review/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded = {exports:{} as {GET:()=>Promise<Response>}};
  runInNewContext(js,{module:loaded,exports:loaded.exports,Date,Response,require:(name:string)=>{
    if (name === "@/lib/auth") return {getCurrentUser:async()=>authenticated?{id:"owner"}:null};
    if (name === "@/lib/db") return {prisma};
    if (name === "@/lib/onboarding-imports") return {ONBOARDING_METRICS:[],onboardingObservations:()=>[]};
    if (name === "@/lib/onboarding-evidence") return {onboardingRaceResults};
    if (name === "@/lib/profile-import-review") return {importedWeightSuggestions:()=>[]};
    if (name === "@/lib/imported-training-review") return importedTraining;
    if (name === "@/lib/dates") return {localDate};
    throw Error(name);
  }});
  const response = await loaded.exports.GET();
  const data = await response.json();
  assert.equal(data.history.count,7);
  assert.equal(data.trainingReview.weeks.length,4);
  assert.equal(data.trainingReview.recordedWeeklyAverageMinutes,null);
  const trainingCall=calls.find(call=>call.table === "workout" && call.args.take === 2001);
  assert.ok(trainingCall);
  assert.equal(trainingCall.args.where.planned,false);
  assert.equal(trainingCall.args.select.source,true);
  assert.ok(trainingCall.args.where.date.gte instanceof Date);
  assert.equal(data.raceResults[0].minutes,23.5);
  assert.equal(response.headers.get("Cache-Control"),"private, no-store");
  const callCount = calls.length;
  authenticated = false;
  assert.equal((await loaded.exports.GET()).status,401);
  assert.equal(calls.length,callCount);
});

test("first step offers import or skip, callback reviews actual data, and all profile details remain editable", () => {
  const source = readFileSync("src/components/detailed-athlete-setup.tsx","utf8");
  assert.match(source,/useState<OnboardingStep>\(ONBOARDING_STEP.devices\)/);
  assert.match(source,/Skip connections and continue manually/);
  assert.match(source,/\/onboard\?redo=1&step=profile/);
  assert.match(source,/missingOnboardingAnchors\(\{\.\.\.savedOnboarding.current.profile,goal:profile.goal\}\)/);
  assert.match(source,/if \(!Object.keys\(fields\).length\) return true/);
  assert.match(source,/Edit everything later in Profile & Zones/);
  assert.match(source,/href="\/settings"/);
  assert.doesNotMatch(source,/Measured maximum heart rate/);
  assert.match(source,/result.ok !== true/);
});
