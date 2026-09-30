import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";
import * as policy from "./assistant-policy";

function route(path:string, modules:Record<string,any>, fetcher:any, env:Record<string,string>={}) {
 const output=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const sandbox={exports:{}};
 runInNewContext(output,{module:sandbox,exports:sandbox.exports,require:(name:string)=>{
  if(name==="next/server")return {NextResponse:Response};
  if(name in modules)return modules[name];
  throw Error(`Unexpected dependency ${name}`);
 },Response,Request,URL,AbortSignal,Date,process:{env},fetch:fetcher,console});
 return sandbox.exports as any;
}
const user={id:"athlete",name:"SENSITIVE_NAME",language:"en",profile:{ftp:999,secret:"PROVIDER_VALUE"}};
// Grounded chat context fixture — server-side digest only (no provider
// payloads, no tokens). The route assembles it from the athlete records.
const chatCtx={
 name:"Test Athlete",language:"en",
 profileSummary:"goal: olympic · level: amateur",
 anchorsSummary:"FTP 250W · LTHR 170",
 readinessSummary:"today's verdict: full (factor 1)",
 metricsSummary:"latest device data: HRV 60ms, recovery 80%",
 trainingSummary:"active plan \"Olympic\" (12 weeks)",
 historySummary:"last 30d: 12 completed sessions, 9h total",
 raceSummary:"next race: Daytona Tri, 30 days out",
 todaySummary:"Bike: Tempo — 90min Z3",
};
function assistant(fetcher:any,env:Record<string,string>={}) {
 return route("src/app/api/assistant/route.ts",{
  "@/lib/auth":{getCurrentUser:async()=>({...user,timezone:"UTC"})},
  "@/lib/assistant-policy":policy,
  "@/lib/gemini-response":{geminiAnswer:(x:any)=>x.answer||"",geminiGenerationConfig:()=>({temperature:0})},
  "@/lib/kcoach-chat":{
   buildChatContext:async()=>chatCtx,
   localGroundedAnswer:(q:string,c:any)=>`local grounded: ${q} | ${c.raceSummary}`,
   groundedQuestionPayload:(q:string,c:any)=>({system_instruction:{parts:[{text:"KCoach grounded. Context: "+c.raceSummary}]},contents:[{parts:[{text:q}]}]}),
  },
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
test("external answer requires both operator flag and explicit per-question consent — without it the LOCAL grounded answer serves",async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({answer:"External answer"});};
 for(const [env,consent] of [[{EXTERNAL_AI_ENABLED:"true",GEMINI_API_KEY:"test-key"},false],[{GEMINI_API_KEY:"test-key"},true]] as const){
  const r=await assistant(fetcher,env).POST(request({question:"How is my race prediction?",externalConsent:consent}));
  const j=await r.json();
  assert.equal(j.mode,"kcoach_local");
  assert.match(j.answer,/local grounded/);
 }
 assert.equal(calls,0);
});
test("consented external payload carries the question + context digest, never raw provider data or client-supplied fields",async()=>{
 let captured="";
 const api=assistant(async(_url:string,init:any)=>{captured=init.body;return Response.json({answer:"Grounded answer"});},{EXTERNAL_AI_ENABLED:"true",GEMINI_API_KEY:"test-key"});
 const r=await api.POST(request({question:"How is my race prediction?",externalConsent:true,profile:{extra:"UNTRUSTED_EXTRA_CONTEXT"}}));
 assert.equal((await r.json()).mode,"kcoach_ai");
 const payload=JSON.parse(captured);
 assert.equal(payload.contents[0].parts[0].text,"How is my race prediction?");
 assert.match(captured,/Daytona Tri/); // race context IS included (grounded chat)
 assert.doesNotMatch(captured,/PROVIDER_VALUE|UNTRUSTED_EXTRA_CONTEXT|999/); // raw client fields and device payloads are not
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
