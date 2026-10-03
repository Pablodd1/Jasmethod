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
// The persistent assistant route delegates to an owner-scoped service. Its
// POST stores a conversation/proposal only; confirmation is a separate endpoint.
function assistant(overrides: Record<string, any> = {}) {
 let externalCalls = 0;
 const service = {
  assistantAccess: async () => ({...user, timezone: "UTC"}),
  readConversationBody: async (req: Request) => req.json(),
  appendConversation: async (_actor: unknown, body: any) => ({ok:true, answer:body.message, trainingModified:false, mode:"kcoach_local", proposal:{status:"pending"}}),
  getConversation: async () => ({ok:true, conversation:{messages:[]}}),
  clearConversation: async () => ({ok:true, cleared:true}),
  ...overrides,
 };
 return {api:route("src/app/api/assistant/route.ts", {
  "@/lib/coach-conversation-service": service,
  "@/lib/access": {errorResponse:(error: any)=>Response.json({error:error.message},{status:error.status||500})},
 }, async()=>{externalCalls++;throw Error("Unexpected external network");}), externalCalls:()=>externalCalls};
}
const request=(body:any)=>new Request("https://jmm.test/api/assistant",{method:"POST",body:JSON.stringify(body)});

test("conversation POST delegates owner scope and cannot claim training was changed",async()=>{
 let observedActor: any, observedBody: any;
 const {api,externalCalls}=assistant({appendConversation:async(actor:any,body:any)=>{
  observedActor=actor; observedBody=body;
  return {ok:true,answer:"Review first",trainingModified:false,proposal:{status:"pending"}};
 }});
 const response=await api.POST(request({message:"make it a rest day",externalConsent:true}));
 const result=await response.json();assert.equal(result.trainingModified,false);assert.equal(result.proposal.status,"pending");
 assert.equal(observedActor.id,"athlete");assert.equal(observedBody.message,"make it a rest day");
 assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(externalCalls(),0);
});
test("assistant GET and DELETE preserve owner access boundary",async()=>{
 let calls=0;
 const {api}=assistant({assistantAccess:async()=>{throw Object.assign(new Error("Owner only"),{status:403});},getConversation:async()=>{calls++;},clearConversation:async()=>{calls++;}});
 assert.equal((await api.GET(new Request("https://jmm.test/api/assistant?athleteId=other"))).status,403);
 assert.equal((await api.DELETE(request({confirmed:true}))).status,403);assert.equal(calls,0);
});
test("failed assistant writes remain failures, never fabricated success",async()=>{
 const {api}=assistant({appendConversation:async()=>{throw Object.assign(new Error("Stale proposal"),{status:409});}});
 const response=await api.POST(request({message:"my hours are 4"}));assert.equal(response.status,409);const result=await response.json();assert.equal(result.ok,undefined);assert.match(result.error,/Stale/);
});
test("legacy command parsing still produces review-only proposals",()=>{
 const parsed=policy.trainingProposal("make it a rest day");assert.ok(parsed);assert.equal(parsed.requiresConfirmation,true);
 assert.throws(()=>policy.assistantInput({question:""}));
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
