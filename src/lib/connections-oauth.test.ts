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
  static json(body, init) { return new NextResponse(JSON.stringify(body), {...init, headers: {"Content-Type":"application/json", ...init?.headers}}); }
  static redirect(url) { return new NextResponse(null, {status:307, headers:{location:String(url)}}); }
}
function load(root, rel, dependencies, extra={}) {
  const source=fs.readFileSync(path.join(root,rel),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const sandbox={exports:{}};
  vm.runInNewContext(compiled,{module:sandbox,exports:sandbox.exports,require:key=> {
    if(key in dependencies) return dependencies[key];
    const alias = key.startsWith('./') ? '@/lib/' + key.slice(2) : key;
    if(alias in dependencies) return dependencies[alias];
    throw Error('Unmocked dependency '+key);
  },URL,URLSearchParams,Request,Response,Date,Buffer,AbortSignal,AbortController,setTimeout,clearTimeout,Promise,...extra});
  if(sandbox.exports.processVerifiedEvent) sandbox.exports.POST = req => sandbox.exports.processVerifiedEvent(req, 'athlete-A');
  return sandbox.exports;
}
function fixture(root,options={}) {
  const {forcedClaimCount=null,partialScope=false}=options;
  let txn=null, sessionUser='athlete-A'; const jar=new Map();
  const log={tokenRequests:[],tokenCalls:[],profileRequests:[],writes:[],claims:[],queued:[],errors:[],transactionOptions:[]};
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
  },connector:{findFirst:async()=>options.foreignConnection||null,findUnique:async()=>options.previousConnection||null,
    upsert:async args=> {log.writes.push(args);return{id:'connector-1',...args.create};}}};
  db.$transaction = async (work, transactionOptions) => {
    log.transactionOptions.push(transactionOptions);
    if(options.transactionFailure)throw Object.assign(new Error('fixture-database-secret'),{code:'P2034'});
    return work({...db, syncJob:{create:async args=>{log.queued.push(args);return{id:'job'}}}});
  };
  const env={NEXT_PUBLIC_APP_URL:'https://app.example',ENABLE_INTERVALS_CONNECTOR:'true',TOKEN_ENCRYPTION_KEY:'fixture-key',
    INTERVALS_CLIENT_ID:'fixture-client',INTERVALS_CLIENT_SECRET:'fixture-client-secret',...options.env};
  for(const p of ['GOOGLE','OURA','STRAVA','WHOOP']) {env[p+'_CLIENT_ID']='fake-client';env[p+'_CLIENT_SECRET']='fake-secret';}
  const intervals=load(root,'src/lib/intervals-oauth.ts',{
    './db':{prisma:db},'./crypto':{decryptSecret:value=>value},
    './capabilities':{intervalsConnectorEnabled:(e=env)=>e.ENABLE_INTERVALS_CONNECTOR==='true'},
    './provider-fetch':{providerFetch:async(url,init)=>{
      log.tokenRequests.push(String(url));log.tokenCalls.push({url:String(url),init});
      if(options.tokenThrows)throw new Error('fixture-access-secret fixture-client-secret');
      if(options.tokenStatus)return new Response('fixture-access-secret fixture-client-secret',{status:options.tokenStatus});
      return Response.json(options.intervalsReply??{token_type:'Bearer',access_token:'fixture-access-secret',
        scope:'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE',athlete:{id:'321'}});
    }},
  },{process:{env}});
  const oauth=load(root,'src/lib/oauth.ts',{
    'next/server':{NextResponse},'next/headers':{cookies:()=>({get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(key,value,opts)=>opts.maxAge===0?jar.delete(key):jar.set(key,value)})},
    './auth':{getCurrentUser:async()=>sessionUser?{id:sessionUser}:null},'./db':{prisma:db},
    './crypto':{encryptSecret:value=>'enc:v1:fixture:'+value},'./importers':importers,'./oauth-state':state,
    './intervals-oauth':intervals,
    './sync':{syncUserConnectors:async()=>({total:0,results:[]})},
    './background-jobs':{enqueue:async(...args)=>log.queued.push(args)},
  },{process:{env},fetch:async url=> {log.profileRequests.push(String(url));return Response.json({user_id:123});},
    console:{error:(...args)=>log.errors.push(args),warn:()=>{}}});
  return {...oauth,log,intervals,getTxn:()=>txn,setTxn:value=>{txn=value;},clearBrowser:()=>{jar.clear();sessionUser=null;},setSession:value=>{sessionUser=value;}};
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

for (const provider of ['oura', 'strava', 'google-cal', 'google_cal', 'whoop', 'intervals']) {
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
  const log={emails:0,approvals:0,prefs:0,audits:[]};
  const workout={id:'w1',userId:'athlete-A',title:'Sprint',sport:'run',durationMin:1,
    prescription:JSON.stringify({durationMin:1,steps:[{phase:'active',name:'Sprint',seconds:60,zone:'z7',target:{type:'open'}}]})};
  const helpers = require('./canonical-session');
  const canonical = helpers.canonicalSession({athleteId:'athlete-A',workout,prescription:workout.prescription,dateLocal:'2026-10-02',timezone:'UTC'});
  class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }
  const dependencies={
    'next/server':{NextResponse},
    '@/lib/access':{trainingAccess:async()=>({actor:{id:'athlete-A'},athlete:{id:'athlete-A',timezone:'UTC',email:'athlete@example.test'}}),ApiError,errorResponse:e=>NextResponse.json({error:e.message},{status:e.status||500})},
    '@/lib/db':{prisma:{workout:{findFirst:async()=>workout,updateMany:async()=>{const count=log.approvals===0?1:0;log.approvals+=count;return{count};}},athleteProfile:{findUnique:async()=>({lthr:170})},reminderPref:{findUnique:async()=>{log.prefs++;return{emailEnabled:true}}}}},
    '@/lib/telemetry':{meterUsage:async()=>{}},
    '@/lib/canonical-session':helpers,
    '@/lib/effective-prescription':{effectivePrescription:async()=>({workout,canonical,prescription:JSON.parse(workout.prescription)})},
    '@/lib/fit-export':{buildSessionDownload:()=>({bytes:Buffer.from('fixture-file'),filename:'fixture-workout.fit',contentType:'application/octet-stream'})},
    '@/lib/email':{sendEmail:async()=>{log.emails++;return{ok:true}}},
  };
  const db=dependencies['@/lib/db'].prisma;
  db.auditLog={create:async({data})=>{log.audits.push(data);return data;}};
  db.$transaction=async fn=>fn(db);
  return {log,workout,dependencies,revision:canonical.revision};
}
test('connections: unsupported Garmin Connect JSON import route is retired',async()=>{
  const {dependencies}=exportFixture();
  const route=load(original,'src/app/api/workout/garmin-json/route.ts',dependencies);
  const r=await route.GET(new Request('https://app.example/api/workout/garmin-json?sessionId=w1'));
  assert.equal(r.status,410); const data=await r.json(); assert.match(data.error,/FIT|retired|structured/i);
});
test('connections: plain FIT GET cannot approve or email even with email preferences enabled',async()=>{
  const {dependencies,log,revision}=exportFixture(); const route=load(original,'src/app/api/workout/approve/route.ts',dependencies);
  const r=await route.GET(new Request('https://app.example/api/workout/approve?sessionId=w1'));
  assert.equal(r.status,200);assert.equal(log.approvals,0);assert.equal(log.emails,0);assert.equal(log.prefs,0);
  assert.equal(r.headers.get('X-Delivered-Email'),'0');
});
test('connections: explicit approval POST still approves and honors email preference',async()=>{
  const {dependencies,log,revision}=exportFixture(); const route=load(original,'src/app/api/workout/approve/route.ts',dependencies);
  const r=await route.POST(new Request(`https://app.example/api/workout/approve?sessionId=w1&expectedRevision=${revision}`,{method:'POST'}));
  assert.equal(r.status,200);assert.equal(log.approvals,1);assert.equal(log.emails,1);
  assert.equal(r.headers.get('X-Delivered-Email'),'1');
  assert.equal(log.audits[0].action,'workout.approved'); assert.equal(JSON.parse(log.audits[0].after).revision,revision);
});
test('connections: approval rejects missing or stale revision without changes',async()=>{
  for(const expected of ['', '&expectedRevision=old']) {
    const {dependencies,log}=exportFixture(); const route=load(original,'src/app/api/workout/approve/route.ts',dependencies);
    const r=await route.POST(new Request(`https://app.example/api/workout/approve?sessionId=w1${expected}`,{method:'POST'}));
    assert.equal(r.status,409);assert.equal(log.approvals,0);assert.equal(log.audits.length,0);assert.equal(log.emails,0);
  }
});

test('connections: repeated approval does not duplicate email delivery',async()=>{
  const {dependencies,log,revision}=exportFixture(); const route=load(original,'src/app/api/workout/approve/route.ts',dependencies);
  const request=()=>new Request(`https://app.example/api/workout/approve?sessionId=w1&expectedRevision=${revision}`,{method:'POST'});
  const first=await route.POST(request()); const second=await route.POST(request());
  assert.equal(first.status,200);assert.equal(second.status,200);assert.equal(log.approvals,1);assert.equal(log.emails,1);assert.equal(log.prefs,1);
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

async function finishIntervals(f, query = {}) {
  await f.authorize(new Request('https://app.example/api/connectors/intervals/authorize'), 'intervals');
  const url = new URL('https://app.example/api/connectors/intervals/callback');
  url.search = new URLSearchParams({state:f.getTxn().state,code:'fixture-code',...query}).toString();
  return f.callback(new Request(url), 'intervals');
}

test('intervals OAuth: documented scope, form exchange, encrypted identity and durable initial sync',async()=>{
  const f=fixture(original);
  const start=await f.authorize(new Request('https://app.example/api/connectors/intervals/authorize'),'intervals');
  const url=new URL(start.headers.get('location'));
  assert.equal(url.origin,'https://intervals.icu'); assert.equal(url.pathname,'/oauth/authorize');
  assert.equal(url.searchParams.get('scope'),'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE');
  assert.equal(url.searchParams.get('redirect_uri'),'https://app.example/api/connectors/intervals/callback');
  assert.equal(url.searchParams.get('state'),f.getTxn().state);
  f.clearBrowser();f.setSession('athlete-B');
  const r=await f.callback(new Request(`https://app.example/api/connectors/intervals/callback?state=${f.getTxn().state}&code=fixture-code`),'intervals');
  assert.match(r.headers.get('location'),/ok=intervals/);
  const call=f.log.tokenCalls[0];assert.equal(call.url,'https://intervals.icu/api/oauth/token');
  assert.equal(call.init.method,'POST');const form=new URLSearchParams(call.init.body);
  assert.equal(form.get('client_id'),'fixture-client');assert.equal(form.get('code'),'fixture-code');
  assert.equal(form.get('client_secret'),'fixture-client-secret');
  const saved=f.log.writes[0].create;
  assert.equal(saved.userId,'athlete-A');assert.equal(saved.externalRef,'321');
  assert.match(saved.tokenEnc,/^enc:v1:/);assert.equal(saved.refreshEnc,null);assert.equal(saved.expiresAt,null);
  assert.equal(saved.scope,'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE');
  assert.equal(f.log.transactionOptions[0].isolationLevel,'Serializable');assert.equal(f.log.queued.length,1);
  assert.equal(f.log.errors.length,0);
});

test('intervals OAuth: reconnect resets legacy sync markers before the initial history job',async()=>{
  const f=fixture(original,{previousConnection:{externalRef:'321',tokenEnc:'enc:v1:old-api-key',scope:'api_key',
    lastSyncAt:new Date(),lastSyncCount:50,syncStartedAt:new Date()}});
  const r=await finishIntervals(f);assert.match(r.headers.get('location'),/ok=intervals/);
  const data=f.log.writes[0].update;
  assert.equal(data.lastSyncAt,null);assert.equal(data.lastSyncCount,null);assert.equal(data.syncStartedAt,null);
  assert.equal(f.log.queued.length,1);
});

for(const env of [{ENABLE_INTERVALS_CONNECTOR:'false'},{INTERVALS_CLIENT_SECRET:''},{TOKEN_ENCRYPTION_KEY:''}]) {
  test(`intervals OAuth: unavailable configuration ${Object.keys(env)[0]} creates no transaction`,async()=>{
    const f=fixture(original,{env});
    const r=await f.authorize(new Request('https://app.example/api/connectors/intervals/authorize'),'intervals');
    assert.equal(r.status,503);assert.equal((await r.json()).code,'provider_unavailable');assert.equal(f.getTxn(),null);
  });
}

test('intervals OAuth: an athlete or coach cannot authorize another athlete through a query parameter',async()=>{
  const f=fixture(original);
  const r=await f.authorize(new Request('https://app.example/api/connectors/intervals/authorize?athleteId=athlete-B'),'intervals');
  assert.equal(r.status,403);assert.equal(f.getTxn(),null);assert.equal(f.log.tokenCalls.length,0);
});

for(const kind of ['expired','used','wrong-provider','unknown','claim-lost']) {
  test(`intervals OAuth: ${kind} state cannot exchange or bind to returning user`,async()=>{
    const f=fixture(original,{forcedClaimCount:kind==='claim-lost'?0:null});
    await f.authorize(new Request('https://app.example/api/connectors/intervals/authorize'),'intervals');
    const txn={...f.getTxn()};const state=txn.state;
    if(kind==='expired')txn.expiresAt=new Date(Date.now()-1000);
    if(kind==='used')txn.usedAt=new Date();
    if(kind==='wrong-provider')txn.provider='oura';
    f.setTxn(kind==='unknown'?null:txn);f.setSession('athlete-B');
    const r=await f.callback(new Request(`https://app.example/api/connectors/intervals/callback?state=${state}&code=fixture-code`),'intervals');
    assert.match(r.headers.get('location'),/invalid_state/);assert.equal(f.log.tokenCalls.length,0);assert.equal(f.log.writes.length,0);
  });
}

test('intervals OAuth: provider denial consumes state without requesting a token',async()=>{
  const f=fixture(original);const r=await finishIntervals(f,{error:'access_denied'});
  assert.match(r.headers.get('location'),/authorization_declined/);assert.equal(f.log.tokenCalls.length,0);assert.equal(f.log.writes.length,0);
});

for(const [name,options,error] of [
  ['partial scope',{intervalsReply:{token_type:'Bearer',access_token:'fixture-access-secret',scope:'ACTIVITY:READ',athlete:{id:'321'}}},'insufficient_scope'],
  ['missing identity',{intervalsReply:{token_type:'Bearer',access_token:'fixture-access-secret',scope:'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE'}},'invalid_token_response'],
  ['wrong token type',{intervalsReply:{token_type:'Basic',access_token:'fixture-access-secret',scope:'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE',athlete:{id:'321'}}},'invalid_token_response'],
  ['HTTP rejection',{tokenStatus:400},'token_exchange_failed'],
  ['transport failure',{tokenThrows:true},'token_exchange_failed'],
  ['serialization failure',{transactionFailure:true},'connection_failed'],
  ['remote account linked elsewhere',{foreignConnection:{userId:'athlete-B',externalRef:'321'}},'provider_account_already_linked'],
  ['switching existing remote account',{previousConnection:{externalRef:'999',tokenEnc:'enc:v1:old'}},'disconnect_previous_account'],
]) {
  test(`intervals OAuth: ${name} fails closed without exposing credentials`,async()=>{
    const f=fixture(original,options);const r=await finishIntervals(f);
    assert.match(r.headers.get('location'),new RegExp(error));assert.equal(f.log.writes.length,0);assert.equal(f.log.queued.length,0);
    assert.doesNotMatch(r.headers.get('location')+JSON.stringify(f.log.errors),/fixture-access-secret|fixture-client-secret|fixture-database-secret|fixture-code/);
  });
}

test('intervals OAuth: WRITE scopes include READ but Calendar READ cannot publish',async()=>{
  const f=fixture(original);
  assert.equal(f.intervals.intervalsScopesAllow('ACTIVITY:WRITE,WELLNESS:WRITE,CALENDAR:WRITE',['ACTIVITY:READ','WELLNESS:READ','CALENDAR:WRITE']),true);
  assert.equal(f.intervals.intervalsScopesAllow('ACTIVITY:READ,WELLNESS:READ,CALENDAR:READ',['CALENDAR:WRITE']),false);
});

function intervalsCredentialFixture(options={}) {
  let connection={id:'connector-1',userId:'athlete-A',provider:'intervals',externalRef:'321',status:'connected',
    tokenEnc:'enc:v1:fixture',scope:'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE',expiresAt:null,...options.connection};
  const log={requests:[],queries:[],updates:[],audits:[]};let remoteStatus=options.remoteStatus??204;
  const db={connector:{
    findUnique:async args=>{log.queries.push(args);return args.where.userId_provider.userId===connection.userId?{...connection}:null;},
    updateMany:async args=>{log.updates.push(args);const match=Object.entries(args.where).every(([k,v])=>connection[k]===v);
      if(match)connection={...connection,...args.data};return{count:match?1:0};},
  }};
  db.$transaction=async work=>work({...db,auditLog:{create:async args=>{log.audits.push(args);return args.data;}}});
  const api=load(original,'src/lib/intervals-oauth.ts',{
    './db':{prisma:db},'./crypto':{decryptSecret:()=>options.decryptFailure?'':'fixture-access-secret'},
    './capabilities':{intervalsConnectorEnabled:()=>options.enabled!==false},
    './provider-fetch':{providerFetch:async(url,init)=>{log.requests.push({url,init});return new Response(null,{status:remoteStatus});}},
  },{process:{env:{}}});
  return{api,log,getConnection:()=>connection,setRemoteStatus:value=>{remoteStatus=value;}};
}

test('intervals credentials: OAuth Bearer is scoped to the requested athlete',async()=>{
  const f=intervalsCredentialFixture();const auth=await f.api.getIntervalsAuthorization('athlete-A',['CALENDAR:WRITE']);
  assert.equal(auth.authorization,'Bearer fixture-access-secret');assert.equal(auth.athleteId,'321');assert.equal(auth.oauth,true);
  await assert.rejects(f.api.getIntervalsAuthorization('athlete-B',['CALENDAR:WRITE']),/Reconnect/);
});

for(const [name,options] of [
  ['flag off',{enabled:false}],['API key',{connection:{scope:'api_key'}}],['missing scope',{connection:{scope:null}}],
  ['plaintext credential',{connection:{tokenEnc:'legacy-secret'}}],['disconnecting',{connection:{status:'disconnecting'}}],
  ['expired credential',{connection:{expiresAt:new Date(0)}}],['corrupted encryption',{decryptFailure:true}],
])test(`intervals credentials: ${name} cannot publish or import`,async()=>{
  const f=intervalsCredentialFixture(options);await assert.rejects(f.api.getIntervalsAuthorization('athlete-A',['CALENDAR:WRITE']));assert.equal(f.log.requests.length,0);
});

test('intervals disconnect: provider revocation uses Bearer even when feature flag is disabled',async()=>{
  const f=intervalsCredentialFixture({enabled:false});const result=await f.api.disconnectIntervals('athlete-A');
  assert.equal(result.remoteRevoked,true);assert.equal(f.log.requests.length,1);
  assert.equal(f.log.requests[0].url,'https://intervals.icu/api/v1/disconnect-app');
  assert.equal(f.log.requests[0].init.method,'DELETE');assert.equal(f.log.requests[0].init.headers.Authorization,'Bearer fixture-access-secret');
  assert.equal(f.getConnection().tokenEnc,null);assert.equal(f.getConnection().externalRef,null);assert.equal(f.getConnection().status,'disconnected');
  assert.equal(f.log.audits[0].data.actorId,'athlete-A');assert.equal(f.log.audits[0].data.subjectId,'athlete-A');
  assert.equal(f.log.audits[0].data.action,'intervals.auto_publish');
  assert.deepEqual(JSON.parse(f.log.audits[0].data.after),{version:1,enabled:false,externalRef:'321'});
});

test('intervals disconnect: remote failure halts local sync but preserves encrypted token for retry',async()=>{
  const f=intervalsCredentialFixture({remoteStatus:503});
  await assert.rejects(f.api.disconnectIntervals('athlete-A'),error=>error.code==='revocation_failed'&&error.status===502&&!error.message.includes('fixture-access-secret'));
  assert.equal(f.getConnection().status,'disconnecting');assert.equal(f.getConnection().tokenEnc,'enc:v1:fixture');
  assert.equal(JSON.parse(f.log.audits[0].data.after).enabled,false);
  await assert.rejects(f.api.getIntervalsAuthorization('athlete-A'));
  f.setRemoteStatus(204);assert.equal((await f.api.disconnectIntervals('athlete-A')).remoteRevoked,true);assert.equal(f.getConnection().tokenEnc,null);
});

test('intervals disconnect: personal API-key removal cannot claim OAuth revocation',async()=>{
  const f=intervalsCredentialFixture({connection:{scope:'api_key'}});const r=await f.api.disconnectIntervals('athlete-A');
  assert.equal(r.legacyCredential,true);assert.equal(r.remoteRevoked,false);assert.equal(f.log.requests.length,0);assert.equal(f.getConnection().tokenEnc,null);
});

test('intervals connect route: API-key POST is retired without reading submitted credentials',async()=>{
  let disconnected;
  const api=fixture(original).intervals;
  const route=load(original,'src/app/api/connectors/intervals/connect/route.ts',{
    '@/lib/auth':{getCurrentUser:async()=>({id:'athlete-A'})},
    '@/lib/intervals-oauth':{...api,disconnectIntervals:async id=>{disconnected=id;return{ok:true};}},
  });
  const r=await route.POST({json:()=>{throw Error('must not read API key');}});assert.equal(r.status,410);assert.equal((await r.json()).code,'oauth_required');
  const denied=await route.DELETE(new Request('https://app.example/api/connectors/intervals/connect?athleteId=athlete-B'));
  assert.equal(denied.status,403);assert.equal(disconnected,undefined);
});

function connectorsDeleteFixture(options={}) {
  const calls=[];const api=fixture(original).intervals;
  const route=load(original,'src/app/api/connectors/route.ts',{
    '@/lib/auth':{getCurrentUser:async()=>options.signedOut?null:{id:'athlete-A'}},
    '@/lib/db':{prisma:{}},'@/lib/capabilities':{},'@/lib/athlinks':{},
    '@/lib/intervals-oauth':{...api,disconnectIntervals:async id=>{
      calls.push(id);if(options.fail)throw new api.IntervalsOAuthError('revocation_failed','Provider revocation could not be confirmed.',502);
      return{ok:true,remoteRevoked:true};
    }},
  });
  return{route,calls};
}

test('connectors DELETE: rejects unauthenticated, malformed and cross-athlete Intervals requests',async()=>{
  const signedOut=connectorsDeleteFixture({signedOut:true});
  assert.equal((await signedOut.route.DELETE(new Request('https://app.example/api/connectors',{method:'DELETE'}))).status,401);
  const f=connectorsDeleteFixture();
  assert.equal((await f.route.DELETE(new Request('https://app.example/api/connectors',{method:'DELETE',body:'not-json'}))).status,400);
  for(const [suffix,body] of [['',{provider:'intervals',athleteId:'athlete-B'}],['?athleteId=athlete-B',{provider:'intervals'}]]) {
    assert.equal((await f.route.DELETE(new Request('https://app.example/api/connectors'+suffix,{method:'DELETE',body:JSON.stringify(body)}))).status,403);
  }
  assert.equal(f.calls.length,0);assert.equal(signedOut.calls.length,0);
});

test('connectors DELETE: delegates only the session athlete and preserves provider revocation failure',async()=>{
  for(const fail of [false,true]) {
    const f=connectorsDeleteFixture({fail});
    const r=await f.route.DELETE(new Request('https://app.example/api/connectors',{method:'DELETE',body:JSON.stringify({provider:'intervals'})}));
    assert.equal(r.status,fail?502:200);assert.deepEqual(f.calls,['athlete-A']);
    const body=await r.json();assert.equal(fail?body.code:body.remoteRevoked,fail?'revocation_failed':true);
  }
});

function intervalsPreferencesFixture(options={}) {
  let connection={externalRef:'321',status:'connected',scope:'CALENDAR:WRITE',tokenEnc:'enc:v1:fixture',...options.connection};
  const log={audits:[],claims:[],transactions:0,queries:[]};
  const db={connector:{
    findUnique:async args=>{log.queries.push(args);return {...connection};},
    updateMany:async args=>{log.claims.push(args);return{count:connection.status===args.where.status&&connection.tokenEnc===args.where.tokenEnc?1:0};},
  },auditLog:{create:async args=>{log.audits.push(args.data);return args.data;}}};
  db.$transaction=async work=>{
    log.transactions++;
    if(options.disconnectBeforeClaim)connection={...connection,status:'disconnecting'};
    if(options.reconnectBeforeClaim)connection={...connection,tokenEnc:'enc:v1:new-connection'};
    return work(db);
  };
  const route=load(original,'src/app/api/connectors/intervals/preferences/route.ts',{
    '@/lib/auth':{getCurrentUser:async()=>options.signedOut?null:{id:'athlete-A'}},'@/lib/db':{prisma:db},
    '@/lib/capabilities':{intervalsConnectorEnabled:()=>options.enabled!==false},
    '@/lib/intervals-preferences':{readIntervalsAutoPublish:async()=>false},
  },{process:{env:{ENABLE_INTERVALS_AUTO_PUBLISH:options.enabled===false?'false':'true'}}});
  return{route,log};
}
const preferencesRequest=body=>new Request('https://app.example/api/connectors/intervals/preferences',{method:'PUT',body:JSON.stringify(body)});

test('Intervals preferences: consent belongs to the signed-in athlete and current encrypted account',async()=>{
  const f=intervalsPreferencesFixture();const r=await f.route.PUT(preferencesRequest({enabled:true,athleteId:'athlete-B'}));
  assert.equal(r.status,200);assert.equal(f.log.transactions,1);
  assert.equal(f.log.queries[0].where.userId_provider.userId,'athlete-A');
  assert.equal(f.log.claims[0].where.userId,'athlete-A');assert.equal(f.log.claims[0].where.tokenEnc,'enc:v1:fixture');
  assert.equal(f.log.audits[0].actorId,'athlete-A');assert.equal(f.log.audits[0].subjectId,'athlete-A');
  assert.deepEqual(JSON.parse(f.log.audits[0].after),{version:1,enabled:true,externalRef:'321'});
});

for(const change of ['disconnectBeforeClaim','reconnectBeforeClaim'])test(`Intervals preferences: ${change} prevents stale opt-in from restoring consent`,async()=>{
  const f=intervalsPreferencesFixture({[change]:true});const r=await f.route.PUT(preferencesRequest({enabled:true}));
  assert.equal(r.status,409);assert.equal(f.log.audits.length,0);
});

test('Intervals preferences: unauthorized, disabled, unencrypted and malformed opt-ins fail closed',async()=>{
  for(const [options,body,status] of [[{signedOut:true},{enabled:true},401],[{enabled:false},{enabled:true},503],
    [{connection:{tokenEnc:'legacy-api-key'}},{enabled:true},409],[{},{enabled:'true'},400]]) {
    const f=intervalsPreferencesFixture(options);assert.equal((await f.route.PUT(preferencesRequest(body))).status,status);assert.equal(f.log.audits.length,0);
  }
});

test('Intervals preferences: opt-out remains available with connector feature disabled',async()=>{
  const f=intervalsPreferencesFixture({enabled:false});assert.equal((await f.route.PUT(preferencesRequest({enabled:false}))).status,200);
  assert.equal(f.log.claims.length,0);assert.equal(JSON.parse(f.log.audits[0].after).enabled,false);
});
