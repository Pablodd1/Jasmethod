import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { ApiError } from './access';
import { readScenarioJson, scenarioError, SCENARIO_HEADERS } from './race-scenario-http';
import { readHyroxResults, saveHyroxResult, HYROX_RESULTS_ACTION } from './hyrox-results';
function fixture(){
 const rows:any[]=[];const state={authorized:true,other:false,queries:0,writes:0,transactionFailure:false};
 const tx:any={auditLog:{findMany:async(q:any)=>{state.queries++;assert.equal(q.where.subjectId,'owner');assert.equal(q.where.action,HYROX_RESULTS_ACTION);return rows.slice().reverse();},create:async({data}:any)=>{state.writes++;assert.equal(data.actorId,'owner');assert.equal(data.subjectId,'owner');const row={id:'saved-'+state.writes,createdAt:new Date(),after:data.after};rows.push(row);return row;}},athleteProfile:{findUnique:async(q:any)=>{assert.equal(q.where.userId,'owner');return{runPaceBase:300};}}};
 const deps:Record<string,unknown>={
  '@/lib/access':{ApiError,trainingAccess:async()=>{if(!state.authorized)throw new ApiError('Sign in',401);return {actor:{id:'owner'},athlete:{id:state.other?'other':'owner',timezone:'UTC'}};}},
  '@/lib/db':{prisma:{$transaction:async(fn:any)=>{if(state.transactionFailure)throw Object.assign(Error('conflict'),{code:'P2034'});return fn(tx);}}},
  '@/lib/request-origin':{appMutationOriginAllowed:(req:Request)=>req.headers.get('origin')==='https://app.example.invalid'},
  '@/lib/ratelimit':{rateLimit:()=>({ok:true})},
  '@/lib/race-scenario-http':{readScenarioJson,scenarioError,SCENARIO_HEADERS},
  '@/lib/hyrox-results':{readHyroxResults:(id:string)=>readHyroxResults(id,tx),saveHyroxResult},
 };
 const compiled=ts.transpileModule(readFileSync('src/app/api/hyrox/results/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod:any={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:(key:string)=>{if(!(key in deps))throw Error(key);return deps[key];},Response,Request});
 const get=()=>mod.exports.GET(new Request('https://app.example.invalid/api/hyrox/results'));
 const post=(body:unknown,headers={'content-type':'application/json',origin:'https://app.example.invalid'})=>mod.exports.POST(new Request('https://app.example.invalid/api/hyrox/results',{method:'POST',headers,body:JSON.stringify(body)}));
 return {state,get,post,api:mod.exports};
}
const input=()=>({confirmed:true,observedDate:'2026-10-14',target:90,pace:310,sex:'female',pro:false,actualSecs:[320,...Array(15).fill(null)],transitionSeconds:null});
test('HYROX results route denies unauthenticated and cross-athlete requests before any data access',async()=>{
 const f=fixture();f.state.authorized=false;for(const response of [await f.get(),await f.post(input())])assert.equal(response.status,401);f.state.authorized=true;f.state.other=true;for(const response of [await f.get(),await f.post(input())])assert.equal(response.status,403);assert.equal(f.state.queries,0);assert.equal(f.state.writes,0);
});
test('HYROX results route confirms persistence then reloads same observations and blocks stale/invalid saves',async()=>{
 const f=fixture();const start=await f.get();assert.equal(start.headers.get('cache-control'),'private, no-store');const initial=await start.json();const body={...input(),expectedRevision:initial.revision,subjectId:'forged',source:'official_verified'};
 const response=await f.post(body);assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.ok,true);assert.equal(saved.results[0].source,'athlete_report');assert.equal(saved.results[0].input.actualSecs[0],320);assert.equal(saved.results[0].input.actualSecs[1],null);assert.equal(saved.results[0].completeness.actualFinishSeconds,null);
 const reload=await(await f.get()).json();assert.equal(reload.results[0].id,saved.id);assert.equal(reload.results[0].input.observedDate,'2026-10-14');assert.equal(reload.revision,saved.revision);assert.equal((await f.post(body)).status,409);
 assert.equal((await f.post({...body,expectedRevision:saved.revision,confirmed:false})).status,400);assert.equal(f.state.writes,1);
});
test('HYROX results route checks origin/type/bounded JSON and resolves transaction conflicts honestly',async()=>{
 const f=fixture();assert.equal((await f.post(input(),{'content-type':'application/json',origin:'https://other.example.invalid'})).status,403);
 assert.equal((await f.post(input(),{'content-type':'text/plain',origin:'https://app.example.invalid'})).status,415);
 const malformed=await f.api.POST(new Request('https://app.example.invalid/api/hyrox/results',{method:'POST',headers:{'content-type':'application/json',origin:'https://app.example.invalid'},body:'{'}));assert.equal(malformed.status,400);
 assert.equal((await f.post({padding:'x'.repeat(20000)})).status,413);assert.equal(f.state.writes,0);
 f.state.transactionFailure=true;const conflict=await f.post(input());assert.equal(conflict.status,409);assert.match((await conflict.json()).error,/Reload/);assert.equal(f.state.writes,0);
});
