import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { scheduleTests } from "./adaptive";

test("legacy scheduling endpoint rejects every plan sport without any database writes",async()=>{
  let accesses=0;
  class ApiError extends Error {constructor(message:string,public status=400){super(message)}}
  const fail=()=>{accesses++;throw Error("Scheduling must not query or modify athlete data")};
  const deps:Record<string,unknown>={
    "@/lib/profile-service":{profileRevision:fail},
    "@/lib/db":{prisma:new Proxy({}, {get:fail})},
    "@/lib/access":{ApiError,trainingAccess:async()=>({actor:{id:"owner"},athlete:{id:"owner"}}),errorResponse:(e:any)=>Response.json({error:e.message},{status:e.status??500})},
    "@/lib/benchmark-result":{benchmarkResult:fail},"@/lib/dates":{parseDate:fail},
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
