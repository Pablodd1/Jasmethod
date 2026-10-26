import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("scheduled sync retains private diagnostics but sends no athlete row or provider error to logs/Telegram",async()=>{
 const logs:unknown[]=[],alerts:unknown[]=[],events:unknown[]=[];
 const deps:Record<string,unknown>={
  "next/server":{NextResponse:{json:Response.json}},
  "@/lib/db":{prisma:{connector:{findMany:async()=>[{userId:"PRIVATE_ATHLETE_ID"}]},user:{findUnique:async()=>({email:"PRIVATE_EMAIL",name:"PRIVATE_NAME"})}}},
  "@/lib/sync":{syncUserConnectors:async()=>({results:[{provider:"intervals",ok:false,error:"PRIVATE_PROVIDER_ERROR"}],total:7,profileSynced:{hrv:"GARMIN_DERIVED_VALUE"}})},
  "@/lib/athlinks":{syncAthlinksForAllUsers:async()=>{throw Error("unexpected read")}},
  "@/lib/athlinks-availability":{ATHLINKS_DEFERRED:true},
  "@/lib/telemetry":{alertOwner:async(...args:unknown[])=>{alerts.push(args)},logEvent:async(value:unknown)=>{events.push(value)}},
  "@/lib/sync-errors":{isSyncAuthFailure:()=>true},
 };
 const mod={exports:{} as {GET:(req:Request)=>Promise<Response>}};
 const code=ts.transpileModule(readFileSync("src/app/api/cron/sync/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports:mod.exports,require:(id:string)=>{assert.ok(id in deps,id);return deps[id]},process:{env:{CRON_SECRET:"synthetic-cron-secret"}},console:{log:(...value:unknown[])=>logs.push(value)},Date});
 const result=await mod.exports.GET(new Request("https://example.invalid/api/cron/sync",{headers:{authorization:"Bearer synthetic-cron-secret"}}));
 assert.equal(result.status,200);assert.equal((await result.json()).perUser[0].profileSynced.hrv,"GARMIN_DERIVED_VALUE");
 assert.equal(logs.length,1);assert.equal(alerts.length,1);assert.equal(events.length,1);
 assert.doesNotMatch(JSON.stringify({logs,alerts,events}),/PRIVATE_|GARMIN_DERIVED_VALUE/);
 assert.match(JSON.stringify(logs),/totalImported/);
});
