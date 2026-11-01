import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import { readSavedCycleAudit } from "./saved-cycle-audit";

const require = createRequire(import.meta.url);

test("absent legacy cycle metadata stays distinct from corrupt audit data", () => {
  for (const after of [null, undefined, "{}", '{"cycle":null}']) assert.deepEqual(readSavedCycleAudit(after), {cycle:null,cycleSummaryNeedsReview:false});
  for (const after of ["", "broken private audit", "null", "[]", '"private text"', '{"cycle":[]}', '{"cycle":"private text"}']) {
    assert.deepEqual(readSavedCycleAudit(after), {cycle:null,cycleSummaryNeedsReview:true});
  }
  const cycle={baseline:{weeklyMinutes:120},activity:{reportedSessions:0}};
  assert.deepEqual(readSavedCycleAudit(JSON.stringify({cycle})), {cycle,cycleSummaryNeedsReview:false});
});

test("plan GET preserves athlete-owned sessions when audit JSON is corrupt and returns only a review flag", async () => {
  const queries: any[]=[];
  const workout={id:"saved-session",title:"Saved session",sport:"run",durationMin:30};
  const plan={id:"saved-plan",name:"Saved cycle",startDate:new Date("2099-01-01"),weeks:4,days:[{id:"saved-day",date:new Date("2099-01-01"),sessions:[workout]}]};
  const deps: Record<string, any>={
    "next/server":{NextResponse:Response},
    "@/lib/access":{trainingAccess:async()=>({athlete:{id:"owner",timezone:"UTC"}})},
    "@/lib/db":{prisma:{trainingPlan:{findMany:async(query:any)=>{queries.push(query);return [plan];}},auditLog:{findFirst:async(query:any)=>{queries.push(query);return {after:"private malformed audit"};}}}},
    "@/lib/training-cycle":{savedCycleSummary:()=>null},
    "@/lib/workout-update":{workoutRevision:()=>"current-revision"},
    "@/lib/adaptive":{progressionAdvice:()=>null},
    "@/lib/auth":{},
  };
  const mod={exports:{} as any};
  const source=ts.transpileModule(fs.readFileSync("src/app/api/plan/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:mod,exports:mod.exports,require:(id:string)=>id in deps?deps[id]:id.startsWith("@/lib/")?require(path.resolve("src/lib",id.slice(6)+".ts")):require(id),Response,Request,URL,Date,console});
  const response=await mod.exports.GET(new Request("https://example.invalid/api/plan"));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.cycleSummaryNeedsReview,true);assert.equal(data.cycle,null);
  assert.equal(data.plans[0].days[0].sessions[0].id,workout.id);assert.equal(data.plans[0].days[0].sessions[0].revision,"current-revision");
  assert.equal(queries[0].where.userId,"owner");assert.equal(queries[1].where.subjectId,"owner");assert.equal(queries[1].where.entityId,plan.id);
  assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.doesNotMatch(JSON.stringify(data),/private malformed audit/);
});
