import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { analyzeFoodPhoto } from "./nutrition-photo";
import { extractImageCandidates } from "./coach-image";
import { parseConversationInput } from "./coach-conversation";
import { coachTextAnswer } from "./coach-text-provider";
const env={EXTERNAL_AI_ENABLED:"true",OPENAI_API_KEY:"synthetic-only"};
async function image(){const bytes=await sharp({create:{width:2,height:2,channels:3,background:"white"}}).png().toBuffer();return {mimeType:"image/png" as const,dataBase64:bytes.toString("base64")};}
test("OpenAI missing, refused, wrong-provider or wrong-source consent makes zero provider calls",async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error("must not send");};
 for(const patch of [{},{photoConsent:false},{photoConsent:"true"},{photoConsent:true,photoProviderConsent:"google_gemini"},{photoConsent:true,photoProviderConsent:"openai",photoSource:"device"},{photoConsent:true,photoProviderConsent:"openai",photoSource:"unknown"}])await assert.rejects(analyzeFoodPhoto({image:"private pixels",...patch},"en",{key:"synthetic",fetch:fetcher}));
 assert.equal(calls,0);
});
test("a single explicitly consented food photo sends only stripped image and food instructions to OpenAI",async()=>{
 const raw=await image();let calls=0;
 const result=await analyzeFoodPhoto({image:`data:${raw.mimeType};base64,${raw.dataBase64}`,photoConsent:true,photoProviderConsent:"openai",photoSource:"food_photo"},"es",{key:"synthetic",fetch:async(url,init)=>{
  calls++;assert.equal(String(url),"https://api.openai.com/v1/chat/completions");assert.ok(!String(url).includes("synthetic"));assert.equal(new Headers(init?.headers).get("authorization"),"Bearer synthetic");
  const body=JSON.parse(String(init?.body));assert.equal(body.store,false);assert.equal(body.model,"gpt-4.1-mini-2025-04-14");assert.equal(body.messages.length,1);assert.match(body.messages[0].content[0].text,/Spanish/);assert.match(body.messages[0].content[1].image_url.url,/^data:image\/png;base64,/);
  return Response.json({choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({foods:[{name:"Comida",grams:20}],calories:0,proteinG:0,carbsG:0,fatG:0,notes:"Estimate"})}}]});
 }});assert.equal(calls,1);assert.equal(result.analysis.calories,0);assert.equal(result.analysis.food,"Comida");
});
test("device, imported, unknown, missing and forged screenshot origins are blocked before decoding or OpenAI",async()=>{
 let calls=0;
 for(const source of [undefined,"device","imported","unknown","garmin","manual"]){
  assert.throws(()=>parseConversationInput({message:"Review",image:{mimeType:"image/png",dataBase64:"AAAA"},imageSource:source,imageConsent:true,imageProviderConsent:"openai"}));
  await assert.rejects(extractImageCandidates({}, {localToday:"2026-10-25",imageConsent:true,imageProviderConsent:"openai",imageSource:source as any},async()=>{calls++;return [];}));
 }assert.equal(calls,0);
});
test("unlabelled current text and arbitrary device-derived facts/history never enter an external education request",async()=>{
 let sent="";
 const result=await coachTextAnswer({message:"UNLABELLED_PRIVATE_987654321",localRuleId:"coach-conversation-v1:education-rpe",externalConsent:true,textProviderConsent:"openai",aiReplyMemoryConsent:true,hasCandidates:false,
  context:{localToday:"2026-10-25",language:"es",profile:{goal:"PRIVATE_GOAL",weightKg:93.123},recentMessages:[{role:"user",content:"PAST_PRIVATE"},{role:"assistant",content:"DERIVED_PRIVATE",source:"openai",externalContextVersion:"openai-personal-v1"}],externalFacts:{version:"openai-generic-education-v3",profile:{goal:"DEVICE_PRIVATE"},recentManualActuals:[{source:"manual_unmatched_activity",actualMinutes:876.54}]} as any}},
  {env,fetch:async(_url,init)=>{sent=String(init?.body);return Response.json({choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({answer:"El esfuerzo percibido es una valoración subjetiva.",sourceIds:[],changes:[]})}}]});}});
 assert.equal(result.status,"answered");for(const value of ["UNLABELLED_PRIVATE","987654321","PRIVATE_GOAL","93.123","PAST_PRIVATE","DERIVED_PRIVATE","DEVICE_PRIVATE","876.54"])assert.ok(!sent.includes(value),value);
 const payload=JSON.parse(JSON.parse(sent).messages[1].content);assert.deepEqual(payload.context,{version:"openai-generic-education-v3",language:"es"});assert.equal(payload.message,undefined);assert.deepEqual(payload.changeFields,[]);
});


test("legacy provider credentials and consent cannot enable OpenAI or trigger a fallback",async()=>{
 let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error("must not send");};
 const legacy={EXTERNAL_AI_ENABLED:"true",DEEPSEEK_API_KEY:"synthetic-retired",GEMINI_API_KEY:"synthetic-retired"};
 for(const provider of ["deepseek","google_gemini","gemini"]) {
  assert.throws(()=>parseConversationInput({message:"Explain RPE",externalConsent:true,textProviderConsent:provider}));
 }
 const result=await coachTextAnswer({message:"Explain RPE",localRuleId:"coach-conversation-v1:education-rpe",context:{localToday:"2026-10-25",language:"en"},externalConsent:true,textProviderConsent:"openai",hasCandidates:false},{env:legacy,fetch:fetcher});
 assert.equal(result.status,"not_configured");assert.equal(calls,0);
});

test("food-photo upstream failures and refusals make one OpenAI request and never switch providers",async()=>{
 const raw=await image(),body={image:`data:${raw.mimeType};base64,${raw.dataBase64}`,photoConsent:true,photoProviderConsent:"openai",photoSource:"food_photo"};
 for(const response of [Response.json({}, {status:429}),Response.json({}, {status:503}),Response.json({choices:[{finish_reason:"length",message:{role:"assistant",content:"{}"}}]}),Response.json({choices:[{finish_reason:"stop",message:{role:"assistant",refusal:"refused",content:"{}"}}]}),new Response("x".repeat(65537),{headers:{"content-type":"application/json"}})]) {
  let calls=0;await assert.rejects(analyzeFoodPhoto(body,"en",{key:"synthetic",fetch:async(url)=>{calls++;assert.equal(String(url),"https://api.openai.com/v1/chat/completions");return response;}}));assert.equal(calls,1);
 }
});
