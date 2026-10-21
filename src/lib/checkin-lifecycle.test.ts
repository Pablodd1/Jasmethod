import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import React from "react";
import ts from "typescript";
import {checkinDraftKey,emptyCheckinAnswers} from "./checkin-draft";
const requireModule=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync("src/app/checkin/page.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
type Node=React.ReactElement<any>;
function nodes(value:unknown):Node[]{if(Array.isArray(value))return value.flatMap(nodes);if(!React.isValidElement(value))return [];const node=value as Node;return [node,...nodes(node.props.children)];}
function content(value:unknown):string{if(value==null||typeof value==="boolean")return "";if(Array.isArray(value))return value.map(content).join("");if(React.isValidElement(value))return content((value as Node).props.children);return String(value);}
function fixture(){
  const storage=new Map<string,string>(),writes:any[]=[];
  const state={answers:JSON.stringify({sleep:5,sick:false,newPain:false,urgentSymptoms:false,availableMin:60}),failSync:false,deferInitial:false,releaseGet:null as (()=>void)|null};
  function mount(id="athlete-a",language="en"){
    const cells:any[]=[],pending:(()=>void)[]=[];let cursor=0,dirty=true,tree:unknown;
    const same=(a:any[],b:any[])=>a&&b&&a.length===b.length&&a.every((item,index)=>Object.is(item,b[index]));
    const react={...React,useState(initial:any){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==="function"?initial():initial;return [cells[index],(value:any)=>{const next=typeof value==="function"?value(cells[index]):value;if(!Object.is(next,cells[index])){cells[index]=next;dirty=true;}}];},useRef(initial:any){const index=cursor++;return cells[index]??(cells[index]={current:initial});},useEffect(effect:any,deps:any[]){const index=cursor++;if(!same(cells[index]?.deps,deps)){cells[index]?.cleanup?.();cells[index]={deps};pending.push(()=>{cells[index].cleanup=effect();});}}};
    const user={id,language,timezone:"UTC"};
    const request:typeof fetch=async(input,init)=>{
      const path=String(input);
      if(path==="/api/connectors")return Response.json({providers:[{id:"garmin",status:"connected"}]});
      if(path==="/api/connectors/sync")return Response.json(state.failSync?{error:"Sync failed"}:{synced:[{provider:"garmin",ok:true}]},{status:state.failSync?503:200});
      if(init?.method==="POST"){const body=JSON.parse(String(init.body));writes.push({id,body});state.answers=JSON.stringify({...body,availableMin:Number(body.availableMinutes)});return Response.json({ok:true,checkin:{answers:state.answers},adaptation:{verdict:"rest",safetyStatus:"unknown",scoreAvailable:false,message:"Review required"},prescriptions:[]});}
      if(state.deferInitial)await new Promise<void>(resolve=>{state.releaseGet=resolve;});
      return Response.json({checkin:{answers:state.answers},localToday:"2026-10-21",feedbackDate:"2026-10-20",previousSessions:[]});
    };
    const loaded={exports:{}as any};
    const deps:Record<string,unknown>={react,"@/components/auth":{useAuth:()=>({user})},"@/components/gate":{ProtectedPage:({children}:any)=>children},"@/components/cognitive-check":{CognitiveCheck:()=>null},"next/navigation":{useRouter:()=>({})}};
    vm.runInNewContext(code,{module:loaded,exports:loaded.exports,require:(name:string)=>name in deps?deps[name]:requireModule(name.startsWith("@/")?`${process.cwd()}/src/${name.slice(2)}`:name),fetch:request,sessionStorage:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value),removeItem:(key:string)=>storage.delete(key)},document:{getElementById:()=>null},window:{},setTimeout,clearTimeout,console});
    async function flush(){for(let attempt=0;attempt<30;attempt++){if(dirty){dirty=false;cursor=0;const wrapper=loaded.exports.default();tree=wrapper.type();}while(pending.length)pending.shift()!();await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!pending.length)return;}throw Error("Unstable fixture");}
    const find=(predicate:(node:Node)=>boolean)=>{const result=nodes(tree).find(predicate);assert.ok(result,"Expected control not found");return result;};
    return {flush,input:(name:string)=>find(node=>node.props.id===name),text:()=>content(tree),async edit(name:string,value:string){this.input(name).props.onChange({target:{value}});await flush();},async sync(){await find(node=>node.type==="button"&&content(node.props.children).includes("Sync now")).props.onClick();await flush();},async submit(){await find(node=>node.type==="form"&&nodes(node.props.children).some(child=>child.props.id==="answer-sleep")).props.onSubmit({preventDefault(){}});await flush();},unmount(){for(const cell of cells)cell?.cleanup?.();}};
  }
  return {mount,storage,state,writes};
}

test("actual check-in handlers retain draft symptoms and zero time through sync/reload, then persist exactly submitted answers",async()=>{
  const f=fixture();let ui=f.mount();await ui.flush();assert.equal(ui.input("answer-sick").props.value,"false");
  await ui.edit("answer-sick","true");await ui.edit("answer-availableMinutes","0");await ui.edit("answer-sleep","");
  await ui.sync();assert.equal(ui.input("answer-sick").props.value,"true");assert.equal(ui.input("answer-availableMinutes").props.value,"0");assert.equal(ui.input("answer-sleep").props.value,"");
  ui.unmount();ui=f.mount();await ui.flush();assert.match(ui.text(),/unfinished draft was restored/);assert.equal(ui.input("answer-sick").props.value,"true");
  const other=f.mount("athlete-b","es");await other.flush();assert.equal(other.input("answer-sick").props.value,"false");assert.doesNotMatch(other.text(),/Borrador de hoy restaurado/);other.unmount();
  f.state.failSync=true;await ui.sync();assert.equal(ui.input("answer-sick").props.value,"true");assert.equal(f.writes.length,0);
  await ui.submit();assert.equal(f.writes.length,1);assert.equal(f.writes[0].id,"athlete-a");assert.equal(f.writes[0].body.sick,true);assert.equal(f.writes[0].body.availableMinutes,"0");assert.equal(f.storage.size,0);
  ui.unmount();ui=f.mount();await ui.flush();assert.equal(ui.input("answer-sick").props.value,"true");assert.equal(ui.input("answer-availableMinutes").props.value,0);
});

test("new live edits beat an older tab draft when the first check-in response arrives late",async()=>{
  const f=fixture();f.storage.set(checkinDraftKey("athlete-a"),JSON.stringify({version:1,userId:"athlete-a",dateLocal:"2026-10-21",savedBasis:f.state.answers,answers:{...emptyCheckinAnswers(),sick:false,availableMinutes:60,energy:2},dirty:["sick","availableMinutes","energy"],correctImported:false}));
  f.state.deferInitial=true;const ui=f.mount();await ui.flush();
  await ui.edit("answer-sick","true");await ui.edit("answer-availableMinutes","0");
  f.state.deferInitial=false;assert.ok(f.state.releaseGet);f.state.releaseGet();await ui.flush();
  assert.equal(ui.input("answer-sick").props.value,"true");assert.equal(ui.input("answer-availableMinutes").props.value,"0");assert.equal(ui.input("answer-energy").props.value,2,"untouched fields still resume from the saved draft");
  const savedDraft=JSON.parse(f.storage.get(checkinDraftKey("athlete-a"))!);assert.equal(savedDraft.answers.sick,true);assert.equal(savedDraft.answers.availableMinutes,"0");
});
