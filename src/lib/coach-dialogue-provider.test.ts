import test from "node:test";
import assert from "node:assert/strict";
import { coachDialogueAnswer, manualDialogueAllowed, manualDialogueHistory, MANUAL_DIALOGUE_POLICY } from "./coach-dialogue-provider";
import { parseConversationInput } from "./coach-conversation";
const env = { EXTERNAL_AI_ENABLED:"true", OPENAI_API_KEY:"synthetic-test-key", OPENAI_TEXT_MODEL:"gpt-4.1-mini-2025-04-14" };
const consent = { manualDialogueConsent:true,messageOrigin:"athlete_authored",externalConsent:true,textProviderConsent:"openai" };
const input = { ...consent,message:"I want to develop my endurance while working around my availability. What should we review first?",language:"en",units:"imperial",history:[] as {role:"user"|"assistant";content:string}[] };
const response = (answer="Let's review your current goal and available training days together. What is the main event you want to prepare for?",action="review_profile") => Response.json({choices:[{finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({answer,action})}}]});
test("personal dialogue requires named consent and athlete-authored origin; imported and missing origins never dispatch",async()=>{
 let calls=0;const fetcher=async()=>{calls++;return response();};
 for(const change of [{manualDialogueConsent:false},{externalConsent:false},{textProviderConsent:undefined},{messageOrigin:"device"},{messageOrigin:undefined},{image:{}}]){
  assert.equal((await coachDialogueAnswer({...input,...change},{env,fetch:fetcher})).status,"policy_local");
 }
 for(const message of ["Analyze my Garmin records", "Review this imported summary", "https://example.invalid/export", 'Review {"hrv":55}'])assert.equal((await coachDialogueAnswer({...input,message},{env,fetch:fetcher})).status,"policy_local");
 assert.equal(calls,0);
 assert.throws(()=>parseConversationInput({message:"My question",manualDialogueConsent:true,messageOrigin:"imported",externalConsent:true,textProviderConsent:"openai"}));
 assert.throws(()=>parseConversationInput({message:"My question",manualDialogueConsent:true,messageOrigin:"athlete_authored"}));
});
test("personal dialogue has structurally isolated memory: legacy, local, unknown-origin and another generation are excluded",()=>{
 const meta={manualDialoguePolicy:MANUAL_DIALOGUE_POLICY,manualDialogueGeneration:4,manualDialogueConsent:true,messageOrigin:"athlete_authored"};
 const rows=[{role:"assistant",content:"IMPORTED_SECRET",metadata:JSON.stringify({contextVersion:"openai-generic-education-v3"})},{role:"user",content:"OLD_GENERATION",metadata:JSON.stringify({...meta,manualDialogueGeneration:3})},{role:"user",content:"UNKNOWN_ORIGIN",metadata:JSON.stringify({...meta,messageOrigin:"unknown"})},{role:"user",content:"My goal is endurance",metadata:JSON.stringify(meta)},{role:"assistant",content:"What availability can you commit to?",metadata:JSON.stringify(meta)}];
 assert.deepEqual(manualDialogueHistory(rows,4).map(row=>row.content),["My goal is endurance","What availability can you commit to?"]);
 assert.equal(manualDialogueAllowed(consent,"WHOOP summary"),false);
});
test("OpenAI receives only explicit own messages and safe channel history, never supplied profile/tool context; store is false",async()=>{
 let calls=0;
 const result=await coachDialogueAnswer({...input,profile:{weightKg:"PROFILE_CANARY"},session:{title:"DEVICE_CANARY"},history:[{role:"user",content:"My goal is endurance"}]} as unknown as typeof input,{env,fetch:async(url,init)=>{
  calls++;assert.equal(url,"https://api.openai.com/v1/chat/completions");assert.equal(init?.redirect,"error");const body=JSON.parse(init?.body as string);assert.equal(body.store,false);assert.equal(body.model,env.OPENAI_TEXT_MODEL);assert.doesNotMatch(init?.body as string,/PROFILE_CANARY|DEVICE_CANARY/);assert.equal(body.messages.at(-1).content,input.message);return response();
 }});assert.equal(calls,1);assert.equal(result.status,"answered");assert.equal(result.dialogueAction,"review_profile");
});
test("missing configuration, failed provider, invalid actions and false receipts never become successful coaching or fallback",async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error("synthetic outage");};
 assert.equal((await coachDialogueAnswer(input,{env:{...env,OPENAI_API_KEY:undefined},fetch:fetcher})).status,"not_configured");assert.equal(calls,0);
 assert.equal((await coachDialogueAnswer(input,{env,fetch:fetcher})).status,"unavailable");assert.equal(calls,1);
 for(const output of [response("I have saved your new plan."),response("You are safe to train."),response("Run 20 minutes hard."),response("Your FTP is 330 watts."),response("Review your profile","delete_everything")])assert.equal((await coachDialogueAnswer(input,{env,fetch:async()=>output})).status,"unavailable");
});
