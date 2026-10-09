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
function fixture() {
  const storage = new Map<string,string>();
  const server = {profile:{sex:"",weightKg:null,experience:"beginner",weeklyHours:8,goal:null} as Record<string,unknown>,setup:null as Record<string,unknown>|null,revision:"p1",setupRevision:null as string|null,races:[] as Record<string,unknown>[],conflict:false};
  const writes: {path:string;body:any}[] = [];
  const request: typeof fetch = async (input,init) => {
    const path = String(input), method = init?.method ?? "GET";
    if (method === "GET") {
      if (path === "/api/profile") return Response.json({...server,planningReadiness:{ready:false,missing:["Confirm available days"],review:[]}});
      if (path === "/api/races") return Response.json({races:server.races});
      if (path === "/api/connectors") return Response.json({providers:[]});
      return Response.json({observations:[],suggestions:[],history:{count:0,sports:[]}});
    }
    const body = JSON.parse(String(init?.body)); writes.push({path,body});
    if (path === "/api/profile") {
      if (server.conflict || body.expectedRevision !== server.revision) return Response.json({error:"conflict"},{status:409});
      const {expectedRevision,expectedSetupRevision,setup,setupSection,...fields} = body;
      Object.assign(server.profile,fields);
      if (setup) {server.setup=parsePlanningSetup(setup) as unknown as Record<string,unknown>;server.setupRevision=`s${writes.length}`;}
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
  function mount(query = "redo=1") {
    const cells:any[]=[]; const pending:(()=>unknown)[]=[]; let cursor=0,dirty=true,tree:unknown;
    const same=(a:unknown[]|undefined,b:unknown[]|undefined)=>!!a&&!!b&&a.length===b.length&&a.every((item,index)=>Object.is(item,b[index]));
    const react = {...React,
      useState(initial:unknown){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==="function"?(initial as ()=>unknown)():initial;return [cells[index],(value:unknown)=>{const next=typeof value==="function"?(value as (prior:unknown)=>unknown)(cells[index]):value;if(!Object.is(next,cells[index])){cells[index]=next;dirty=true;}}];},
      useRef(initial:unknown){const index=cursor++;return cells[index]??(cells[index]={current:initial});},
      useEffect(effect:()=>unknown,deps:unknown[]){const index=cursor++;if(!same(cells[index]?.deps,deps)){cells[index]?.cleanup?.();cells[index]={deps};pending.push(()=>{cells[index].cleanup=effect();});}},
      useCallback(callback:unknown,deps:unknown[]){const index=cursor++;if(!same(cells[index]?.deps,deps))cells[index]={deps,callback};return cells[index].callback;},
    };
    const destination:string[]=[];
    const router={push:(path:string)=>destination.push(path),replace:(path:string)=>destination.push(path)};
    const session={user:{id:"fixture-a",name:"Fixture Athlete",email:"athlete@example.invalid",language:"en",timezone:"America/New_York",onboarded:false},refresh:async()=>{}};
    const loadedModule={exports:{} as {DetailedAthleteSetup:()=>unknown}};
    const dependencies:Record<string,unknown>={
      react,"next/navigation":{useRouter:()=>router,useSearchParams:()=>new URLSearchParams(query)},
      "@/components/auth":{useAuth:()=>session},"@/components/gate":{ProtectedPage:({children}:any)=>children},
      "@/components/double-day-fields":{DoubleDayFields:()=>null},"@/components/travel-fields":{TravelFields:()=>null},
      "@/lib/profile-client":{saveReviewedProfile:(fields:Record<string,unknown>,revision:string|null)=>saveReviewedProfile(fields,revision,request)},
      "next/link":{__esModule:true,default:({children}:any)=>children},
    };
    vm.runInNewContext(code,{module:loadedModule,exports:loadedModule.exports,URLSearchParams,AbortSignal,fetch:request,sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},window:{location:{reload:()=>{}}},require:(name:string)=>name in dependencies?dependencies[name]:requireModule(name.startsWith("@/")?`${process.cwd()}/src/${name.slice(2)}`:name)});
    async function flush(){for(let attempts=0;attempts<20;attempts++){if(dirty){dirty=false;cursor=0;tree=loadedModule.exports.DetailedAthleteSetup();}while(pending.length)pending.shift()!();await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!pending.length)return;}throw Error("Unstable fixture render");}
    const find=(predicate:(node:Node)=>boolean)=>{const node=nodes(tree).find(predicate);assert.ok(node,"Expected control not found");return node;};
    return {flush,destination,text:()=>content(tree),input:(id:string)=>find(node=>node.props.id===id),button:(label:string)=>find(node=>node.type==="button"&&content(node.props.children).includes(label)),async click(label:string){await this.button(label).props.onClick();await flush();},async edit(id:string,value:string){this.input(id).props.onChange({target:{value}});await flush();},unmount(){for(const cell of cells)if(cell&&typeof cell.cleanup==="function")cell.cleanup();}};
  }
  return {mount,server,writes,storage};
}

test("real onboarding handlers keep unsaved entries across navigation/reload, then confirm a server save", async()=>{
  const f=fixture();let ui=f.mount();await ui.flush();
  assert.match(ui.text(),/Skip connections and continue manually/);
  await ui.click("Skip connections");await ui.edit("onboard-field-4","63.2");
  await ui.click("3. Goals");await ui.click("2. Profile");assert.equal(ui.input("onboard-field-4").props.value,"63.2");
  ui.unmount();ui=f.mount();await ui.flush();assert.equal(ui.input("onboard-field-4").props.value,"63.2");
  await ui.click("Save profile");assert.equal(f.writes.length,1);assert.equal(f.writes[0].body.weightKg,"63.2");assert.match(ui.text(),/Goals and optional race/);
  ui.unmount();ui=f.mount("redo=1&step=profile");await ui.flush();assert.equal(ui.input("onboard-field-4").props.value,"63.2");
});
test("conflicting saves stay on the section without replacing a revision or claiming success", async()=>{
  const f=fixture();const ui=f.mount("redo=1&step=profile");await ui.flush();await ui.edit("onboard-field-4","61");f.server.conflict=true;
  await ui.click("Save profile");assert.match(ui.text(),/Nothing was resubmitted/);assert.equal(f.writes.length,1);assert.equal(f.server.profile.weightKg,null);assert.equal(ui.input("onboard-field-4").props.value,"61");
});
test("saved optional goals hydrate in a new tab without requiring adult/safety confirmation", async()=>{
  const f=fixture();let ui=f.mount("redo=1&step=race");await ui.flush();await ui.edit("onboard-field-5","advanced");await ui.edit("onboard-field-6","5");await ui.edit("onboard-field-7","run-only");await ui.click("6 months");await ui.click("Save goals and race");
  assert.equal(f.server.setup?.profileConfirmed,false);assert.deepEqual(f.server.setup?.profileAnswers,{experience:true,weeklyHours:true});
  ui.unmount();f.storage.clear();ui=f.mount("redo=1&step=race");await ui.flush();assert.equal(ui.input("onboard-field-5").props.value,"advanced");assert.equal(ui.input("onboard-field-6").props.value,"5");assert.equal(ui.button("6 months").props["aria-pressed"],true);
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
