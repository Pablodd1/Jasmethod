import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";
import * as parser from "./manual-workout";
import * as requests from "./manual-workout-request";
import { appMutationOriginAllowed } from "./request-origin";

function fixture(){
  const state={userId:"athlete-a",actorId:"athlete-a",anonymous:false,workouts:new Map<string,any>(),audits:new Map<string,any>(),creates:0,transactions:0,locks:[] as string[],conflicts:0,failAudit:false};
  class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
  const tx={
    $executeRaw:async(strings:TemplateStringsArray,value:string)=>{assert.equal(strings.join("?"),"SELECT pg_advisory_xact_lock(hashtext(?))");state.locks.push(value);return 1;},
    workout:{
      create:async({data}:any)=>{state.creates++;const row={id:`synthetic-workout-${state.creates}`,...data};state.workouts.set(row.id,row);return row;},
      findFirst:async({where}:any)=>{const row=state.workouts.get(where.id);return row?.userId===where.userId?row:null;},
    },
    auditLog:{
      findUnique:async({where}:any)=>state.audits.get(where.id)||null,
      create:async({data}:any)=>{if(state.failAudit)throw Error("Synthetic audit failure");const id=data.id||`legacy-audit-${state.audits.size}`;if(state.audits.has(id))throw{code:"P2002"};const row={...data,id};state.audits.set(id,row);return row;},
    },
  };
  const deps:Record<string,unknown>={
    "next/server":{NextResponse:Response},"node:crypto":crypto,
    "@/lib/manual-workout":parser,"@/lib/manual-workout-request":requests,"@/lib/calendar-workouts":{},
    "@/lib/request-origin":{appMutationOriginAllowed:(req:Request)=>appMutationOriginAllowed(req,{NODE_ENV:"production",APP_URL:"https://app.example.invalid"})},
    "@/lib/access":{ApiError,trainingAccess:async()=>{if(state.anonymous)throw new ApiError("Sign in",401);return{actor:{id:state.actorId},athlete:{id:state.userId,timezone:"UTC"}};},errorResponse:(e:any)=>Response.json({error:e.status?e.message:"Save failed"},{status:e.status||500})},
    "@/lib/db":{prisma:{$transaction:async(callback:any,options:any)=>{
      state.transactions++;assert.equal(options.isolationLevel,"Serializable");
      if(state.conflicts>0){state.conflicts--;throw{code:"P2034"};}
      const oldWorkouts=new Map(state.workouts),oldAudits=new Map(state.audits);
      try{return await callback(tx);}catch(e){state.workouts=oldWorkouts;state.audits=oldAudits;throw e;}
    }}},
  };
  const out:any={exports:{}};
  const source=ts.transpileModule(fs.readFileSync("src/app/api/workouts/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{module:out,exports:out.exports,Request,Response,Date,require:(name:string)=>{if(!(name in deps))throw Error(`Unexpected dependency ${name}`);return deps[name];}});
  const body={sport:"bike",date:new Date().toISOString().slice(0,10),actualDurationMin:30,rpe:3,title:"Synthetic activity",clientRequestId:"synthetic-request-1"};
  const run=(patch:Record<string,unknown>={},extraHeaders:Record<string,string|null>={})=>{
    const headers=new Headers({"content-type":"application/json",origin:"https://app.example.invalid"});
    for(const [key,value] of Object.entries(extraHeaders)){if(value===null)headers.delete(key);else headers.set(key,value);}
    return out.exports.POST(new Request("https://app.example.invalid/api/workouts",{method:"POST",headers,body:JSON.stringify({...body,...patch})}));
  };
  return{state,body,run};
}

test("identical manual activity retries return one saved row and the original receipt",async()=>{
  const f=fixture(),first=await f.run(),saved=await first.json(),second=await f.run(),replay=await second.json();
  assert.equal(first.status,201);assert.equal(second.status,200);
  assert.equal(saved.workout.id,replay.workout.id);assert.equal(replay.replayed,true);
  assert.equal(replay.clientRequestId,f.body.clientRequestId);assert.equal(replay.replayProtected,true);
  assert.equal(f.state.workouts.size,1);assert.equal(f.state.audits.size,1);
  assert.equal(saved.workout.approved,false);
  assert.equal(first.headers.get("cache-control"),"private, no-store");
  assert.equal((await f.run({actualDurationMin:31})).status,409);
  assert.equal(f.state.workouts.size,1);
  assert.equal((await f.run({clientRequestId:"synthetic-new-intent"})).status,201);
  assert.equal(f.state.workouts.size,2,"new intent can report a separate same-valued session");
});

test("manual activity rejects missing, sibling, forged and cross-site origins before any transaction",async()=>{
  const cases:Record<string,string|null>[]=[
    {origin:null},
    {origin:"https://sibling.example.invalid","content-type":"text/plain"},
    {origin:"https://evil.example.invalid",host:"evil.example.invalid","x-forwarded-host":"evil.example.invalid"},
    {origin:"https://app.example.invalid","sec-fetch-site":"cross-site"},
  ];
  for(const headers of cases){
    const f=fixture();assert.equal((await f.run({},headers)).status,403);
    assert.equal(f.state.transactions,0);assert.equal(f.state.workouts.size,0);
  }
});

test("receipt keys and record lookup are athlete scoped and preserve the authoring actor",async()=>{
  const f=fixture();f.state.actorId="authorized-coach";
  const a=await(await f.run()).json();
  assert.equal([...f.state.audits.values()][0].actorId,"authorized-coach");
  f.state.userId="athlete-b";f.state.actorId="athlete-b";
  const b=await(await f.run()).json();
  assert.notEqual(a.workout.id,b.workout.id);assert.equal(b.workout.userId,"athlete-b");
  assert.equal(f.state.audits.size,2);
  f.state.userId="athlete-a";
  const aReceipt=[...f.state.audits.values()].find(row=>row.subjectId==="athlete-a");
  aReceipt.entityId=b.workout.id;
  assert.equal((await f.run()).status,409,"a corrupted foreign record reference never replays another athlete's row");
  assert.equal(f.state.workouts.size,2);
});

test("transaction rollback leaves neither row nor receipt; bounded conflicts retry without duplicate creation",async()=>{
  const f=fixture();f.state.failAudit=true;
  assert.equal((await f.run()).status,500);assert.equal(f.state.workouts.size,0);assert.equal(f.state.audits.size,0);
  f.state.failAudit=false;f.state.conflicts=1;
  assert.equal((await f.run()).status,201);assert.equal(f.state.workouts.size,1);assert.equal(f.state.audits.size,1);
  const g=fixture();g.state.conflicts=3;
  assert.equal((await g.run()).status,409);assert.equal(g.state.workouts.size,0);assert.equal(g.state.audits.size,0);
});

test("anonymous, malformed IDs and missing saved records never produce a false replay",async()=>{
  const f=fixture();f.state.anonymous=true;
  assert.equal((await f.run()).status,401);assert.equal(f.state.transactions,0);
  f.state.anonymous=false;
  for(const clientRequestId of [null,"",{},"bad id"]){assert.equal((await f.run({clientRequestId})).status,400);}
  assert.equal(f.state.transactions,0);
  const data=await(await f.run()).json();f.state.workouts.delete(data.workout.id);
  assert.equal((await f.run()).status,409);assert.equal(f.state.workouts.size,0,"missing records are not silently recreated");
});

test("malformed durable receipt metadata fails closed without a second creation",async()=>{
  const f=fixture();await f.run();
  const receipt=[...f.state.audits.values()][0];
  for(const note of ["{bad","null","[]","{}"]){receipt.note=note;assert.equal((await f.run()).status,409);}
  assert.equal(f.state.workouts.size,1);
});

test("legacy clients remain compatible with an explicit lack of replay protection",async()=>{
  const f=fixture();
  const first=await f.run({clientRequestId:undefined}),data=await first.json();
  assert.equal(first.status,201);assert.equal(data.replayProtected,false);
  assert.equal((await f.run({clientRequestId:undefined})).status,201);
  assert.equal(f.state.workouts.size,2);
});
