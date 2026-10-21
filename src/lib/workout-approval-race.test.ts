import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { canonicalSession, requireSessionRevision, SessionResolutionError } from './canonical-session';
import { buildSessionDownload } from './fit-export';

function matches(row:Record<string,any>,where:Record<string,any>):boolean {
  return Object.entries(where).every(([key,value])=>{
    if(value instanceof Date)return row[key] instanceof Date&&row[key].getTime()===value.getTime();
    if(value===null)return row[key]==null;
    if(value&&typeof value==='object')return !!row[key]&&matches(row[key],value);
    return row[key]===value;
  });
}
function fixture(options:{beforeTransaction?:(row:any)=>void;beforeWrite?:(row:any)=>void;beforeReplay?:(row:any)=>void}={}) {
  const row:any={id:'owned-workout',userId:'owner',date:new Date(),title:'Synthetic run',sport:'run',type:'endurance',durationMin:30,intensity:'z2',startTime:null,notes:null,indoor:false,planned:true,completed:false,approved:false,source:'plan',planDayId:'current-day',planDay:{plan:{id:'current-plan',userId:'owner',status:'active'}},originalPlan:null,
    feedbackStatus:null,feedbackAt:null,feedbackNote:null,actualDurationMin:null,actualSport:null,actualDetails:null,rpe:null,avgHr:null,maxHr:null,avgPower:null,np:null,distanceKm:null,calories:null,preWeightKg:null,postWeightKg:null,externalId:null,matchedPlanId:null};
  row.prescription=JSON.stringify({sport:'run',durationMin:30,verdict:'full',steps:[{name:'Run',phase:'active',zone:'z2',seconds:1800,target:{type:'open'}}]});
  const state={row,audits:[] as any[],writes:0,resolutions:0,reads:0,meters:0,insideTransaction:false};
  const snapshot=()=>canonicalSession({athleteId:'owner',workout:row,prescription:row.prescription,dateLocal:row.date.toISOString().slice(0,10),timezone:'UTC'});
  const revision=snapshot().revision;
  class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
  const db={
    workout:{
      updateMany:async({where,data}:any)=>{options.beforeWrite?.(row);if(!matches(row,where))return{count:0};Object.assign(row,data);state.writes++;return{count:1};},
      findFirst:async({where}:any)=>{state.reads++;options.beforeReplay?.(row);return matches(row,where)?structuredClone(row):null;},
    },
    auditLog:{create:async({data}:any)=>{state.audits.push(data);return data;}},
    $transaction:async(callback:any,settings:any)=>{assert.equal(settings.isolationLevel,'Serializable');options.beforeTransaction?.(row);state.insideTransaction=true;try{return await callback(db);}finally{state.insideTransaction=false;}},
  };
  const deps:Record<string,unknown>={
    'next/server':{NextResponse:Response},'@/lib/db':{prisma:db},
    '@/lib/access':{ApiError,trainingAccess:async()=>({actor:{id:'owner'},athlete:{id:'owner'}}),errorResponse:(error:ApiError)=>Response.json({error:error.message},{status:error.status??500})},
    '@/lib/fit-export':{buildSessionDownload},'@/lib/canonical-session':{requireSessionRevision,SessionResolutionError},
    '@/lib/telemetry':{meterUsage:async()=>{state.meters++;}},
    '@/lib/effective-prescription':{effectivePrescription:async(owner:string,id:string,reader?:unknown)=>{
      assert.equal(owner,'owner');assert.equal(id,row.id);state.resolutions++;
      if(reader){assert.equal(reader,db);assert.equal(state.insideTransaction,true);}
      if(!row.planned||row.source==='superseded-plan'||row.planDay.plan.status!=='active')return null;
      return{workout:structuredClone(row),canonical:snapshot()};
    }},
  };
  const source=fs.readFileSync('src/app/api/workout/approve/route.ts','utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{} as any};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:(id:string)=>{assert.ok(id in deps,id);return deps[id];},Request,Response,URL,Buffer});
  return{state,post:()=>mod.exports.POST(new Request(`https://example.invalid/api/workout/approve?sessionId=${row.id}&expectedRevision=${revision}`,{method:'POST'})),get:()=>mod.exports.GET(new Request(`https://example.invalid/api/workout/approve?sessionId=${row.id}`))};
}

test('cycle retirement between initial resolution and approval transaction cannot approve or return a stale FIT',async()=>{
  const f=fixture({beforeTransaction:row=>{row.planned=false;row.source='superseded-plan';row.planDay.plan.status='archived';}});
  const response=await f.post();assert.equal(response.status,409);assert.equal(f.state.row.approved,false);assert.equal(f.state.writes,0);assert.equal(f.state.audits.length,0);assert.equal(f.state.meters,0);assert.equal(f.state.resolutions,2);
});

test('conditional approval and already-approved retry require the unchanged source, plan and execution payload',async()=>{
  for(const alreadyApproved of [false,true])for(const change of [
    (row:any)=>{row.planned=false;},(row:any)=>{row.source='superseded-plan';},(row:any)=>{row.planDay.plan.status='archived';},
    (row:any)=>{row.actualDurationMin=0;},(row:any)=>{row.feedbackAt=new Date();},(row:any)=>{row.rpe=0;},
    (row:any)=>{row.intensity='z1';},(row:any)=>{row.date=new Date(row.date.getTime()+86400000);},(row:any)=>{row.originalPlan='changed';},
  ]) {
    const f=fixture({beforeWrite:change});f.state.row.approved=alreadyApproved;
    const response=await f.post();assert.equal(response.status,409);assert.equal(f.state.writes,0);assert.equal(f.state.audits.length,0);assert.equal(f.state.meters,0);
  }
});

test('unchanged explicit approvals remain idempotent and GET stays read only',async()=>{
  const f=fixture();
  const download=await f.get();assert.equal(download.status,200);assert.ok((await download.arrayBuffer()).byteLength>100);assert.equal(f.state.writes,0);assert.equal(f.state.resolutions,1);
  const first=await f.post(),retry=await f.post();assert.equal(first.status,200);assert.equal(retry.status,200);assert.equal(f.state.row.approved,true);assert.equal(f.state.writes,1);assert.equal(f.state.audits.length,2);
  assert.equal(first.headers.get('X-Delivered-Email'),'0');assert.equal(first.headers.get('X-Workout-Compatibility'),'device-unverified');
});
