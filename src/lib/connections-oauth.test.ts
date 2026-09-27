// @ts-nocheck -- VM fixtures deliberately simulate Prisma and provider HTTP boundaries.
/* Read-only probes. Execute real TS OAuth + importer URL builders with all
 * external effects replaced. No live authorization, network, DB, or secrets. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const original = process.cwd();
const {test} = require('node:test');
const ts = require(path.join(original, 'node_modules/typescript'));
class NextResponse extends Response {
  static redirect(url) { return new NextResponse(null, {status:307, headers:{location:String(url)}}); }
}
function load(root, rel, dependencies, extra={}) {
  const source=fs.readFileSync(path.join(root,rel),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(compiled,{module,exports:module.exports,require:key=> {
    if(key in dependencies) return dependencies[key];
    const alias = key.startsWith('./') ? '@/lib/' + key.slice(2) : key;
    if(alias in dependencies) return dependencies[alias];
    throw Error('Unmocked dependency '+key);
  },URL,URLSearchParams,Request,Response,Date,Buffer,AbortSignal,AbortController,setTimeout,clearTimeout,Promise,...extra});
  if(module.exports.processVerifiedEvent) module.exports.POST = req => module.exports.processVerifiedEvent(req, 'athlete-A');
  return module.exports;
}
function fixture(root,{forcedClaimCount=null,partialScope=false}={}) {
  let txn=null, sessionUser='athlete-A'; const jar=new Map();
  const log={tokenRequests:[],profileRequests:[],writes:[],claims:[],queued:[],errors:[]};
  const fakeToken={access_token:'fake-token',refresh_token:'fake-refresh',expires_in:3600,
    scope:partialScope?'read:profile':'read:profile read:recovery read:sleep read:cycles read:workout offline',athlete:{id:123}};
  const importers=load(root,'src/lib/importers.ts',{
    './provider-fetch':{providerFetch:async(url,opts)=> {log.tokenRequests.push(String(url)); return Response.json(fakeToken);}},
    'crypto':require('node:crypto'),'./dates':{dateKey:()=> '2026-09-26',DEFAULT_TIMEZONE:'UTC'},
    'fast-xml-parser':{XMLParser:class{}},
  });
  const state=load(root,'src/lib/oauth-state.ts',{'crypto':require('node:crypto')});
  const db={oAuthTransaction:{
    create:async({data})=> {txn={...data,id:'transaction-1',usedAt:null};return txn;},
    findUnique:async({where})=> txn?.state===where.state?{...txn}:null,
    updateMany:async({where,data})=> {
      let count=txn?.state===where.state&&!txn.usedAt?1:0;
      if(where.provider&&txn?.provider!==where.provider)count=0;
      if(where.userId&&txn?.userId!==where.userId)count=0;
      if(where.expiresAt&&!(txn?.expiresAt>where.expiresAt.gt))count=0;
      if(forcedClaimCount!==null)count=forcedClaimCount;
      if(count)txn={...txn,...data}; log.claims.push(count);return{count};
    },
  },connector:{findFirst:async()=>null,upsert:async args=> {log.writes.push(args);return{id:'connector-1',...args.create};}}};
  db.$transaction = async work => work({...db, syncJob:{create:async args=>{log.queued.push(args);return{id:'job'}}}});
  const env={NEXT_PUBLIC_APP_URL:'https://app.example'};
  for(const p of ['GOOGLE','OURA','STRAVA','WHOOP']) {env[p+'_CLIENT_ID']='fake-client';env[p+'_CLIENT_SECRET']='fake-secret';}
  const oauth=load(root,'src/lib/oauth.ts',{
    'next/server':{NextResponse},'next/headers':{cookies:()=>({get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key,value,opts)=>opts.maxAge===0?jar.delete(key):jar.set(key,value)})},
    './auth':{getCurrentUser:async()=>sessionUser?{id:sessionUser}:null},'./db':{prisma:db},
    './crypto':{encryptSecret:value=>'fake-encrypted:'+value},'./importers':importers,'./oauth-state':state,
    './sync':{syncUserConnectors:async()=>({total:0,results:[]})},
    './background-jobs':{enqueue:async(...args)=>log.queued.push(args)},
  },{process:{env},fetch:async url=> {log.profileRequests.push(String(url));return Response.json({user_id:123});},
    console:{error:(...args)=>log.errors.push(args),warn:()=>{}}});
  return {...oauth,log,getTxn:()=>txn,setTxn:value=>{txn=value;},clearBrowser:()=>{jar.clear();sessionUser=null;},setSession:value=>{sessionUser=value;}};
}
async function roundTrip(root,provider,options={}) {
  const f=fixture(root,options);
  const response=await f.authorize(new Request(`https://app.example/api/connectors/${provider}/authorize`),provider);
  const authUrl=new URL(response.headers.get('location'));
  const requestedState=authUrl.searchParams.get('state');
  f.clearBrowser();
  const callbackUrl=new URL(`https://app.example/api/connectors/${provider}/callback`);
  callbackUrl.searchParams.set('code','fake-code');
  if(requestedState)callbackUrl.searchParams.set('state',requestedState);
  const result=await f.callback(new Request(callbackUrl),provider);
  return {provider,authorizationHasState:!!requestedState,storedProvider:f.getTxn()?.provider,
    callback:result.headers.get('location'),exchangeRequests:f.log.tokenRequests.length,
    writes:f.log.writes.length,targetUser:f.log.writes[0]?.where.userId_provider.userId,
    requestedScopes:authUrl.searchParams.get('scope'),savedScopes:f.log.writes[0]?.create.scope,
    claimCounts:f.log.claims,queued:f.log.queued.length,errors:f.log.errors,
    profileRequests:f.log.profileRequests};
}

for (const provider of ['oura', 'strava', 'google-cal', 'google_cal', 'whoop']) {
  test(`connections: ${provider} actual authorization URL completes cookie-free callback`, async () => {
    const result = await roundTrip(original, provider);
    assert.equal(result.authorizationHasState, true);
    assert.equal(result.writes, 1, JSON.stringify(result.errors));
    assert.equal(result.targetUser, 'athlete-A');
    assert.equal(result.exchangeRequests, 1);
    assert.equal(result.queued, 1);
    if(provider === 'whoop') assert.match(result.requestedScopes, /read:workout/);
  });
}
test('connections: losing atomic state claim never exchanges credentials', async () => {
  const result = await roundTrip(original, 'oura', {forcedClaimCount:0});
  assert.equal(result.writes, 0); assert.equal(result.exchangeRequests, 0);
  assert.match(result.callback, /invalid_state/);
});
for (const kind of ['used', 'expired', 'wrong-provider', 'unknown']) {
  test(`connections: ${kind} state cannot attach credentials to returning browser user`, async () => {
    const f = fixture(original);
    await f.authorize(new Request('https://app.example/api/connectors/oura/authorize'), 'oura');
    const txn = {...f.getTxn()}; const state = txn.state;
    if(kind === 'used') txn.usedAt = new Date();
    if(kind === 'expired') txn.expiresAt = new Date(Date.now()-1000);
    if(kind === 'wrong-provider') txn.provider = 'strava';
    f.setTxn(kind === 'unknown' ? null : txn); f.setSession('athlete-B');
    await f.callback(new Request(`https://app.example/api/connectors/oura/callback?code=fake&state=${state}`), 'oura');
    assert.equal(f.log.writes.length, 0); assert.equal(f.log.tokenRequests.length, 0);
  });
}
test('connections: concurrent callbacks exchange only once and bind initiating athlete', async () => {
  const f = fixture(original);
  await f.authorize(new Request('https://app.example/api/connectors/oura/authorize'), 'oura');
  f.setSession('athlete-B');
  const req = new Request(`https://app.example/api/connectors/oura/callback?code=fake&state=${f.getTxn().state}`);
  await Promise.all([f.callback(req, 'oura'), f.callback(req, 'oura')]);
  assert.equal(f.log.writes.length, 1); assert.equal(f.log.tokenRequests.length, 1);
  assert.equal(f.log.writes[0].create.userId, 'athlete-A');
});
test('connections: external return URLs are never followed', async () => {
  const f = fixture(original);
  await f.authorize(new Request('https://app.example/api/connectors/oura/authorize?return=https://evil.example'), 'oura');
  assert.equal(f.getTxn().returnUrl, null);
  f.setTxn({...f.getTxn(), returnUrl:'https://evil.example'});
  const r=await f.callback(new Request(`https://app.example/api/connectors/oura/callback?code=fake&state=${f.getTxn().state}`), 'oura');
  assert.equal(new URL(r.headers.get('location')).origin,'https://app.example');
});
test('connections: WHOOP v2 workout sport, energy units and invalid timestamps', async () => {
  const api=load(original,'src/lib/importers.ts',{
    './provider-fetch':{providerFetch:async()=>Response.json({records:[
      {id:'run',sport_name:'running',start:'2026-09-26T12:00:00Z',end:'2026-09-26T13:00:00Z',score:{kilojoule:418.4}},
      {id:'unknown',sport_name:'new sport',start:'2026-09-26T12:00:00Z',end:'2026-09-26T13:00:00Z'},
      {id:'bad',sport_name:'running',start:'invalid',end:'2026-09-26T13:00:00Z'},
    ]})},'crypto':require('node:crypto'),'./dates':{dateKey:()=>'',DEFAULT_TIMEZONE:'UTC'},'fast-xml-parser':{XMLParser:class{}}
  });
  const workouts=await api.whoopGetWorkouts('fake');
  assert.equal(workouts.length,2); assert.equal(workouts[0].sport,'run');
  assert.equal(workouts[0].calories,100); assert.equal(workouts[1].sport,'other');
});

function webhookFixture({failRefetch=false, deletion=false}={}) {
  const log={fetches:[],stored:[],deleted:[],processed:0};
  const db={
    connector:{findFirst:async()=>({id:'connector',userId:'athlete-A',tokenEnc:'expired'}),findUnique:async()=>({tokenEnc:'fresh'})},
    user:{findUnique:async()=>({timezone:'UTC'})},
    webhookEvent:{createMany:async()=>({count:1}),updateMany:async()=>{log.processed++;return{count:1}}},
    auditLog:{create:async()=>({})},
  };
  const route=load(original,'src/lib/worker-strava.ts',{
    'next/server':{NextResponse},'@/lib/db':{prisma:db},
    '@/lib/sync':{syncUserConnectors:async()=>({results:[{ok:true}]})},
    '@/lib/crypto':{decryptSecret:x=>x},
    '@/lib/activity-store':{storeActivity:async(...x)=>{log.stored.push(x);return true;},deleteImportedActivities:async(...x)=>{log.deleted.push(x);return{count:1}}},
    '@/lib/importers':{stravaGetActivity:async(token,id)=>{log.fetches.push([token,id]);if(token==='expired'||failRefetch)throw Error('401');return{id};},stravaActivityToWorkout:a=>({externalId:`strava:${a.id}`})},
  },{process:{env:{STRAVA_SUBSCRIPTION_ID:'subscription'}},console:{warn:()=>{}}});
  const req=new Request('https://app.example/webhook',{method:'POST',body:JSON.stringify({subscription_id:'subscription',owner_id:'owner',object_type:'activity',aspect_type:deletion?'delete':'update',object_id:'old-activity',event_time:123})});
  return {route,req,log};
}
test('connections: historical Strava update is fetched by ID with refreshed token before acknowledgment',async()=>{
  const {route,req,log}=webhookFixture(); const result=await route.POST(req);
  assert.equal(result.status,200);assert.deepEqual(log.fetches,[['expired','old-activity'],['fresh','old-activity']]);
  assert.equal(log.stored.length,1);assert.equal(log.processed,1);
});
test('connections: successful window sync cannot acknowledge a failed historical refetch',async()=>{
  const {route,req,log}=webhookFixture({failRefetch:true});const result=await route.POST(req);
  assert.equal(result.status,503);assert.equal(log.processed,0);
});
test('connections: Strava deletion uses plan-aware activity deletion scoped to owner and source',async()=>{
  const {route,req,log}=webhookFixture({deletion:true});const result=await route.POST(req);
  assert.equal(result.status,200);assert.equal(log.deleted.length,1);
  assert.equal(log.deleted[0][0],'athlete-A');assert.equal(log.deleted[0][1],'strava');
  assert.equal(JSON.stringify(log.deleted[0][2]),JSON.stringify(['strava:old-activity','old-activity']));
  assert.equal(log.processed,1);
});

function exportFixture() {
  const log={emails:0,approvals:0,prefs:0};
  const workout={id:'w1',userId:'athlete-A',title:'Sprint',sport:'run',durationMin:1,
    prescription:JSON.stringify({steps:[{phase:'active',name:'Sprint',seconds:5,zone:'z7',target:{type:'pace',value:3.2}}]})};
  const dependencies={
    'next/server':{NextResponse},'@/lib/auth':{getCurrentUser:async()=>({id:'athlete-A',timezone:'UTC',email:'athlete@example.test'})},
    '@/lib/db':{prisma:{workout:{findFirst:async()=>workout,update:async()=>{log.approvals++;}},athleteProfile:{findUnique:async()=>({lthr:170})},reminderPref:{findUnique:async()=>{log.prefs++;return{emailEnabled:true}}}}},
    '@/lib/dates':{dayBounds:()=>({start:new Date(),end:new Date()})},'@/lib/telemetry':{meterUsage:async()=>{}},
    '@/lib/fit-export':{buildFitWorkout:()=>Buffer.from('fixture-file'),workoutToFitSpec:x=>x},
    '@/lib/email':{sendEmail:async()=>{log.emails++;return{ok:true}}},
  };
  return {log,workout,dependencies};
}
test('connections: JMM review export preserves 5-second sprint and exact targets without publishing claims',async()=>{
  const {dependencies,workout}=exportFixture();
  const route=load(original,'src/app/api/workout/garmin-json/route.ts',dependencies);
  const r=await route.GET(new Request('https://app.example/api/workout/garmin-json?sessionId=w1'));
  const data=await r.json();assert.equal(r.status,200);
  assert.equal(JSON.stringify(data.prescription),workout.prescription);
  assert.equal(data.delivery.providerPublished,false);assert.equal(data.delivery.deviceReceipt,false);
  assert.equal(data.format,'jmm-prescription-v1');
});
test('connections: plain FIT GET cannot approve or email even with email preferences enabled',async()=>{
  const {dependencies,log}=exportFixture(); const route=load(original,'src/app/api/workout/approve/route.ts',dependencies);
  const r=await route.GET(new Request('https://app.example/api/workout/approve?sessionId=w1'));
  assert.equal(r.status,200);assert.equal(log.approvals,0);assert.equal(log.emails,0);assert.equal(log.prefs,0);
  assert.equal(r.headers.get('X-Delivered-Email'),'0');
});
test('connections: explicit approval POST still approves and honors email preference',async()=>{
  const {dependencies,log}=exportFixture(); const route=load(original,'src/app/api/workout/approve/route.ts',dependencies);
  const r=await route.POST(new Request('https://app.example/api/workout/approve?sessionId=w1',{method:'POST'}));
  assert.equal(r.status,200);assert.equal(log.approvals,1);assert.equal(log.emails,1);
  assert.equal(r.headers.get('X-Delivered-Email'),'1');
});
test('connections: WHOOP event retries error-state connectors and does not hide processing exceptions',async()=>{
  let where,processed=0;
  const route=load(original,'src/lib/worker-whoop.ts',{
    'next/server':{NextResponse},'@/lib/webhook-auth':{verifyWhoopWebhook:()=>true},
    '@/lib/db':{prisma:{webhookEvent:{createMany:async()=>({count:1}),updateMany:async()=>{processed++;}},connector:{findFirst:async args=>{where=args.where;return{userId:'athlete-A'}}}}},
    '@/lib/sync':{syncUserConnectors:async()=>{throw Error('temporary failure')}},
    '@/lib/activity-store':{deleteImportedActivities:async()=>({count:0})},
  },{process:{env:{WHOOP_CLIENT_SECRET:'fixture'}}});
  const r=await route.POST(new Request('https://app.example/webhook',{method:'POST',body:JSON.stringify({user_id:123,event_id:'event'})}));
  assert.equal(r.status,503);assert.equal(processed,0);assert.equal(where.status.in.includes('error'),true);
});
