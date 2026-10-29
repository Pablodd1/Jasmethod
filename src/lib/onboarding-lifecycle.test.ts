import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import ts from "typescript";
import { saveReviewedProfile } from "./profile-client";
import { parsePlanningSetup } from "./planning-setup";

const requireModule = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync("src/components/detailed-athlete-setup.tsx","utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
type Node = React.ReactElement<any>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!React.isValidElement(value)) return [];
  const node = value as Node;
  return [node,...nodes(node.props.children)];
}
function content(value: unknown): string {
  if (value == null || typeof value === "boolean") return "";
  if (Array.isArray(value)) return value.map(content).join("");
  if (React.isValidElement(value)) return content((value as Node).props.children);
  return String(value);
}
function fixture(providers: Record<string,unknown>[] = []) {
  const storage = new Map<string,string>();
  const server = {profile:{sex:"",weightKg:null,experience:"beginner",weeklyHours:8,goal:null} as Record<string,unknown>,setup:null as Record<string,unknown>|null,revision:"p1",setupRevision:null as string|null,races:[] as Record<string,unknown>[],conflict:false,importFailure:false,importReview:{observations:[],suggestions:[],history:{count:0,sports:[]}} as Record<string,unknown>};
  const writes: {path:string;body:any}[] = [];
  const reads: string[] = [];
  const request: typeof fetch = async (input,init) => {
    const path = String(input), method = init?.method ?? "GET";
    if (method === "GET") {
      reads.push(path);
      if (path === "/api/profile") return Response.json({...server,planningReadiness:{ready:false,missing:["Confirm available days"],review:[]}});
      if (path === "/api/races") return Response.json({races:server.races});
      if (path === "/api/connectors") return Response.json({providers});
      return server.importFailure ? Response.json({error:"unavailable"},{status:503}) : Response.json(server.importReview);
    }
    const body = JSON.parse(String(init?.body)); writes.push({path,body});
    if (path === "/api/profile") {
      if (server.conflict || body.expectedRevision !== server.revision) return Response.json({error:"conflict"},{status:409});
      const {expectedRevision,expectedSetupRevision,setup,setupSection,...fields} = body;
      Object.assign(server.profile,fields);
      if (setup) {server.setup=setupSection === "intent" && server.setup ? {...server.setup,...setup} : parsePlanningSetup(setup) as unknown as Record<string,unknown>;server.setupRevision=`s${writes.length}`;}
      server.revision=`p${writes.length+1}`;
      return Response.json({ok:true,...server,planningReadiness:{ready:false,missing:["Confirm available days"],review:[]}});
    }
    if (path === "/api/races") {
      const race={...body,id:body.id ?? "race-new",date:`${body.date}T00:00:00.000Z`};
      server.races=[...server.races.filter(item=>item.id!==race.id),race];
      return Response.json({ok:true,race});
    }
    return Response.json({ok:true});
  };
  function mount(query = "redo=1",props:Record<string,unknown> = {}) {
    const cells:any[]=[]; const pending:(()=>unknown)[]=[]; let cursor=0,dirty=true,tree:unknown;
    const same=(a:unknown[]|undefined,b:unknown[]|undefined)=>!!a&&!!b&&a.length===b.length&&a.every((item,index)=>Object.is(item,b[index]));
    const react = {...React,
      useState(initial:unknown){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [cells[index],(value:unknown)=>{const next=typeof value==="function"?(value as (prior:unknown)=>unknown)(cells[index]):value;if(!Object.is(next,cells[index])){cells[index]=next;dirty=true;}}];},
      useRef(initial:unknown){const index=cursor++;return cells[index]??(cells[index]={current:initial});},
      useEffect(effect:()=>unknown,deps:unknown[]){const index=cursor++;if(!same(cells[index]?.deps,deps)){cells[index]?.cleanup?.();cells[index]={deps};pending.push(()=>{cells[index].cleanup=effect();});}},
      useCallback(callback:unknown,deps:unknown[]){const index=cursor++;if(!same(cells[index]?.deps,deps))cells[index]={deps,callback};return cells[index].callback;},
    };
    const listeners = new Map<string,()=>void>();
    let poll:(()=>void)|undefined;
    const visibility={state:"visible"};
    const destination:string[]=[];
    const router={push:(path:string)=>destination.push(path),replace:(path:string)=>destination.push(path)};
    const session={user:{id:"fixture-a",name:"Fixture Athlete",email:"athlete@example.invalid",language:"en",timezone:"America/New_York",onboarded:false},refresh:async()=>{}};
    const loadedModule={exports:{} as {DetailedAthleteSetup:(props?:Record<string,unknown>)=>unknown}};
    const dependencies:Record<string,unknown>={
      react,"next/navigation":{useRouter:()=>router,useSearchParams:()=>new URLSearchParams(query)},
      "@/components/auth":{useAuth:()=>session},"@/components/gate":{ProtectedPage:({children}:any)=>children},
      "@/components/double-day-fields":{DoubleDayFields:()=>null},"@/components/travel-fields":{TravelFields:()=>null},
      "@/lib/profile-client":{saveReviewedProfile:(fields:Record<string,unknown>,revision:string|null)=>saveReviewedProfile(fields,revision,request)},
      "next/link":{__esModule:true,default:({children}:any)=>children},
    };
    vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,URLSearchParams,AbortSignal,AbortController,fetch:request,sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},document:{get visibilityState(){return visibility.state;}},window:{location:{reload:()=>{}},setInterval:(fn:()=>void,ms:number)=>{assert.equal(ms,15000);poll=fn;return 1;},clearInterval:()=>{poll=undefined;},addEventListener:(type:string,fn:()=>void)=>listeners.set(type,fn),removeEventListener:(type:string)=>listeners.delete(type)},require:(name:string)=>name in dependencies?dependencies[name]:requireModule(name.startsWith("@/")?`${process.cwd()}/src/${name.slice(2)}`:name)});
    async function flush(){for(let attempts=0;attempts<20;attempts++){if(dirty){dirty=false;cursor=0;tree=loadedModule.exports.DetailedAthleteSetup(props);}while(pending.length)pending.shift()!();await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!pending.length)return;}throw Error("Unstable fixture render");}
    const find=(predicate:(node:Node)=>boolean)=>{const node=nodes(tree).find(predicate);assert.ok(node,"Expected control not found");return node;};
    return {flush,destination,visibility,async events(events:string[]){for(const name of events){if(name==="poll")poll?.();else listeners.get(name)?.();}await flush();},find,async focus(){listeners.get("focus")?.();await flush();},text:()=>content(tree),input:(id:string)=>find(node=>node.props.id===id),button:(label:string)=>find(node=>node.type==="button"&&content(node.props.children).includes(label)),async click(label:string){await this.button(label).props.onClick();await flush();},async edit(id:string,value:string){const input=this.input(id);input.props.onChange(input.props.field ? value : {target:{value}});await flush();},unmount(){for(const cell of cells)if(cell&&typeof cell.cleanup==="function")cell.cleanup();}};
  }
  return {mount,server,writes,storage,reads};
}

test("real onboarding handlers keep unsaved entries across navigation/reload, then confirm a server save", async()=>{
  const f=fixture();let ui=f.mount();await ui.flush();
  assert.match(ui.text(),/Skip connections and continue manually/);
  await ui.click("Skip connections");await ui.edit("onboard-field-4","63.2");
  await ui.click("3. Goals");await ui.click("2. Your data");assert.equal(ui.input("onboard-field-4").props.value,"63.2");
  ui.unmount();ui=f.mount();await ui.flush();assert.equal(ui.input("onboard-field-4").props.value,"63.2");
  await ui.click("Save personal details");assert.equal(f.writes.length,1);assert.equal(f.writes[0].body.weightKg,"63.2");await ui.click("Save new answers and continue");assert.match(ui.text(),/Goals and optional race/);
  ui.unmount();ui=f.mount("redo=1&step=profile");await ui.flush();assert.equal(ui.input("onboard-field-4").props.value,"63.2");
});
test("conflicting saves stay on the section without replacing a revision or claiming success", async()=>{
  const f=fixture();const ui=f.mount("redo=1&step=profile");await ui.flush();await ui.edit("onboard-field-4","61");f.server.conflict=true;
  await ui.click("Save personal details");assert.match(ui.text(),/Nothing was resubmitted/);assert.equal(f.writes.length,1);assert.equal(f.server.profile.weightKg,null);assert.equal(ui.input("onboard-field-4").props.value,"61");
});
test("saved optional goals hydrate in a new tab without requiring adult/safety confirmation", async()=>{
  const f=fixture();let ui=f.mount("redo=1&step=race&advanced=1");await ui.flush();await ui.edit("onboard-field-5","advanced");await ui.edit("onboard-field-7","run-only");await ui.click("6 months");await ui.click("Save goals and race");
  assert.equal(f.server.setup?.profileConfirmed,false);assert.deepEqual(f.server.setup?.profileAnswers,{experience:true,weeklyHours:false});
  ui.unmount();f.storage.clear();ui=f.mount("redo=1&step=race&advanced=1");await ui.flush();assert.match(ui.text(),/Your saved answers are already here/);await ui.click("Edit saved goals");assert.equal(ui.input("onboard-field-5").props.value,"advanced");assert.throws(()=>ui.input("onboard-field-6"));assert.equal(ui.button("6 months").props["aria-pressed"],true);
});
test("returning race edits update its saved id after reload instead of creating another race", async()=>{
  const f=fixture();f.server.races=[{id:"race-existing",name:"Existing race",distance:"10k",date:"2099-04-02T00:00:00.000Z",location:"Miami",priority:1}];
  let ui=f.mount("redo=1&step=race");await ui.flush();assert.equal(ui.input("onboard-field-8").props.value,"Existing race");assert.equal(ui.input("onboard-field-10").props.value,"2099-04-02");
  await ui.edit("onboard-field-8","Renamed race");ui.unmount();ui=f.mount("redo=1&step=race");await ui.flush();await ui.click("Update this race");
  assert.equal(f.writes[0].body.id,"race-existing");assert.equal(f.server.races.length,1);assert.equal(f.server.races[0].name,"Renamed race");
});

test("saving goals leaves unchanged race history untouched", async()=>{
  const f=fixture();f.server.races=[{id:"race-existing",name:"Existing race",distance:"10k",date:"2099-04-02T00:00:00.000Z",location:"Miami",priority:1}];
  const ui=f.mount("redo=1&step=race");await ui.flush();await ui.click("Save goals and race");
  assert.equal(f.writes.filter(write=>write.path === "/api/races").length,0);
  assert.equal(f.server.races.length,1);
});


test("missing-only references and PBs save once, preserve manual overrides, and survive interrupted entry", async()=>{
  const f=fixture();f.server.profile={...f.server.profile,ftp:235,lthr:162,manualPrs:JSON.stringify([{label:"100 m",value:13.7,unit:"sec",date:"2025-07-01"}])};
  let ui=f.mount("redo=1&step=profile");await ui.flush();
  assert.match(ui.text(),/Cycling FTP: 235 W/);assert.match(ui.text(),/100 m: 13.7 sec/);
  assert.throws(()=>ui.input("onboard-anchor-ftp"));
  await ui.edit("onboard-anchor-runPaceBase","280");await ui.edit("onboard-pb-label","5K race");await ui.edit("onboard-pb-value","24");await ui.edit("onboard-pb-unit","min");
  ui.unmount();ui=f.mount("redo=1&step=profile");await ui.flush();assert.equal(ui.input("onboard-pb-value").props.value,"24");
  const button=ui.button("Save new answers and continue");await Promise.all([button.props.onClick(),button.props.onClick()]);await ui.flush();
  assert.equal(f.writes.length,1);assert.equal("ftp" in f.writes[0].body,false);assert.equal("weightKg" in f.writes[0].body,false);
  assert.equal(f.server.profile.ftp,235);assert.equal(f.server.profile.lthr,162);assert.equal(f.server.profile.runPaceBase,"280");
  assert.deepEqual(JSON.parse(String(f.server.profile.manualPrs)).map((row:any)=>row.label),["100 m","5K race"]);
  await ui.click("2. Your data");await ui.click("Save new answers and continue");assert.equal(f.writes.length,1);
});

test("PB conflict retains the unfinished entry and does not silently retry against a fresh revision", async()=>{
  const f=fixture();const ui=f.mount("redo=1&step=profile");await ui.flush();
  await ui.edit("onboard-pb-label","5K race");await ui.edit("onboard-pb-value","24");await ui.edit("onboard-pb-unit","min");f.server.conflict=true;
  await ui.click("Save new answers and continue");assert.match(ui.text(),/Nothing was resubmitted/);assert.equal(ui.input("onboard-pb-value").props.value,"24");assert.equal(f.writes.length,1);assert.equal(f.server.profile.manualPrs,undefined);
});

test("returning from an import refreshes actual data, and a failed refresh does not retain stale success", async()=>{
  const f=fixture();const ui=f.mount("redo=1&step=profile");await ui.flush();assert.match(ui.text(),/0 completed imported records/);
  f.server.importReview={history:{count:12,sports:[{sport:"run",count:12}]},observations:[{id:"hrv",metricType:"hrv_rmssd",value:55,unit:"ms",source:"oura",kind:"estimated",observedAt:"2026-10-12T00:00:00Z"}]};
  await ui.focus();assert.match(ui.text(),/12 completed imported records/);assert.match(ui.text(),/55 ms.*Estimated/);
  f.server.importFailure=true;await ui.focus();assert.match(ui.text(),/Imported history could not yet be verified/);assert.doesNotMatch(ui.text(),/12 completed imported records/);
  await ui.click("Save new answers and continue");assert.equal(f.writes.length,0);assert.match(ui.text(),/Goals and optional race/);
});


test("short onboarding asks only for missing goals and never submits untouched planning confirmations", async()=>{
  const f=fixture();f.server.profile.ftp=245;
  const ui=f.mount("redo=1&step=race");await ui.flush();
  assert.throws(()=>ui.input("onboard-field-5"));assert.throws(()=>ui.input("onboard-field-6"));
  assert.doesNotMatch(ui.text(),/I confirm I am 18 or older|Pregnancy\/postpartum/);
  await ui.edit("onboard-field-7","cycle");await ui.edit("onboard-goal-description","Build consistent endurance");await ui.click("3 months");await ui.click("Save goals and race");
  const request=f.writes[0].body;assert.equal(request.setupSection,"intent");assert.equal(request.goal,"cycle");
  assert.deepEqual(request.setup,{goalDescription:"Build consistent endurance",planWeeks:"12"});
  assert.equal("experience" in request,false);assert.equal("ftp" in request,false);assert.equal(f.server.setup?.adultConfirmed,false);
  assert.match(ui.text(),/Your workspace is ready/);
});

test("short entry defers optional thresholds while a draft or advanced review keeps them inspectable",async()=>{
  const f=fixture();let ui=f.mount("redo=1&step=profile");await ui.flush();
  const references=()=>ui.find(node=>node.type==="details"&&node.props["aria-label"]==="Saved and missing thresholds");
  assert.equal(references().props.open,undefined);assert.match(ui.text(),/start without a device or threshold test/);
  await ui.edit("onboard-anchor-runPaceBase","280");assert.equal(references().props.open,true);
  ui.unmount();ui=f.mount("redo=1&step=profile");await ui.flush();assert.equal(references().props.open,true);assert.equal(ui.input("onboard-anchor-runPaceBase").props.value,"280");
  ui.unmount();f.storage.clear();ui=f.mount("redo=1&step=profile&advanced=1");await ui.flush();assert.equal(references().props.open,true);
});

test("a legacy draft without manualPrs inherits verified saved PBs before appending a new one", async()=>{
  const f=fixture();const existing=[{label:"100 m",value:13.7,unit:"sec",date:"2025-07-01"}];f.server.profile.manualPrs=JSON.stringify(existing);
  let ui=f.mount("redo=1&step=profile");await ui.flush();await ui.edit("onboard-field-4","64");ui.unmount();
  for (const [key,raw] of f.storage) {const draft=JSON.parse(raw);delete draft.profile.manualPrs;delete draft.personalBest;f.storage.set(key,JSON.stringify(draft));}
  ui=f.mount("redo=1&step=profile");await ui.flush();assert.equal(ui.input("onboard-field-4").props.value,"64");assert.match(ui.text(),/100 m: 13.7 sec/);
  await ui.edit("onboard-pb-label","5K race");await ui.edit("onboard-pb-value","24");await ui.edit("onboard-pb-unit","min");await ui.click("Save new answers and continue");
  assert.deepEqual(JSON.parse(String(f.server.profile.manualPrs)),[...existing,{label:"5K race",value:24,unit:"min",date:""}]);
  assert.equal(f.server.profile.weightKg,"64");
});


test("initial, focus, pageshow and visible 15-second refresh share one request without replacing drafts",async()=>{
  const f=fixture();const ui=f.mount("redo=1&step=profile");await ui.flush();
  const imports=()=>f.reads.filter(path=>path==="/api/onboard/import-review").length;
  assert.equal(imports(),1);assert.equal(f.reads.filter(path=>path==="/api/connectors").length,1);
  await ui.edit("onboard-field-4","63.2");await ui.edit("onboard-pb-label","My result");
  f.server.importReview={history:{count:2,sports:[]},observations:[{id:"rmssd",metricType:"hrv_rmssd",value:55,unit:"ms",source:"oura",kind:"estimated",observedAt:"2026-10-12"},{id:"sdnn",metricType:"hrv_sdnn",value:40,unit:"ms",source:"apple_health",kind:"imported",observedAt:"2026-10-12"}]};
  await ui.events(["focus","pageshow","poll"]);assert.equal(imports(),2);
  assert.equal(ui.input("onboard-field-4").props.value,"63.2");assert.equal(ui.input("onboard-pb-label").props.value,"My result");
  assert.match(ui.text(),/Heart-rate variability \(RMSSD\): 55 ms/);assert.match(ui.text(),/Heart-rate variability \(SDNN\): 40 ms/);
  assert.equal(f.reads.filter(path=>path==="/api/profile").length,1);
  ui.visibility.state="hidden";await ui.events(["focus","pageshow","poll"]);assert.equal(imports(),2);
  ui.visibility.state="visible";await ui.events(["poll"]);assert.equal(imports(),3);
  await ui.click("3. Goals");await ui.events(["poll"]);assert.equal(imports(),3);
  ui.unmount();await ui.events(["focus","pageshow","poll"]);assert.equal(imports(),3);
});

test("full-cycle details remain collapsed and completion opens Today without generating a plan",async()=>{
  const f=fixture();const ui=f.mount("redo=1&step=race&return=training");await ui.flush();
  const details=ui.find(node=>node.type==="details"&&content(node.props.children).includes("Details needed for a personalized plan"));
  assert.equal(details.props.open,undefined);assert.throws(()=>ui.input("onboard-field-6"));
  assert.match(ui.text(),/Experience \(optional\)/);
  await ui.click("4. Ready");await ui.click("Open today’s training");
  assert.deepEqual(ui.destination,["/today"]);assert.deepEqual(f.writes.map(write=>write.path),["/api/onboard"]);
});


test("deferred imports show saved-history/manual options without offering a connection or new import", async () => {
  const f=fixture([{id:"athlinks",name:"Athlinks",description:"Race-history imports paused",configured:true,deferred:true,method:"athlinks",status:"connected"}]);
  const ui=f.mount(); await ui.flush();
  assert.match(ui.text(),/Import deferred/);
  assert.match(ui.text(),/Saved history and manual options/);
  assert.doesNotMatch(ui.text(),/Review race-history import|Connect \/ reconnect/);
  assert.equal(f.writes.length,0);
  ui.unmount();
});


test("imported-history review shows uncertainty without autofilling or saving the athlete's explicit tolerated baseline",async()=>{
 const f=fixture();f.server.setup={baselineWeeklyMinutes:90,baselineObservedAt:'2026-10-14'};
 f.server.importReview={history:{count:153,sports:[{sport:'run',count:153}]},trainingReview:{timezone:'America/New_York',rawRecordCount:5,possibleOverlapGroups:1,recordedWeeklyAverageMinutes:null,truncated:false,weeks:[{startKey:'2026-10-05',endKey:'2026-10-11',rawRecordCount:5,recordedDays:2,unknownDurationRecords:1,minutesRange:{minimum:120,maximum:null},sources:['strava','whoop'],overlaps:[{sport:'run',startAt:'2026-10-06T07:00:00Z',records:[{source:'strava',minutes:60},{source:'whoop',minutes:55}]}]}]}};
 const ui=f.mount('redo=1&step=race&return=training');await ui.flush();assert.match(ui.text(),/Review imported training before changing your baseline/);assert.match(ui.text(),/Possible copies; not reconciled/);assert.match(ui.text(),/other days unknown/);assert.match(ui.text(),/Nothing is filled or saved automatically/);
 const baseline=ui.find(node=>node.type==='input'&&node.props.type==='number'&&node.props.max==='2400');assert.equal(baseline.props.value,"90");assert.equal(f.writes.length,0);assert.equal(f.server.setup?.baselineWeeklyMinutes,90);
});


test("embedded profile and race saves stay in the conversation and report persisted changes",async()=>{
  const f=fixture();let notifications=0;
  f.server.races=[{id:"race-existing",name:"Existing race",distance:"10k",date:"2099-04-02T00:00:00.000Z",location:"Miami",priority:1}];
  let ui=f.mount("",{embedded:true,initialSection:"profile",onSaved:()=>{notifications++;}});await ui.flush();
  await ui.edit("onboard-pb-label","5K race");await ui.edit("onboard-pb-value","24");await ui.edit("onboard-pb-unit","min");
  await ui.click("Save new answers and continue");assert.equal(notifications,1);assert.deepEqual(ui.destination,[]);
  ui.unmount();ui=f.mount("",{embedded:true,initialSection:"race",onSaved:()=>{notifications++;}});await ui.flush();
  await ui.edit("onboard-field-8","Reviewed event");await ui.click("Update this race");
  assert.equal(notifications,2);assert.equal(f.server.races.length,1);assert.equal(f.server.races[0].name,"Reviewed event");assert.deepEqual(ui.destination,[]);
  await ui.click("4. Ready");await ui.click("Return to this conversation");
  assert.deepEqual(ui.destination,[]);assert.equal(notifications,3);assert.equal(f.writes.some(write=>write.path.includes("plan/generate")),false);
});
