import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as setup from "./planning-setup";
import * as entry from "./first-plan-entry";

function fixture(){
  let index=0,effect:(()=>void|(()=>void))|null=null;
  const values:any[]=[],calls:any[]=[];
  const state={user:{id:"athlete-a",onboarded:true,profile:{goal:"run-only"}},pathname:"/today",search:"",response:Promise.resolve({ok:true,json:async()=>({ok:true,plan:{status:"existing",planId:"synthetic-plan",created:false}})}) as Promise<any>};
  const deps:Record<string,any>={
    "react":{useState:(initial:any)=>{const i=index++;if(!(i in values))values[i]=initial;return[values[i],(v:any)=>{values[i]=typeof v==="function"?v(values[i]):v;}];},useEffect:(callback:any)=>{effect=callback;}},
    "react/jsx-runtime":{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props}),Fragment:"fragment"},
    "./auth":{useAuth:()=>({user:state.user,language:"en"})},"next/navigation":{usePathname:()=>state.pathname},"@/lib/planning-setup":setup,"@/lib/first-plan-entry":entry,
  };
  const mod:any={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/components/first-plan-bootstrap.tsx","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,URLSearchParams,AbortController,setTimeout,clearTimeout,window:{location:{get search(){return state.search;}}},fetch:async(...args:any[])=>{calls.push(args);return state.response;},require:(name:string)=>{if(!(name in deps))throw Error(name);return deps[name];}});
  return{state,calls,render:()=>{index=0;return mod.exports.FirstPlanBootstrap({children:"training-children"});},runEffect:()=>effect?.(),flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test("training children wait for confirmed persistence and a failed request shows retry instead of fake saved state",async()=>{
  const f=fixture();assert.equal(f.render().props.role,"status");f.runEffect();await f.flush();assert.equal(f.render().props.children,"training-children");
  const failed=fixture();failed.state.response=Promise.resolve({ok:false,json:async()=>({error:"failure"})});failed.render();failed.runEffect();await failed.flush();assert.equal(failed.render().props.role,"alert");
  assert.equal(failed.calls[0][0],"/api/plan/ensure");assert.equal(failed.calls[0][1].body,"{}");
});
test("unsupported sport, profile settings and cross-athlete views never send automatic creation",()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>{f.state.user.profile.goal="unknown";},(f:ReturnType<typeof fixture>)=>{f.state.pathname="/settings";},(f:ReturnType<typeof fixture>)=>{f.state.search="?athleteId=another-athlete";}]){
    const f=fixture();change(f);f.render();f.runEffect();assert.equal(f.calls.length,0);assert.equal(f.render().props.children,"training-children");
  }
});
test("late response from previous athlete cannot settle the next athlete's training entry",async()=>{
  const f=fixture();let resolve!:(v:any)=>void;f.state.response=new Promise(r=>resolve=r);
  f.render();const cleanup=f.runEffect();if(typeof cleanup==="function")cleanup();f.state.user={...f.state.user,id:"athlete-b"};
  resolve({ok:true,json:async()=>({ok:true,plan:{status:"existing"}})});await f.flush();assert.equal(f.render().props.role,"status");
});
test("invented statuses and missing plan IDs never release training children",async()=>{
  for(const plan of [{status:"madeup",planId:"p",created:true},{status:"existing",created:false}]){
    const f=fixture();f.state.response=Promise.resolve({ok:true,json:async()=>({ok:true,plan})});f.render();f.runEffect();await f.flush();assert.equal(f.render().props.role,"alert");
  }
});
