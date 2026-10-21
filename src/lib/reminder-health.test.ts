import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {manualEmailConfigured,MANUAL_EMAIL_CONSENT} from "./manual-workout-email";
import {manualEmailLanguage} from "./manual-workout-email-locale";
import {workoutEmailBlockers} from "./reminder-readiness";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {WorkoutEmailReadiness,isWorkoutEmailHealth} from "../components/workout-email-readiness";

function load(file:string,deps:Record<string,unknown>,globals:Record<string,unknown>={}){
  const mod={exports:{}as any},code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require:(name:string)=>{assert.ok(name in deps,`Unexpected dependency ${name}; no external transport is allowed`);return deps[name];},Response,Request,URL,...globals});return mod.exports;
}
function fixture(){
  const env={NODE_ENV:"test" as const,ENABLE_MANUAL_WORKOUT_EMAIL:"true",SMTP_HOST:"smtp.example.invalid",SMTP_FROM:"fixture@example.invalid",MANUAL_WORKOUT_EMAIL_ORIGIN:"https://example.invalid",CRON_SECRET:"fixture-only"};
  const users={a:{id:"a",email:"a@example.invalid",timezone:"America/New_York",language:"en"},b:{id:"b",email:"b@example.invalid",timezone:"Europe/Madrid",language:"es"}};
  const state={user:users.a as typeof users.a|null,storageError:null as string|null,databaseError:false,reads:[] as any[]};
  class ApiError extends Error{constructor(message:string,public status=400){super(message);}}
  const actor=load("src/lib/coaching-route.ts",{"./auth":{getCurrentUser:async()=>state.user},"./access":{ApiError,errorResponse:(error:ApiError)=>Response.json({error:error.message},{status:error.status??500})},"./ratelimit":{},"./coaching-communication":{}});
  const prefs={a:{enabled:true,recipient:users.a.email,verifiedAt:new Date(),consentAt:new Date(),consentVersion:MANUAL_EMAIL_CONSENT,daily:true,revisions:true,timezone:users.a.timezone,minuteOfDay:300},b:{enabled:false,recipient:users.b.email,verifiedAt:null,consentAt:null,consentVersion:null,daily:false,revisions:false,timezone:users.b.timezone,minuteOfDay:360}};
  const rows=["queued","accepted","unknown","sending","rejected","cancelled","superseded"].map((status,i)=>({id:`a-${i}`,userId:"a",sessionId:`a-session-${i}`,kind:"ready",status,revision:"a".repeat(64),receiptId:status==="accepted"?"fixture-receipt":null,attemptedAt:null,acceptedAt:status==="accepted"?new Date("2026-10-21T09:00Z"):null,createdAt:new Date("2026-10-21T09:00Z")}));
  const scoped=async(q:any)=>{state.reads.push(q);assert.equal(q.where.userId,state.user?.id);if(state.databaseError)throw {code:"P1001"};return q.where.userId;};
  const emailScoped=async(q:any)=>{const id=await scoped(q);if(state.storageError)throw {code:state.storageError};return id as keyof typeof prefs;};
  const route=load("src/app/api/reminders/health/route.ts",{
    "@/lib/db":{prisma:{reminderDelivery:{findMany:async(q:any)=>{await scoped(q);return [];}},coachingPrompt:{findMany:async(q:any)=>{await scoped(q);return [];}},manualWorkoutEmailPreference:{findUnique:async(q:any)=>prefs[await emailScoped(q)]},manualWorkoutEmailOutbox:{findMany:async(q:any)=>{const id=await emailScoped(q);assert.equal(q.take,10);return rows.filter(row=>row.userId===id);}}}},
    "@/lib/coaching-route":actor,"@/lib/telegram-coaching-transport":{telegramCoachingConfigured:()=>false},"@/lib/coaching-communication":{mockCoachingEnabled:()=>true},
    "@/lib/manual-workout-email":{manualEmailConfigured:()=>manualEmailConfigured(env),MANUAL_EMAIL_CONSENT},"@/lib/manual-workout-email-locale":{manualEmailLanguage},"@/lib/reminder-readiness":{workoutEmailBlockers},
  },{process:{env}});
  return {state,env,users,get:(query="")=>route.GET(new Request(`https://example.invalid/api/reminders/health${query}`))};
}

test("actual health route independently reports enabled SMTP/workout email and real outbox status semantics without sending",async()=>{
  const f=fixture(),response=await f.get(),body=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"private, no-store");
  assert.equal(body.smtpConfigured,true);assert.equal(body.telegramConfigured,false);assert.deepEqual(body.workoutEmail.blockers,[]);
  assert.deepEqual(body.workoutEmail.statuses,{queued:1,providerAccepted:1,outcomeUnknown:2,rejected:1});assert.equal(body.workoutEmail.received,null);assert.equal(body.workoutEmail.scheduler,"/api/cron/worker");
  assert.ok(isWorkoutEmailHealth(body.workoutEmail));assert.ok(body.workoutEmail.recentAttempts.every((row:any)=>row.id.startsWith("a-")));
  assert.equal(Object.hasOwn(body,"SMTP_HOST"),false);assert.doesNotMatch(JSON.stringify(body),/smtp\.example|fixture-only|a@example/);
});

test("health enforces actual actor scope for two athletes, rejects a foreign target and requires sign-in before reading",async()=>{
  const f=fixture();f.state.user=f.users.b;const response=await f.get(),body=await response.json();assert.equal(response.status,200);
  assert.equal(body.workoutEmail.timezone,"Europe/Madrid");assert.equal(body.workoutEmail.recentAttempts.length,0);assert.ok(body.workoutEmail.blockers.includes("email_paused"));
  f.state.reads=[];assert.equal((await f.get("?athleteId=a")).status,403);assert.equal(f.state.reads.length,0);
  f.state.user=null;assert.equal((await f.get()).status,401);assert.equal(f.state.reads.length,0);
});

test("absent optional email storage is explicit unavailable while connectivity failures remain failures",async()=>{
  for(const code of ["P2021","P2022"]){const f=fixture();f.state.storageError=code;const response=await f.get(),body=await response.json();assert.equal(response.status,200);assert.equal(body.workoutEmail.storageAvailable,false);assert.ok(body.workoutEmail.blockers.includes("email_storage_unavailable"));assert.deepEqual(body.workoutEmail.recentAttempts,[]);}
  const f=fixture();delete (f.env as Partial<typeof f.env>).SMTP_HOST;const body=await(await f.get()).json();assert.equal(body.smtpConfigured,false);assert.ok(body.workoutEmail.blockers.includes("email_unconfigured"));
  const failure=fixture();failure.state.databaseError=true;assert.equal((await failure.get()).status,500);
});

test("email readiness renders English/Spanish acceptance uncertainty and remains usable when health fails",async()=>{
  const f=fixture(),health=(await(await f.get()).json()).workoutEmail;
  const en=renderToStaticMarkup(React.createElement(WorkoutEmailReadiness,{health}));
  assert.match(en,/Google Calendar and Telegram connections are separate/);assert.match(en,/Provider accepted/);assert.match(en,/Receipt is unconfirmed/);assert.doesNotMatch(en,/Delivered|received successfully/);
  const es=renderToStaticMarkup(React.createElement(WorkoutEmailReadiness,{health,es:true}));assert.match(es,/Aceptado por el proveedor/);assert.match(es,/recepción sigue sin confirmar/);
  const unavailable=renderToStaticMarkup(React.createElement(WorkoutEmailReadiness,{health:null,unavailable:true,onRetry:()=>{}}));assert.match(unavailable,/other reminder settings remain available/);assert.match(unavailable,/Retry email status/);assert.match(unavailable,/workout-email\/settings/);
  assert.equal(isWorkoutEmailHealth({...health,statuses:{queued:-1}}),false);
});

test("actual reminders page keeps Telegram preferences available after email health failure and retries independently",async()=>{
  const f=fixture(),health=(await(await f.get()).json()).workoutEmail;
  const cells:any[]=[],pending:(()=>void)[]=[];let cursor=0,dirty=true,tree:any,fail=true,healthReads=0;
  const same=(a:any[],b:any[])=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const react={...React,useState(initial:any){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==="function"?initial():initial;return [cells[index],(value:any)=>{const next=typeof value==="function"?value(cells[index]):value;if(!Object.is(next,cells[index])){cells[index]=next;dirty=true;}}];},useCallback(callback:any,deps:any[]){const index=cursor++;if(!same(cells[index]?.deps,deps))cells[index]={deps,callback};return cells[index].callback;},useEffect(effect:any,deps:any[]){const index=cursor++;if(!same(cells[index]?.deps,deps)){cells[index]={deps};pending.push(effect);}}};
  const user={id:"a",language:"en"};
  const request:typeof fetch=async(path)=>{
    if(String(path)==="/api/reminders/health"){healthReads++;return Response.json(fail?{error:"unavailable"}:{workoutEmail:health},{status:fail?503:200});}
    if(String(path).includes("preferences"))return Response.json({preferences:{primaryChannel:"telegram",paused:true,dailyPlan:true,sessionFeedback:false,missingData:false,timezone:"America/New_York",minuteOfDay:300,quietStart:1260,quietEnd:300,declinedOptional:[]},enabled:false,transport:"mock",consentVersion:"mock-coaching-v1"});
    return Response.json({prompts:[],workouts:[]});
  };
  const page=load("src/app/reminders/page.tsx",{react,"react/jsx-runtime":requireJsx(),"next/link":{__esModule:true,default:()=>null},"@/components/gate":{ProtectedPage:()=>null},"@/components/auth":{useAuth:()=>({user})},"@/lib/reminder-readiness":{reminderBlockers:()=>[]},"@/components/workout-email-readiness":{WorkoutEmailReadiness,isWorkoutEmailHealth}},{fetch:request,AbortController});
  const nodes=(value:any):any[]=>Array.isArray(value)?value.flatMap(nodes):React.isValidElement(value)?[value,...nodes((value as any).props.children)]:[];
  async function flush(){for(let tries=0;tries<20;tries++){if(dirty){dirty=false;cursor=0;const wrapper=page.default();tree=wrapper.type();}while(pending.length)pending.shift()!();await new Promise(resolve=>setImmediate(resolve));if(!dirty&&!pending.length)return;}throw Error("Unstable page fixture");}
  await flush();let section=nodes(tree).find(node=>node.type===WorkoutEmailReadiness);assert.ok(section);assert.equal(section.props.health,null);assert.equal(section.props.unavailable,true);
  assert.ok(nodes(tree).some(node=>node.type==="input"&&node.props.value==="America/New_York"),"Telegram settings still load");
  fail=false;section.props.onRetry();await flush();section=nodes(tree).find(node=>node.type===WorkoutEmailReadiness);assert.equal(section.props.unavailable,false);assert.equal(section.props.health.statuses.providerAccepted,1);assert.equal(healthReads,2);
});

function requireJsx(){return {jsx:(type:any,props:any,key:any)=>React.createElement(type,{...props,key}),jsxs:(type:any,props:any,key:any)=>React.createElement(type,{...props,key}),Fragment:React.Fragment};}
