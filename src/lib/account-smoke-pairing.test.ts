// @ts-nocheck -- execute the real routes with fully isolated database/transport boundaries.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import crypto from "node:crypto";
import { parseTelegramUpdate, verifyTelegramWebhookSecret } from "./telegram-coaching-transport";
import { appMutationOriginAllowed } from "./request-origin";
class ApiError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
function load(file, deps, env) {
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const sandboxModule={exports:{}};
  vm.runInNewContext(compiled,{module:sandboxModule,exports:sandboxModule.exports,require:key=>{
    if(key in deps)return deps[key];throw Error('Unmocked import '+key);
  },process:{env},Request,Response,URL,URLSearchParams,Buffer,Date,console});
  return sandboxModule.exports;
}
const defaults={ENABLE_ACCOUNT_SMOKE_TEST:'true',JMM_SMOKE_TEST_USER_ID:'owner',TELEGRAM_BOT_TOKEN:'fake-token',TELEGRAM_COACHING_WEBHOOK_SECRET:'fake-secret',TELEGRAM_BOT_USERNAME:'ExampleBot',NEXT_PUBLIC_APP_URL:'https://app.example'};
function fixture(overrides={}) {
  const env={...defaults,...overrides};let row=null;let foreign=false;let session='owner';let normalCalls=0;let writes=0;let forceLost=false;
  const allowed=user=>env.ENABLE_ACCOUNT_SMOKE_TEST==='true'&&user===env.JMM_SMOKE_TEST_USER_ID;
  const db={accountSmokeTelegram:{
    upsert:async({create,update})=>{writes++;row=row?{...row,...update}:{...create};return row;},
    findUnique:async()=>row?{...row}:null,
    updateMany:async({where,data})=>{
      if(forceLost||!row||row.userId!==where.userId||row.challengeHash!==where.challengeHash||!(row.challengeExpiresAt>where.challengeExpiresAt.gt))return{count:0};
      row={...row,...data};writes++;return{count:1};
    },
  },communicationPreference:{findFirst:async()=>foreign?{userId:'another'}:null}};
  db.$transaction=async fn=>fn(db);
  const core=load('src/lib/account-smoke-pairing.ts',{
    'node:crypto':crypto,'./db':{prisma:db},'./access':{ApiError},'./account-smoke-test':{smokeAccountAllowed:allowed},'./telegram-coaching-transport':{parseTelegramUpdate},
  },env);
  const webhook=load('src/app/api/coaching/telegram/webhook/route.ts',{
    '@/lib/access':{ApiError},'@/lib/coaching-route':{coachingError:e=>Response.json({error:e.message},{status:e.status||503})},
    '@/lib/coaching-service':{processTelegramWebhook:async()=>{normalCalls++;return{paired:true};}},
    '@/lib/telegram-coaching-transport':{telegramCoachingConfigured:()=>env.ENABLE_TELEGRAM_COACHING==='true',verifyTelegramWebhookSecret:header=>verifyTelegramWebhookSecret(header,env)},
    '@/lib/account-smoke-pairing':core,
  },env);
  const route=load('src/app/api/account/smoke-test/telegram/pair/route.ts',{
    '@/lib/auth':{getCurrentUser:async()=>session?{id:session}:null},'@/lib/access':{ApiError},
    '@/lib/request-origin':{appMutationOriginAllowed:req=>appMutationOriginAllowed(req,env)},'@/lib/ratelimit':{rateLimit:()=>({ok:true})},
    '@/lib/account-smoke-test':{smokeAccountAllowed:allowed},'@/lib/account-smoke-pairing':core,
  },env);
  return {core,route,webhook,env,get row(){return row;},set row(r){row=r;},get writes(){return writes;},get normalCalls(){return normalCalls;},setForeign:()=>foreign=true,setLost:()=>forceLost=true,setSession:s=>session=s};
}
function update(token, changes={}) {return {update_id:1,message:{date:Math.floor(Date.now()/1000),text:`/start ${token}`,chat:{id:123,type:'private'},from:{id:123,is_bot:false},...changes}};}
const tokenFrom=result=>new URL(result.pairingUrl).searchParams.get('start');
function webhookReq(body,secret='fake-secret') {return new Request('https://app.example/api/coaching/telegram/webhook',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify(body)});}
function pairReq(body={consentVersion:'telegram-smoke-pair-v1'},headers={},query='') {return new Request('https://app.example/api/account/smoke-test/telegram/pair'+query,{method:'POST',headers:{origin:'https://app.example','content-type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});}
test('isolated pairing works with ordinary scheduler flags off and stores only challenge hash',async()=>{
  const f=fixture();const result=await f.core.startSmokeTelegramPairing('owner');const token=tokenFrom(result);
  assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(f.row.challengeHash,token);assert.equal(f.row.challengeHash,crypto.createHash('sha256').update(token).digest('hex'));
  const response=await f.webhook.POST(webhookReq(update(token)));
  assert.equal(response.status,200);assert.equal((await response.json()).paired,true);
  assert.equal(f.row.verifiedChatId,'123');assert.equal(f.row.verifiedActorId,'123');assert.ok(f.row.verifiedAt);assert.equal(f.row.challengeHash,null);assert.equal(f.normalCalls,0);
});
test('duplicate and concurrent callbacks claim pairing only once',async()=>{
  const f=fixture();const token=tokenFrom(await f.core.startSmokeTelegramPairing('owner'));
  const responses=await Promise.all(Array.from({length:8},()=>f.core.processSmokeTelegramPairing(update(token))));
  assert.equal(responses.filter(r=>r.paired).length,1);assert.equal(f.writes,2);
});
for(const [name,changes] of [
  ['group',{chat:{id:123,type:'group'}}],['different actor',{from:{id:124}}],['bot',{from:{id:123,is_bot:true}}],
  ['forwarded',{forward_origin:{type:'user'}}],['stale',{date:Math.floor(Date.now()/1000)-301}],['future',{date:Math.floor(Date.now()/1000)+61}],
])test(`invalid ${name} update cannot pair`,async()=>{
  const f=fixture();const token=tokenFrom(await f.core.startSmokeTelegramPairing('owner'));
  assert.equal((await f.core.processSmokeTelegramPairing(update(token,changes))).handled,false);assert.equal(f.row.verifiedAt,null);
});
for(const kind of ['expired','foreign-chat','lost-claim','disabled','owner-changed','wrong-token'])test(`${kind} cannot verify isolated chat`,async()=>{
  const f=fixture();let token=tokenFrom(await f.core.startSmokeTelegramPairing('owner'));
  if(kind==='expired')f.row={...f.row,challengeExpiresAt:new Date(0)};
  if(kind==='foreign-chat')f.setForeign();if(kind==='lost-claim')f.setLost();
  if(kind==='disabled')f.env.ENABLE_ACCOUNT_SMOKE_TEST='false';if(kind==='owner-changed')f.env.JMM_SMOKE_TEST_USER_ID='another';if(kind==='wrong-token')token='x'.repeat(43);
  const result=await f.core.processSmokeTelegramPairing(update(token));assert.notEqual(result.paired,true);assert.equal(f.row.verifiedAt,null);
});
test('unrelated updates retain ordinary handler; off mode ignores them',async()=>{
  for(const on of [true,false]){const f=fixture({ENABLE_TELEGRAM_COACHING:String(on)});const result=await f.webhook.POST(webhookReq(update('x'.repeat(43))));assert.equal(result.status,200);assert.equal(f.normalCalls,on?1:0);}
});
test('webhook rejects wrong secret before parsing or mutation',async()=>{
  const f=fixture();const token=tokenFrom(await f.core.startSmokeTelegramPairing('owner'));
  assert.equal((await f.webhook.POST(webhookReq(update(token),'wrong'))).status,401);assert.equal(f.writes,1);
});
test('webhook bounds body bytes before parsing',async()=>{
  const f=fixture();const response=await f.webhook.POST(webhookReq('é'.repeat(4097)));assert.equal(response.status,413);assert.equal(f.writes,0);
});
test('pair initiation cannot authorize another account or omit real configured bot fields',async()=>{
  const f=fixture();await assert.rejects(f.core.startSmokeTelegramPairing('other'));assert.equal(f.writes,0);
  for(const key of ['TELEGRAM_BOT_TOKEN','TELEGRAM_COACHING_WEBHOOK_SECRET','TELEGRAM_BOT_USERNAME','JMM_SMOKE_TEST_USER_ID','ENABLE_ACCOUNT_SMOKE_TEST']){const bad=fixture({[key]:''});await assert.rejects(bad.core.startSmokeTelegramPairing('owner'));assert.equal(bad.writes,0);}
});
test('route requires own user origin exact consent fixed request and bounded JSON',async()=>{
  for(const [body,headers,query,status] of [[{}, {},'',400],[{consentVersion:'old'}, {},'',400],[{consentVersion:'telegram-smoke-pair-v1',chatId:'123'}, {},'',400],['null',{},'',400],['{',{},'',400],[' '.repeat(1025),{},'',413],[{}, {'content-type':'text/plain'},'',400],[{}, {origin:'https://evil.example'},'',403],[{}, {'sec-fetch-site':'cross-site'},'',403],[{}, {},'?athleteId=owner',403]]){
    const f=fixture();assert.equal((await f.route.POST(pairReq(body,headers,query))).status,status);assert.equal(f.writes,0);
  }
  const f=fixture();assert.equal((await f.route.POST(pairReq())).status,200);assert.equal(f.writes,1);
  f.setSession('other');assert.equal((await f.route.POST(pairReq())).status,403);f.setSession(null);assert.equal((await f.route.POST(pairReq())).status,401);
});
test('new pairing replaces old verification only inside isolated storage',async()=>{
  const f=fixture();let token=tokenFrom(await f.core.startSmokeTelegramPairing('owner'));await f.core.processSmokeTelegramPairing(update(token));
  const again=await f.core.startSmokeTelegramPairing('owner');assert.notEqual(tokenFrom(again),token);assert.equal(f.row.verifiedAt,null);assert.equal(f.row.verifiedChatId,null);
  assert.equal((await f.core.processSmokeTelegramPairing(update(token))).handled,false);
});
