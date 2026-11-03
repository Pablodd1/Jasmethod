import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as policy from "./derived-activity-policy";
import * as coverage from "./athlete-history-coverage";

function fixture(origin: string, signedIn=true) {
  let reads=0, input:any;
  const history=[{source:origin,notes:"PRIVATE_HISTORY_CANARY",date:new Date(),sport:"bike",completed:true}];
  const metrics=[{source:origin,notes:"PRIVATE_METRIC_CANARY",date:new Date(),hrv:80}];
  const find=(data:any)=>async(query:any)=>{reads++;assert.equal(query.where.userId,"synthetic-owner");return data;};
  const output:any={exports:{}};
  const deps:Record<string,unknown>={
    "next/server":{NextResponse:Response},
    "@/lib/db":{prisma:{athleteProfile:{findUnique:find({experience:"advanced"})},workout:{findMany:find(history)},dailyMetrics:{findMany:find(metrics)}}},
    "@/lib/auth":{getCurrentUser:async()=>signedIn?{id:"synthetic-owner",language:"en"}:null},
    "@/lib/derived-activity-policy":policy,
    "@/lib/athlete-history-coverage":coverage,
    "@/lib/athlete-model":{buildAthleteModel:(value:any)=>{input=value;return {coverageDays:value.history.length?30:0,coldStart:!value.history.length};}},
  };
  const source=ts.transpileModule(readFileSync("src/app/api/athlete-model/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:output,exports:output.exports,require:(name:string)=>{if(!(name in deps))throw Error(`Unexpected dependency ${name}`);return deps[name];},Date,Response});
  return {run:()=>output.exports.GET(),reads:()=>reads,input:()=>input};
}

test("athlete-model route withholds restricted rows and distinguishes unknown coverage from zero",async()=>{
  for(const origin of ["strava","unknown-import"]){
    const f=fixture(origin), response=await f.run(), data=await response.json();
    assert.equal(response.status,200);
    assert.equal(f.input().history.length,0);
    assert.equal(f.input().metrics.length,0);
    assert.equal(data.model.coverageDays,0,"existing conservative model fields remain unchanged");
    assert.deepEqual(data.historyCoverage,{status:"withheld",days:null});
    assert.equal(data.provenance.activity,"insufficient");
    assert.doesNotMatch(JSON.stringify(data),/PRIVATE_HISTORY_CANARY|PRIVATE_METRIC_CANARY/);
    assert.equal(response.headers.get("cache-control"),"private, no-store");
  }
});

test("eligible route history stays local and preserves observed coverage; anonymous reads never query data",async()=>{
  const allowed=fixture("manual"), response=await allowed.run(), data=await response.json();
  assert.equal(allowed.input().history.length,1);
  assert.deepEqual(data.historyCoverage,{status:"available",days:30});
  const anonymous=fixture("manual",false);
  assert.equal((await anonymous.run()).status,401);
  assert.equal(anonymous.reads(),0);
});
