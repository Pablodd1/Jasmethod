import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { scheduleTests } from "./adaptive";
import { initialAssessmentEvidence } from "./baseline-test-options";

test("legacy scheduling endpoint rejects every plan sport without any database writes",async()=>{
  let accesses=0;
  class ApiError extends Error {constructor(message:string,public status=400){super(message)}}
  const fail=()=>{accesses++;throw Error("Scheduling must not query or modify athlete data")};
  const deps:Record<string,unknown>={
    "@/lib/profile-service":{profileRevision:fail},
    "@/lib/db":{prisma:new Proxy({}, {get:fail})},
    "@/lib/access":{ApiError,trainingAccess:async()=>({actor:{id:"owner"},athlete:{id:"owner"}}),errorResponse:(e:any)=>Response.json({error:e.message},{status:e.status??500})},
    "@/lib/benchmark-result":{benchmarkResult:fail},"@/lib/dates":{parseDate:fail},
    "@/lib/units":{unitsOf:fail},
    "@/lib/baseline-test-options":{initialAssessmentEvidence},
  };
  const output:any={exports:{}};
  const source=ts.transpileModule(fs.readFileSync("src/app/api/benchmarks/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:output,exports:output.exports,Response,require:(name:string)=>{if(name in deps)return deps[name];throw Error(`Unexpected import ${name}`)}});
  const response=await output.exports.POST(new Request("https://example.test/api/benchmarks",{method:"POST",body:JSON.stringify({action:"schedule"})}));
  assert.equal(response.status,422);assert.match((await response.json()).error,/No tests were added or removed/);assert.equal(accesses,0);
});
test("legacy scheduler never emits maximal testing even when passed old sport flags",()=>{
  for(const opts of [{},{hyrox:true},{boxing:true},{trackSprint:true}]) assert.deepEqual(scheduleTests(new Date("2026-01-01T12:00Z"),30,[],opts),[]);
});

test("assessment history includes reported performed sessions with unknown minutes and stays athlete scoped",async()=>{
  const deps:Record<string,unknown>={
    "@/lib/profile-service":{profileRevision:()=>"revision"},
    "@/lib/db":{prisma:{
      athleteProfile:{findUnique:async({where}:any)=>{assert.equal(where.userId,"athlete");return {goal:"half",manualPrs:null};}},
      benchmarkTest:{findMany:async({where}:any)=>{assert.equal(where.userId,"athlete");return [];}},
      workout:{count:async({where}:any)=>{
        assert.equal(where.userId,"athlete");
        const clauses=JSON.parse(JSON.stringify(where.OR));
        for(const status of ["completed","partial","substituted"]) assert.ok(clauses.some((c:any)=>c.feedbackStatus?.in?.includes(status)),`${status} must count even when duration is unknown`);
        assert.ok(!clauses.some((c:any)=>c.feedbackStatus?.in?.includes("skipped")));
        return 1;
      }},
    }},
    "@/lib/access":{trainingAccess:async()=>({actor:{id:"coach"},athlete:{id:"athlete",language:"en"}}),errorResponse:()=>Response.json({error:"unexpected"},{status:500})},
    "@/lib/benchmark-result":{},"@/lib/dates":{},"@/lib/units":{unitsOf:()=>"metric"},
    "@/lib/baseline-test-options":{initialAssessmentEvidence},
  };
  const output:any={exports:{}};
  const source=ts.transpileModule(fs.readFileSync("src/app/api/benchmarks/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:output,exports:output.exports,Response,require:(name:string)=>deps[name]});
  const response=await output.exports.GET(new Request("https://example.test/api/benchmarks"));
  assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"private, no-store");
  assert.equal((await response.json()).evidence.needsInitialAssessment,false);
});
