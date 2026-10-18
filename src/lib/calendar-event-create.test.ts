import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as dates from './dates';
import * as calendarWorkouts from './calendar-workouts';
class ApiError extends Error { constructor(message:string,public status=400){super(message);} }
const errorResponse=(e:unknown)=>Response.json({error:e instanceof ApiError?e.message:'Could not save changes. Please retry.'},{status:e instanceof ApiError?e.status:500});
function calendar(create:(arg:any)=>Promise<any>,user:any={id:'owner',timezone:'America/New_York'}){
 const deps:Record<string,unknown>={'@/lib/calendar-workouts':calendarWorkouts,'@/lib/activity-reconciliation':{readActivityDecisions:async()=>[]},'@/lib/workout-update':{},'next/server':{NextResponse:Response},'@/lib/dates':dates,'@/lib/access':{ApiError,errorResponse},'@/lib/auth':{getCurrentUser:async()=>user},'@/lib/db':{prisma:{calendarEvent:{create}}}};
 const compiled=ts.transpileModule(fs.readFileSync('src/app/api/calendar/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod:any={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:(id:string)=>{if(id in deps)return deps[id];throw Error(id)},URL,Response,Request});return mod.exports.POST;
}
const request=(body:unknown)=>new Request('https://example.test/api/calendar',{method:'POST',body:JSON.stringify(body)});
test('calendar create rejects malformed JSON, wrong scalar types, impossible dates and invalid times before writes',async()=>{
 let writes=0;const post=calendar(async()=>{writes++;return {};});
 for(const body of [null,[],true,{date:'not-a-date'},{date:'2026-02-30'},{date:123},{title:{}},{notes:[]},{notes:'x'.repeat(2001)},{type:'arbitrary'},{startTime:'25:00'},{endTime:3},{startTime:'10:00',endTime:'09:00'}])assert.equal((await post(request(body))).status,400,JSON.stringify(body));
 assert.equal((await post(new Request('https://example.test/api/calendar',{method:'POST',body:'{'}))).status,400);assert.equal(writes,0);
});
test('calendar create preserves local date, binds authenticated owner and ignores injected ownership',async()=>{
 let saved:any;const post=calendar(async({data})=>{saved=data;return {id:'event',...data};});
 const response=await post(request({title:'  Travel  ',date:'2026-11-01',startTime:'09:00',endTime:'10:00',type:'appointment',notes:'Synthetic travel',userId:'someone-else',externalId:'forged'}));assert.equal(response.status,200);assert.equal(saved.userId,'owner');assert.equal(saved.title,'Travel');assert.equal(saved.date.toISOString(),'2026-11-01T04:00:00.000Z');assert.equal(saved.externalId,undefined);
});
test('calendar create has authenticated boundary and hides database errors',async()=>{
 const unauthorized=calendar(async()=>{throw Error('unexpected write');},null);assert.equal((await unauthorized(request({}))).status,401);
 const fail=calendar(async()=>{throw Error('database credentials or query internals');});const response=await fail(request({date:'2026-10-15'}));assert.equal(response.status,500);assert.doesNotMatch(JSON.stringify(await response.json()),/credentials|query internals/);
});
