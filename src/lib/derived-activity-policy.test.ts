import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { derivedActivityPolicy, isDerivedActivityEligible } from "./derived-activity-policy";
import { computeJMetrics, workoutJStress, type JStressWorkout } from "./j-metrics";
import { activityFingerprint, type ActivityDecision } from "./activity-evidence";

const require = createRequire(import.meta.url);
const at=new Date("2026-10-21T12:00Z");
const session=(extra:Partial<JStressWorkout>={}):JStressWorkout=>({id:"allowed",userId:"owner",date:at,source:"garmin",externalId:"garmin:1",sport:"bike",planned:false,completed:true,durationMin:45,actualDurationMin:45,rpe:4,distanceKm:20,...extra});

test("derived analytics use the existing positive origin whitelist and never mutate or filter away restricted work",()=>{
  for(const row of [{source:"manual"},{source:"garmin"},{source:"intervals",notes:"Original source: GARMIN_CONNECT."}]) {
    assert.equal(isDerivedActivityEligible(row),true);assert.equal(derivedActivityPolicy([row]).status,"allowed");
  }
  const rows=[{source:"garmin"},{source:"strava"},{source:"intervals"},{},{source:"garmin",externalId:"strava:legacy"},{source:"intervals",notes:"Original source: STRAVA."}],before=JSON.stringify(rows);
  const policy=derivedActivityPolicy(rows);assert.equal(policy.status,"insufficient");assert.deepEqual(policy.restrictedRecords,{strava:3,unknown:2});assert.match(policy.reason!,/understate training/);assert.equal(JSON.stringify(rows),before);
});

test("restricted and unknown individual JStress stays unavailable even with complete duration and effort",()=>{
  for(const extra of [{source:"strava"},{source:undefined},{source:""},{source:"intervals"},{source:"garmin",notes:"Original source: STRAVA."},{source:"garmin",externalId:"strava:legacy"}]) {
    const result=workoutJStress(session(extra));assert.equal(result.value,null);assert.equal(result.source,"unavailable");assert.match(result.reason!,/origin/);
  }
  assert.equal(workoutJStress(session()).value,180);assert.equal(workoutJStress(session({rpe:0})).value,0);
});

test("restricted group members contaminate totals and trends before an allowed primary or explicit decision is selected",()=>{
  const rows=[session(),session({id:"restricted",source:"strava",externalId:"strava:1"})],before=JSON.stringify(rows);
  const decision:ActivityDecision={version:1,userId:"owner",kind:"same_session",primaryId:"allowed",members:rows.map(row=>({id:row.id!,fingerprint:activityFingerprint(row)}))};
  for(const decisions of [[],[decision]]) {
    const result=computeJMetrics(rows,at,"UTC",["2026-10-20"],2,decisions);
    assert.equal(result.totalJStress,null);assert.equal(result.eligibleSessions,0);assert.equal(result.coveragePct,0);assert.equal(result.derivedActivityPolicy?.status,"insufficient");
    assert.ok(result.series.every(point=>point.jStress===null&&point.jBase===null&&point.jRecent===null&&point.jBalance===null));assert.deepEqual(result.current,{jBase:null,jRecent:null,jBalance:null});
  }
  assert.equal(JSON.stringify(rows),before);
});

test("linked restricted rows still block aggregate analytics while future, old and unperformed rows do not contaminate this window",()=>{
  const linked=computeJMetrics([session(),session({id:"linked",source:"strava",matchedPlanId:"allowed"})],at,"UTC",[],1);
  assert.equal(linked.totalJStress,null);assert.equal(linked.derivedActivityPolicy?.restrictedRecords.strava,1);
  const result=computeJMetrics([session(),session({source:"strava",date:new Date("2026-10-22T12:00Z")}),session({source:"strava",date:new Date("2026-10-19T12:00Z")}),session({source:"strava",completed:false})],at,"UTC",[],1);
  assert.equal(result.totalJStress,180);assert.equal(result.derivedActivityPolicy?.status,"allowed");
});

function fitnessFixture(rows:any[],authenticated=true) {
  const queries:any[]=[];
  const matches=(row:any,where:any):boolean=>Object.entries(where).every(([key,value]:any)=>{
    if(key==="OR")return value.some((part:any)=>matches(row,part));
    if(value&&typeof value==="object"&&!(value instanceof Date)) {
      if("in" in value)return value.in.includes(row[key]);
      if("gte" in value||"lte" in value)return (value.gte===undefined||row[key]>=value.gte)&&(value.lte===undefined||row[key]<=value.lte);
    }
    return value===null?row[key]==null:row[key]===value;
  });
  const db={athleteProfile:{findUnique:async(q:any)=>{assert.equal(q.where.userId,"owner");return {ftp:200,lthr:160};}},
    workout:{findMany:async(q:any)=>{queries.push(q);return rows.filter(row=>matches(row,q.where));}},metricObservation:{findMany:async(q:any)=>{assert.equal(q.where.userId,"owner");return [];}}};
  const deps:Record<string,unknown>={"next/server":{NextResponse:Response},"@/lib/db":{prisma:db},"@/lib/auth":{getCurrentUser:async()=>authenticated?{id:"owner",timezone:"UTC"}:null},"@/lib/activity-reconciliation":{readActivityDecisions:async(id:string)=>{assert.equal(id,"owner");return [];}}};
  const mod={exports:{} as any},source=ts.transpileModule(fs.readFileSync("src/app/api/fitness/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:mod,exports:mod.exports,require:(id:string)=>id in deps?deps[id]:id.startsWith("@/lib/")?require(path.resolve("src/lib",id.slice(6)+".ts")):require(id),Response,Date});
  return {run:()=>mod.exports.GET(),queries};
}
const routeRows=()=>[session({date:new Date(Date.now()-3600000)}),session({id:"plan",date:new Date(Date.now()-3600000),source:"plan",externalId:null,planned:true,completed:false})];

test("fitness route makes mixed-source PMC, JMetrics and execution unavailable without rewriting athlete history",async()=>{
  for(const origin of [{source:"strava"},{source:"intervals",notes:"Original source: STRAVA."},{source:"intervals"},{source:undefined},{source:"garmin",notes:"Original source: STRAVA.",matchedPlanId:"allowed"}]) {
    const rows=[...routeRows(),session({id:"restricted",date:new Date(Date.now()-3600000),externalId:null,...origin})],before=JSON.stringify(rows);
    const fixture=fitnessFixture(rows),response=await fixture.run();assert.equal(response.status,200);const result=await response.json();
    assert.equal(result.pmc,null);assert.match(result.pmcUnavailableReason,/origin/);assert.equal(result.jMetrics.totalJStress,null);assert.equal(result.execution,null);assert.match(result.executionUnavailableReason,/origin/);
    assert.equal(result.derivedActivityPolicy.load.status,"insufficient");assert.equal(result.derivedActivityPolicy.execution.status,"insufficient");assert.equal(JSON.stringify(rows),before);
    assert.ok(fixture.queries.every(q=>q.where.userId==="owner"));assert.equal(fixture.queries[0].where.matchedPlanId,undefined,"policy must see linked raw contributors before analytics selection");
  }
});

test("fitness route keeps known allowed behavior and owner boundaries; unauthenticated callers receive no records",async()=>{
  const response=await fitnessFixture([...routeRows(),session({userId:"foreign",source:"strava",date:new Date(Date.now()-3600000)})]).run();const result=await response.json();
  assert.equal(response.status,200);assert.equal(result.jMetrics.totalJStress,180);assert.notEqual(result.pmc,null);assert.notEqual(result.execution,null);assert.equal(result.derivedActivityPolicy.load.status,"allowed");
  const unauthorized=fitnessFixture(routeRows(),false);assert.equal((await unauthorized.run()).status,401);assert.equal(unauthorized.queries.length,0);
});
