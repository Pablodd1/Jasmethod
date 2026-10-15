import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareHyroxResult, readHyroxResults, saveHyroxResult, HYROX_RESULTS_ACTION } from './hyrox-results';
const now = new Date('2026-10-15T02:00:00Z');
const context = { timezone:'America/New_York',profilePace:300,now };
const valid = () => ({confirmed:true,observedDate:'2026-10-14',target:90,pace:310,sex:'female',pro:false,eventName:'Synthetic race',actualSecs:Array.from({length:16},(_,i)=>i===0?320:null),transitionSeconds:null});
function fixture(){const rows:any[]=[];let profilePace:number|null=300;const db:any={auditLog:{findMany:async(q:any)=>{assert.equal(q.where.subjectId,'owner');assert.equal(q.where.action,HYROX_RESULTS_ACTION);return rows.slice().reverse().slice(0,50);},create:async({data}:any)=>{assert.equal(data.subjectId,'owner');assert.equal(data.actorId,'owner');const row={id:`result-${rows.length}`,createdAt:new Date('2026-10-15T12:00:00Z'),after:data.after};rows.push(row);return row;}},athleteProfile:{findUnique:async(q:any)=>{assert.equal(q.where.userId,'owner');return{runPaceBase:profilePace};}}};return{db,rows,setPace:(pace:number)=>{profilePace=pace;}};}
test('HYROX actual snapshot retains unknown segments/transitions and explicit scenario source without capacity claims',()=>{
 const saved=prepareHyroxResult(valid(),context);assert.equal(saved.source,'athlete_report');assert.equal(saved.input.sex,'female');assert.equal(saved.input.pro,false);assert.equal(saved.input.observedDate,'2026-10-14');assert.equal(saved.paceSource,'entered');assert.equal(saved.input.actualSecs[1],null);assert.equal(saved.completeness.loggedSegments,1);assert.equal(saved.completeness.missingSegments,15);assert.equal(saved.completeness.transitionStatus,'missing');assert.equal(saved.completeness.actualFinishSeconds,null);assert.equal(saved.analysis.actualTotalSec,320);assert.match(saved.limitations.join(' '),/not.*verified|not verified/);
 const fallback=prepareHyroxResult({...valid(),pace:''},context);assert.equal(fallback.input.pace,300);assert.equal(fallback.paceSource,'profile_threshold_scenario');
 const complete=prepareHyroxResult({...valid(),actualSecs:Array(16).fill(300),transitionSeconds:120},context);assert.equal(complete.completeness.actualFinishSeconds,4920);assert.equal(complete.analysis.actualTotalSec,4800);
});
test('HYROX results require actual local date, explicit confirmation, division and nonempty bounded actual observations',()=>{
 for(const patch of [{confirmed:false},{confirmed:'true'},{observedDate:'2026-10-15'},{observedDate:'2026-02-30'},{observedDate:'x'},{sex:'unspecified'},{pro:'0'},{target:Infinity},{target:true},{pace:{}},{actualSecs:[]},{actualSecs:Array(16).fill(null)},{actualSecs:Array(16).fill(0)},{actualSecs:Array(16).fill(true)},{actualSecs:Array(16).fill(20000)},{transitionSeconds:-1},{transitionSeconds:Infinity},{eventName:{}}])assert.throws(()=>prepareHyroxResult({...valid(),...patch},context),Error,JSON.stringify(patch));
 assert.throws(()=>prepareHyroxResult({...valid(),pace:''},{...context,profilePace:null}),/No running pace/);
});
test('HYROX store is owner-scoped, appends immutable confirmed snapshots, restores without a new threshold and rejects stale revisions',async()=>{
 const f=fixture();const state=await readHyroxResults('owner',f.db);assert.deepEqual(state.results,[]);
 const body={...valid(),expectedRevision:state.revision};const saved=await saveHyroxResult({id:'owner',timezone:'UTC'},body,f.db);assert.equal(saved.ok,true);assert.equal(saved.results.length,1);assert.equal(saved.results[0].input.actualSecs[0],320);assert.equal(saved.results[0].input.eventName,'Synthetic race');
 await assert.rejects(saveHyroxResult({id:'owner',timezone:'UTC'},body,f.db),/changed/);assert.equal(f.rows.length,1);
 f.setPace(500);const restored=await readHyroxResults('owner',f.db);assert.equal(restored.results[0].input.pace,310);assert.equal(restored.results[0].plan.runPaceSecPerKm,310);assert.notEqual(restored.revision,saved.revision);
 const corrected=await saveHyroxResult({id:'owner',timezone:'UTC'},{...body,actualSecs:Array(16).fill(305),transitionSeconds:100,expectedRevision:restored.revision},f.db);assert.equal(corrected.results.length,2);assert.equal(JSON.parse(f.rows[0].after).input.actualSecs[0],320);
});
test('unreadable saved HYROX snapshots are counted without fabricating results or dropping evidence from revision',async()=>{
 const f=fixture();const original=await readHyroxResults('owner',f.db);f.rows.push({id:'bad',createdAt:now,after:'not-json'});const state=await readHyroxResults('owner',f.db);assert.equal(state.unreadableResults,1);assert.equal(state.results.length,0);assert.notEqual(state.revision,original.revision);
});
