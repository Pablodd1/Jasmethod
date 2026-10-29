import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import * as dates from "./dates";
import * as evidence from "./activity-evidence";
const require=createRequire(import.meta.url),ts=require("typescript");
async function digest(rows:any[],decisions:evidence.ActivityDecision[]=[]){
 let context:any;const scoped=async(q:any)=>{assert.equal(q.where.userId,"owner");return[]};
 const prisma={athleteProfile:{findUnique:scoped},dailyMetrics:{findMany:scoped},trainingPlan:{findMany:scoped},bloodResult:{findMany:async()=>[]},geneticVariant:{findMany:async()=>[]},dailyCheckin:{findMany:scoped},benchmarkTest:{findMany:scoped},workout:{findMany:async(q:any)=>{assert.equal(q.where.userId,"owner");return q.where.planned?[]:rows}}};
 const deps:Record<string,unknown>={"next/server":{NextResponse:Response},"@/lib/db":{prisma},"@/lib/auth":{getCurrentUser:async()=>({id:"owner",name:"Synthetic",timezone:"UTC",language:"en"})},"@/lib/effective-prescription":{effectivePrescription:async()=>null},"@/lib/coach-readiness":{currentHrvReadiness:()=>null},"@/lib/dates":dates,"@/lib/adaptive":{},"@/lib/prescription":{},"@/lib/activity-evidence":evidence,"@/lib/activity-reconciliation":{readActivityDecisions:async(id:string)=>{assert.equal(id,"owner");return decisions}},"@/lib/coach":{getCoachBriefing:(_id:string,c:any)=>{context=c;return{mode:"fallback"}}}};
 const exports:any={};vm.runInNewContext(ts.transpileModule(readFileSync("src/app/api/coach/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:(key:string)=>{assert.ok(key in deps,key);return deps[key]},Date});
 await exports.GET();return context;
}
test("legacy local coach digest reconciles copies and preserves restricted-source AI boundary",async()=>{
 const row=(id:string,source:string,extra={})=>({id,userId:"owner",date:new Date(Date.now()-3600000),sport:"bike",source,planned:false,completed:true,durationMin:60,actualDurationMin:60,distanceKm:30,rpe:4,...extra});
 const a=row("a","garmin"),b=row("b","intervals"),strava=row("s","strava");
 const grouped=await digest([a,b,strava]);assert.match(grouped.historyDigest,/1 sessions\/1h/);assert.match(grouped.historyDigest,/1 direct Strava activity rows omitted/);assert.equal(grouped.externalAiEligible,false);
 const ambiguous=[a,row("c","whoop",{distanceKm:null,actualDurationMin:20,durationMin:20})];const unknown=await digest(ambiguous);assert.match(unknown.historyDigest,/totals remain unknown/);assert.doesNotMatch(unknown.historyDigest,/Completed training by week/);
 const choice:evidence.ActivityDecision={version:1,userId:"owner",kind:"same_session",primaryId:"c",members:ambiguous.map(r=>({id:r.id,fingerprint:evidence.activityFingerprint(r)}))};
 const reviewed=await digest(ambiguous,[choice]);assert.doesNotMatch(reviewed.historyDigest,/totals remain unknown/);assert.match(reviewed.historyDigest,/1 sessions\/0\.3h/);assert.equal(reviewed.externalAiEligible,false);
});
