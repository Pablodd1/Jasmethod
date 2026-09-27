import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import * as policy from "./assistant-policy";

function route(path:string, modules:Record<string,any>, fetcher:any, env:Record<string,string>={}) {
 const output=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 runInNewContext(output,{module,exports:module.exports,require:(name:string)=>{
  if(name==="next/server")return {NextResponse:Response};
  if(name in modules)return modules[name];
  throw Error(`Unexpected dependency ${name}`);
 },Response,Request,URL,AbortSignal,Date,process:{env},fetch:fetcher,console});
 return module.exports as any;
}
const user={id:"athlete",name:"SENSITIVE_NAME",language:"en",profile:{ftp:999,secret:"PROVIDER_VALUE"}};
function assistant(fetcher:any,env:Record<string,string>={}) {
 return route("src/app/api/assistant/route.ts",{
  "@/lib/auth":{getCurrentUser:async()=>user},
  "@/lib/assistant-policy":policy,
  "@/lib/gemini-response":{geminiAnswer:(x:any)=>x.answer||"",geminiGenerationConfig:()=>({temperature:0})},
 },fetcher,env);
}
const request=(body:any)=>new Request("https://jmm.test/api/assistant",{method:"POST",body:JSON.stringify(body)});

test("conversation commands produce a proposal with zero DB or external model access",async()=>{
 let calls=0;
 const api=assistant(async()=>{calls++;throw Error("Unexpected network");},{EXTERNAL_AI_ENABLED:"true",GEMINI_API_KEY:"test-key"});
 const response=await api.POST(request({question:"make it a rest day",externalConsent:true}));
 const result=await response.json();
 assert.equal(result.trainingModified,false);
 assert.equal(result.mode,"local_proposal");
 assert.equal(result.proposal.requiresConfirmation,true);
 assert.equal(calls,0);
});
test("external answer requires both operator flag and explicit per-question consent",async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({answer:"External answer"});};
 for(const [env,consent] of [[{EXTERNAL_AI_ENABLED:"true",GEMINI_API_KEY:"test-key"},false],[{GEMINI_API_KEY:"test-key"},true]] as const){
  const r=await assistant(fetcher,env).POST(request({question:"How do I use the calendar?",externalConsent:consent}));
  assert.equal((await r.json()).mode,"local_help");
 }
 assert.equal(calls,0);
});
test("external payload contains only manual question and fixed instructions, never saved athlete data",async()=>{
 let captured="";
 const api=assistant(async(_url:string,init:any)=>{captured=init.body;return Response.json({answer:"General guidance"});},{EXTERNAL_AI_ENABLED:"true",GEMINI_API_KEY:"test-key"});
 const r=await api.POST(request({question:"How do I use the calendar?",externalConsent:true,profile:{extra:"UNTRUSTED_EXTRA_CONTEXT"}}));
 assert.equal((await r.json()).mode,"external_manual_question");
 const payload=JSON.parse(captured);
 assert.equal(payload.contents[0].parts[0].text,"How do I use the calendar?");
 assert.doesNotMatch(captured,/SENSITIVE_NAME|PROVIDER_VALUE|UNTRUSTED_EXTRA_CONTEXT|999/);
});
test("race brief remains deterministic even when external model keys and flags are configured",async()=>{
 let calls=0;
 const api=route("src/app/api/race-forecast/brief/route.ts",{
  "@/lib/auth":{getCurrentUser:async()=>({...user,timezone:"UTC"})},
  "@/lib/race-forecast-service":{buildForecastBundle:async()=>({forecast:{restricted:"PROVIDER_VALUE"},race:null,weather:null})},
  "@/lib/race-brief":{buildRaceBrief:()=>"Local template"},
 },async()=>{calls++;throw Error("Unexpected network");},{EXTERNAL_AI_ENABLED:"true",GEMINI_API_KEY:"test-key"});
 const result=await (await api.GET(new Request("https://jmm.test/api/race-forecast/brief"))).json();
 assert.equal(result.brief,"Local template");assert.equal(result.source,"template");assert.equal(result.externalAI,false);assert.equal(calls,0);
});
