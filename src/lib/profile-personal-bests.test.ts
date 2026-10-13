import { readManualPersonalBests } from "./onboarding-evidence";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createHash } from "node:crypto";
import { profilePatch } from "./profile-update";
import { createRequire } from "node:module";
import React from "react";

function fixture(raw: string | null) {
  let authenticated = true;
  let profile = {id:"profile",userId:"owner",manualPrs:raw,ftp:240};
  const reads: string[] = [];
  const writes: unknown[] = [];
  const audits: unknown[] = [];
  class ApiError extends Error { constructor(message:string,public status=400){super(message);} }
  const access = {ApiError,errorResponse:(error:unknown)=>Response.json({error:(error as Error).message},{status:error instanceof ApiError?error.status:500})};
  const tx = {
    athleteProfile:{findUnique:async({where}:any)=>{assert.equal(where.userId,"owner");reads.push("profile");return profile;},upsert:async({where,update}:any)=>{assert.equal(where.userId,"owner");writes.push(update);profile={...profile,...update};return profile;}},
    auditLog:{create:async({data}:any)=>{audits.push(data);}},
  };
  const prisma={...tx,workout:{findMany:async({where}:any)=>{assert.equal(where.userId,"owner");reads.push("workouts");return[];}},$transaction:async(callback:any,options:any)=>{assert.equal(options.isolationLevel,"Serializable");return callback(tx);}};
  const compile=(path:string)=>ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const service={exports:{} as any};
  runInNewContext(compile("src/lib/profile-service.ts"),{module:service,exports:service.exports,require:(name:string)=>{
    if(name==="node:crypto")return{createHash};
    if(name==="./db")return{prisma};
    if(name==="./access")return access;
    if(name==="./profile-update")return{profilePatch};
    if(["./planning-setup","./travel-context","./planning-setup-store","./profile-import-review"].includes(name))return{};
    throw Error(name);
  }});
  const loaded = {exports:{} as {GET:()=>Promise<Response>;PUT:(req:Request)=>Promise<Response>}};
  runInNewContext(compile("src/app/api/prs/route.ts"),{module:loaded,exports:loaded.exports,require:(name:string)=>{
    if (name === "next/server") return {NextResponse:Response};
    if (name === "@/lib/onboarding-evidence") return {readManualPersonalBests};
    if (name === "@/lib/auth") return {getCurrentUser:async()=>authenticated?{id:"owner",timezone:"UTC"}:null};
    if (name === "@/lib/db") return {prisma};
    if (name === "@/lib/profile-service") return service.exports;
    if (name === "@/lib/access") return access;
    throw Error(name);
  }});
  return {saveProfile:(body:any)=>service.exports.saveProfile("owner",{id:"owner",timezone:"UTC"},body),GET:loaded.exports.GET,put:(body:any)=>loaded.exports.PUT(new Request("https://example.invalid/api/prs",{method:"PUT",body:JSON.stringify(body)})),reads,writes,audits,profile:()=>profile,changeStored:(raw:string)=>{profile={...profile,manualPrs:raw};},signOut:()=>{authenticated=false;}};
}

test("Profile & Zones returns existing manual PBs even when no device workouts exist", async()=>{
  const manual=[{label:"100 m",value:13.4,unit:"sec",date:"2025-07-11"}];
  const f=fixture(JSON.stringify(manual));
  const response=await f.GET();const body=await response.json();
  assert.equal(response.status,200);assert.deepEqual(body.manual,manual);assert.deepEqual(body.prs,[]);assert.equal(body.total,0);assert.equal(body.manualReviewRequired,false);
  assert.deepEqual(f.reads.sort(),["profile","workouts"]);
});

test("PB reads remain athlete-scoped and reject anonymous reads without touching data",async()=>{
  const f=fixture("[]");f.signOut();assert.equal((await f.GET()).status,401);assert.deepEqual(f.reads,[]);
});

test("invalid legacy PB records require review and cannot be mistaken for an editable empty list",async()=>{
  for (const raw of ["{", "null", "{}", "[null]", '[{"label":"5K","value":{},"unit":"min","date":""}]']) {
    const f=fixture(raw);const body=await (await f.GET()).json();
    assert.deepEqual(body.manual,[]);assert.equal(body.manualReviewRequired,true);
    assert.deepEqual(f.reads.sort(),["profile","workouts"]);
  }
  const empty=await (await fixture(null).GET()).json();assert.deepEqual(empty.manual,[]);assert.equal(empty.manualReviewRequired,false);
});

test("Profile & Zones blocks add and remove controls when stored PBs need review",()=>{
  const source=readFileSync("src/components/prs-card.tsx","utf8");
  assert.match(source,/if \(!data \|\| data.manualReviewRequired\)/);
  assert.match(source,/disabled=\{saving \|\| !data \|\| data.manualReviewRequired\}/);
  assert.match(source,/disabled=\{saving \|\| !data \|\| data.manualReviewRequired \|\| !label.trim\(\) \|\| !value\}/);
  assert.match(source,/Adding or removing records is disabled to preserve the original data/);
});


test("PB writes require the reviewed revision and preserve concurrent onboarding additions",async()=>{
  const original=[{label:"100 m",value:13.4,unit:"sec",date:""}];
  const f=fixture(JSON.stringify(original));
  const read=await(await f.GET()).json();
  assert.equal(typeof read.revision,"string");
  assert.equal((await f.put({manual:[]})).status,409);
  const newer=[...original,{label:"5K",value:24,unit:"min",date:""}];
  f.changeStored(JSON.stringify(newer));
  assert.equal((await f.put({manual:[],expectedRevision:read.revision})).status,409);
  assert.deepEqual(JSON.parse(f.profile().manualPrs!),newer);assert.equal(f.writes.length,0);
  const latest=await(await f.GET()).json();
  const updated=await f.put({manual:newer,expectedRevision:latest.revision});
  assert.equal(updated.status,200);assert.equal((await updated.json()).ok,true);assert.equal(f.profile().ftp,240);assert.equal(f.audits.length,1);
});

test("malformed or anonymous PB replacement never erases stored records",async()=>{
  const f=fixture("broken");const read=await(await f.GET()).json();
  assert.equal((await f.put({manual:[],expectedRevision:read.revision})).status,409);
  for(const body of [{},null,{manual:"[]"},{manual:[{label:"5K",value:-4,unit:"min",date:""}]}])assert.equal((await f.put(body)).status,400);
  f.signOut();assert.equal((await f.put({manual:[],expectedRevision:read.revision})).status,401);
  assert.equal(f.writes.length,0);assert.equal(f.profile().manualPrs,"broken");
});

function cardFixture() {
  const requireModule=createRequire(import.meta.url);
  const cells:any[]=[];const pending:(()=>unknown)[]=[];let cursor=0,dirty=true,tree:any;
  const writes:any[]=[];let fail=true;
  const children=(value:any):any[]=>Array.isArray(value)?value.flatMap(children):React.isValidElement(value)?[value,...children((value as any).props.children)]:[];
  const text=(value:any):string=>value==null||typeof value==="boolean"?"":Array.isArray(value)?value.map(text).join(""):React.isValidElement(value)?text((value as any).props.children):String(value);
  const react={...React,useState(initial:any){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],(value:any)=>{cells[i]=typeof value==="function"?value(cells[i]):value;dirty=true;}];},useRef(initial:any){const i=cursor++;return cells[i]??(cells[i]={current:initial});},useEffect(effect:()=>unknown){const i=cursor++;if(!cells[i]){cells[i]=true;pending.push(effect);}}};
  const request=async(_path:string,init?:RequestInit)=>{
    if(init?.method!=="PUT")return Response.json({manual:[],prs:[],revision:"p1",manualReviewRequired:false});
    const body=JSON.parse(String(init.body));writes.push(body);
    return fail?Response.json({error:"conflict"},{status:409}):Response.json({ok:true,manual:body.manual,revision:"p2"});
  };
  const loaded={exports:{} as any};
  runInNewContext(ts.transpileModule(readFileSync("src/components/prs-card.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module:loaded,exports:loaded.exports,AbortSignal,fetch:request,require:(name:string)=>name==="react"?react:requireModule(name)});
  async function flush(){for(let count=0;count<20;count++){if(dirty){dirty=false;cursor=0;tree=loaded.exports.PrsCard({lang:"en"});}while(pending.length)pending.shift()!();await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!pending.length)return;}throw Error("Unstable card fixture");}
  const find=(predicate:(node:any)=>boolean)=>{const node=children(tree).find(predicate);assert.ok(node);return node;};
  return{flush,writes,input:(name:string)=>find(node=>node.props["aria-label"]===name),button:()=>find(node=>node.type==="button"&&text(node.props.children).includes("Add PR")),text:()=>text(tree),succeed:()=>{fail=false;}};
}

test("PB card preserves input after failed saves, submits once and clears only verified success",async()=>{
  const ui=cardFixture();await ui.flush();
  ui.input("Personal best label").props.onChange({target:{value:"5K"}});await ui.flush();
  ui.input("Result").props.onChange({target:{value:"24"}});await ui.flush();
  const click=ui.button().props.onClick;await Promise.all([click(),click()]);await ui.flush();
  assert.equal(ui.writes.length,1);assert.equal(ui.writes[0].expectedRevision,"p1");assert.equal(ui.input("Result").props.value,"24");assert.match(ui.text(),/nothing was resubmitted/);
  ui.succeed();await ui.button().props.onClick();await ui.flush();assert.equal(ui.input("Result").props.value,"");assert.match(ui.text(),/5K/);assert.equal(ui.writes.length,2);
});


test("profile writes enforce positive PB values and nonblank units before serialization",async()=>{
  const original=[{label:"100 m",value:13.4,unit:"sec",date:""}];
  const f=fixture(JSON.stringify(original));const read=await(await f.GET()).json();
  for(const patch of [{value:-4},{value:0},{unit:""},{unit:"   "}]){
    const manualPrs=JSON.stringify([{...original[0],...patch}]);
    await assert.rejects(()=>f.saveProfile({expectedRevision:read.revision,manualPrs}),/positive value and nonblank units/);
    assert.deepEqual(JSON.parse(f.profile().manualPrs!),original);
  }
  assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);
  await f.saveProfile({expectedRevision:read.revision,manualPrs:JSON.stringify([...original,{label:"5K",value:24,unit:"min",date:""}])});
  assert.equal(JSON.parse(f.profile().manualPrs!).length,2);
});

test("legacy nonpositive or unitless PBs remain readable and protected, while unrelated edits still work",async()=>{
  for(const patch of [{value:-4},{value:0},{unit:""},{unit:"   "}]){
    const original=[{label:"Legacy result",value:20,unit:"sec",date:"",...patch}];
    const raw=JSON.stringify(original),f=fixture(raw),read=await(await f.GET()).json();
    assert.deepEqual(read.manual,original);assert.equal(read.manualReviewRequired,true);
    assert.deepEqual(readManualPersonalBests(raw),original);
    await assert.rejects(()=>f.saveProfile({expectedRevision:read.revision,manualPrs:"[]"}),/original records have been preserved/);
    assert.equal(f.profile().manualPrs,raw);assert.equal(f.writes.length,0);assert.equal(f.audits.length,0);
    await f.saveProfile({expectedRevision:read.revision,ftp:250});
    assert.equal(f.profile().manualPrs,raw);assert.equal(f.profile().ftp,250);
  }
});
