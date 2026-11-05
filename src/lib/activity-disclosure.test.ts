import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as disclosure from './activity-disclosure';
import { activityReportEnvelope, readVerifiedActivityReport } from './activity-report-envelope';
import { coachingSummary } from './coaching';
import { derivedActivityPolicy } from './derived-activity-policy';
import * as dates from './dates';
import * as jMetrics from './j-metrics';
import * as cycleReview from './cycle-review';
import * as sportHeartRate from './sport-heart-rate';
import * as sportEvidence from './sport-evidence';
import * as supersededWorkout from './superseded-workout';

const date=new Date(), rows=[{id:'allowed',source:'garmin',date,userId:'athlete',planned:false,completed:true,durationMin:30,rpe:4,sport:'bike',avgPower:155,insights:'legacy-restricted-insight'},
  {id:'restricted',source:'strava',date,userId:'athlete',planned:false,completed:true,durationMin:41,title:'restricted-private-title'},
  {id:'unknown',source:'uploaded_unknown',date,userId:'athlete',planned:false,completed:true,durationMin:52,title:'unknown-private-title'}];
test('disclosure filtering never alters owner history or turns restricted work into available capacity',()=>{
 const before=JSON.stringify(rows);assert.equal(disclosure.activityDisclosure(rows,'athlete','athlete').records.length,3);
 const coach=disclosure.activityDisclosure(rows,'coach','athlete');assert.deepEqual(coach.records.map(row=>row.id),['allowed']);assert.equal(coach.limited,true);
 assert.equal(disclosure.trainingViewDisclosureAllowed('coach','athlete',rows),false);
 assert.equal(disclosure.trainingViewDisclosureAllowed('athlete','athlete',rows),true);
 assert.equal(disclosure.trainingViewDisclosureAllowed('coach','athlete',[rows[0]],{metrics:{hrv:{latest:{aiEligibility:'unknown',value:99}}}}),false);
 assert.equal(JSON.stringify(rows),before);
});
test('only reviewed versioned activity-report envelopes with currently permitted origin can display',()=>{
 const report={headline:'Reviewed',body:'Permitted source only'}, envelope=JSON.stringify(activityReportEnvelope(report));
 assert.deepEqual(readVerifiedActivityReport(envelope,{source:'garmin'}),report);
 for(const old of [JSON.stringify(report),'{',JSON.stringify({schemaVersion:1,provenanceReviewed:false,report})])assert.equal(readVerifiedActivityReport(old,{source:'garmin'}),null);
 assert.equal(readVerifiedActivityReport(envelope,{source:'garmin',notes:'Original source: STRAVA'}),null);
 assert.equal(readVerifiedActivityReport(envelope,{source:'uploaded_unknown'}),null);
});
function fixture(actorId='coach',role='coach',assigned=true,metricRestricted=false,workouts=rows){
 let reads=0;const queries:any[]=[];
 class ApiError extends Error {constructor(message:string,public status=400){super(message)}}
 const list=(name:string,value:any[])=>({findMany:async(args:any)=>{reads++;queries.push({name,...args});assert.equal(args.where.userId??args.where.subjectId,'athlete');return value;}});
 const prisma={user:{findUnique:async()=>{reads++;return{id:'athlete',timezone:'UTC',profile:{}}}},workout:list('workout',workouts),dailyMetrics:list('metrics',metricRestricted?[{source:'strava',date,hrv:9876}]:[]),metricObservation:list('rest',[]),
  dailyCheckin:list('checkin',[{id:'checkin',date,answers:'restricted-raw-answer',adaptation:'restricted-old-adaptation'}]),race:list('race',[]),benchmarkTest:list('test',[]),bloodPanel:list('blood',[]),nutritionLog:list('food',[]),sleepRecord:list('sleep',[]),connector:list('connector',[]),
  auditLog:list('audit',[{id:'audit',action:'workout.update',createdAt:date,actor:{name:'Coach'},entityId:'private-provider-id',before:'restricted-before',after:'restricted-after'}]),trainingPlan:{findFirst:async()=>null}};
 const deps:Record<string,unknown>={'@/lib/db':{prisma},'@/lib/auth':{getCurrentUser:async()=>actorId?{id:actorId,role}:null},'@/lib/access':{ApiError,canCoach:(actor:any)=>['admin','coach'].includes(actor.role),canAccessAthlete:async()=>assigned,errorResponse:(error:ApiError)=>Response.json({error:error.message},{status:error.status||500})},
  '@/lib/coaching':{coachingSummary},'@/lib/activity-disclosure':disclosure,'@/lib/activity-reconciliation':{readActivityDecisions:async()=>[]},'@/lib/dates':dates,'@/lib/workout-update':{workoutRevision:()=> 'revision'},'@/lib/profile-service':{profileRevision:()=> 'profile'},
  '@/lib/j-metrics':jMetrics,'@/lib/cycle-review':cycleReview,'@/lib/sport-heart-rate':sportHeartRate,'@/lib/sport-evidence':sportEvidence,'@/lib/derived-activity-policy':{derivedActivityPolicy},'@/lib/superseded-workout':supersededWorkout};
 const mod:any={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/admin/athletes/[id]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Request,Response,URL,Date,require:(key:string)=>{if(key in deps)return deps[key];throw Error(key)}});
 return{run:()=>mod.exports.GET(new Request('https://app.example/api/admin/athletes/athlete'),{params:Promise.resolve({id:'athlete'})}),reads:()=>reads,queries};
}
test('actual admin route preserves owner records but masks assigned-coach raw rows/audit and keeps full-input analysis unavailable',async()=>{
 const owner=await(await fixture('athlete','admin').run()).json();assert.equal(owner.workouts.length,3);assert.equal(owner.audit[0].before,'restricted-before');
 const f=fixture(),response=await f.run();assert.equal(response.status,200);const result=await response.json();
 assert.deepEqual(result.workouts.map((row:any)=>row.id),['allowed']);assert.equal(result.workouts[0].insights,null);
 assert.equal(result.analysis,null);assert.ok(result.analysisUnavailableReason);
 assert.equal(result.metricReview.jMetrics,null);assert.ok(result.metricReview.loadUnavailableReason);assert.deepEqual(result.metricReview.observations,[]);
 assert.equal(result.audit[0].before,null);assert.equal(result.audit[0].after,null);assert.equal(result.audit[0].entityId,null);assert.ok(result.disclosure.auditUnavailableReason);assert.ok(result.disclosure.workoutsUnavailableReason);
 assert.equal(result.checkins[0].answers,null);assert.equal(result.checkins[0].adaptation,null);
 assert.doesNotMatch(JSON.stringify(result),/restricted-private-title|unknown-private-title|restricted-before|restricted-after|legacy-restricted-insight|restricted-raw-answer|restricted-old-adaptation/);
});
test('actual admin route refuses foreign unassigned coach before reading athlete records',async()=>{
 const f=fixture('foreign','coach',false);assert.equal((await f.run()).status,403);assert.equal(f.reads(),0);
 const anonymous=fixture('','athlete');assert.equal((await anonymous.run()).status,401);assert.equal(anonymous.reads(),0);
});
test('actual admin route withholds restricted metrics and serialized checkins even with permitted workouts only',async()=>{
 const result=await(await fixture('coach','coach',true,true,[rows[0]]).run()).json();
 assert.equal(result.metrics.length,0);assert.ok(result.disclosure.metricsUnavailableReason);assert.equal(result.disclosure.workoutsUnavailableReason,null);
 assert.equal(result.checkins[0].answers,null);assert.equal(result.analysis,null);
 assert.equal(result.metricReview.jMetrics.totalJStress,120);
 assert.equal(result.metricReview.jMetrics.current.jBase,null);
 assert.equal(result.metricReview.observations.find((row:any)=>row.sport==='bike').latest.avgPower.value,155);
 assert.doesNotMatch(JSON.stringify(result),/9876|restricted-raw-answer|restricted-old-adaptation/);
});
test('Coaching Desk withholds Garmin direct load and observations from a different user',async()=>{
 const direct={...rows[0],source:'garmin_direct'};
 const result=await(await fixture('coach','coach',true,false,[direct]).run()).json();
 assert.equal(result.metricReview.jMetrics,null);assert.deepEqual(result.metricReview.observations,[]);
 assert.ok(result.metricReview.loadUnavailableReason);
});
test('replaced unperformed plan rows do not block permitted Coaching Desk analysis',async()=>{
 const replaced={id:'old',title:'Replaced session',source:'superseded-plan',date,userId:'athlete',planned:false,completed:false,durationMin:30};
 const result=await(await fixture('coach','coach',true,false,[rows[0],replaced]).run()).json();
 assert.equal(result.analysis.minutes,30);
 assert.equal(result.analysisUnavailableReason,null);
});

function dailyRoute(file:string,owner=false){
 class ApiError extends Error {constructor(message:string,public status=400){super(message)}}
 const deps:Record<string,any>={
  'next/server':{NextResponse:{json:Response.json}},'@/lib/access':{ApiError,trainingAccess:async()=>({actor:{id:owner?'athlete':'coach'},athlete:{id:'athlete',timezone:'UTC'}}),errorResponse:(e:ApiError)=>Response.json({error:e.message},{status:e.status||500})},
  '@/lib/db':{prisma:{trainingPlan:{findFirst:async()=>null},workout:{findMany:async()=>[rows[1]],findFirst:async()=>null},race:{findFirst:async()=>null},dailyCheckin:{findUnique:async()=>null},dailyMetrics:{findMany:async()=>[]},calendarEvent:{findMany:async()=>[]},athleteProfile:{findUnique:async()=>null}}},
  '@/lib/dates':{dayBounds:()=>({start:date,end:new Date(+date+86400000),key:'2026-10-21'}),dateKey:()=> '2026-10-21',addDaysKey:()=> '2026-10-20',localDate:()=>date},
  '@/lib/canonical-session':{SessionResolutionError:class extends Error {}},'@/lib/planning-setup-store':{readPlanningSetup:async()=>({setup:null})},
  '@/lib/daily-input-context':{readDailyInputContext:async()=>({metrics:{},completedWorkouts:[{sourceRecords:[{aiEligibility:'strava'}]}]})},
  '@/lib/derived-activity-policy':{derivedActivityPolicy},
  '@/lib/calendar-workouts':{currentWorkoutWhere:()=>({}),currentOrReportedWorkoutWhere:()=>({}),isCurrentWorkout:()=>true},'@/lib/activity-disclosure':disclosure,
 };
 const mod:any={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,Request,Response,URL,Date,require:(key:string)=>deps[key]??{}});
 return mod.exports.GET;
}
test('actual Today fast-plan route guards coach provenance and never exposes selected source/notes in owner output',async()=>{
 const req=()=>new Request('https://app.example/api/today?view=plan&athleteId=athlete');
 assert.equal((await dailyRoute('src/app/api/today/route.ts')(req())).status,403);
 const owned=await dailyRoute('src/app/api/today/route.ts',true)(req());assert.equal(owned.status,200);
 const value=await owned.json();assert.equal(value.sessions.length,1);assert.equal(value.sessions[0].source,undefined);assert.equal(value.sessions[0].notes,undefined);
});
test('actual v1 daily adapter refuses coach raw restricted workout before prescription or actual-data rendering',async()=>{
 const result=await dailyRoute('src/app/api/v1/training/today/route.ts')(new Request('https://app.example/api/v1/training/today?athleteId=athlete'));
 assert.equal(result.status,403);assert.doesNotMatch(await result.text(),/restricted-private-title/);
});
test('actual checkin GET refuses coach previous-session/context disclosure with a restricted contributor',async()=>{
 const result=await dailyRoute('src/app/api/checkin/route.ts')(new Request('https://app.example/api/checkin?athleteId=athlete'));
 assert.equal(result.status,403);assert.doesNotMatch(await result.text(),/restricted-private-title/);
});
