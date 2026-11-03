import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { appMutationOriginAllowed } from "./request-origin";
import * as http from "./race-scenario-http";
function fixture(){
  const state={actor:"athlete",athlete:"athlete",anonymous:false,saves:0,fail:false};
  class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
  const deps:Record<string,any>={
    "@/lib/access":{ApiError,trainingAccess:async()=>{if(state.anonymous)throw new ApiError("Sign in",401);return{actor:{id:state.actor},athlete:{id:state.athlete}};},errorResponse:(e:any)=>Response.json({error:e.message},{status:e.status??500})},
    "@/lib/request-origin":{appMutationOriginAllowed:(req:Request)=>appMutationOriginAllowed(req,{NODE_ENV:"production",APP_URL:"https://app.example.invalid"})},
    "@/lib/first-plan-store":{ensureFirstPlan:async(id:string)=>{assert.equal(id,state.actor);state.saves++;if(state.fail)throw Error("Synthetic save failure");return{planId:"plan",created:false,status:"existing"};}},
    "@/lib/ratelimit":{rateLimit:()=>({ok:true})},"@/lib/race-scenario-http":http,
  };
  const mod:any={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/app/api/plan/ensure/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Request,Response,require:(name:string)=>{if(!(name in deps))throw Error(name);return deps[name];}});
  const run=(body="{}",origin="https://app.example.invalid")=>mod.exports.POST(new Request("https://app.example.invalid/api/plan/ensure",{method:"POST",headers:{"Content-Type":"application/json",origin},body}));
  return {state,run};
}
test("authenticated own entry receives verified saved status; failed persistence never returns success",async()=>{
  const {state,run}=fixture();const response=await run();assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal((await response.json()).plan.planId,"plan");
  state.fail=true;assert.equal((await run()).status,500);
});
test("first-plan endpoint blocks cross-athlete, anonymous, foreign origins and client plan parameters before writes",async()=>{
  const {state,run}=fixture();state.actor="admin";assert.equal((await run()).status,403);state.actor="athlete";
  state.anonymous=true;assert.equal((await run()).status,401);state.anonymous=false;
  assert.equal((await run("{}","https://evil.example.invalid")).status,403);
  assert.equal((await run('{"athleteId":"other"}')).status,400);
  assert.equal((await run("[]")).status,400);assert.equal(state.saves,0);
});
