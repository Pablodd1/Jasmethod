// @ts-nocheck -- isolated route VM replaces all auth/database/SMTP boundaries.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import crypto from 'node:crypto';
import { MANUAL_EMAIL_CONSENT, parseManualEmailSettings } from './manual-workout-email';
function fixture() {
  let user: any = { id: 'athlete-a', email: 'athlete-a@example.invalid', timezone: 'UTC', language: 'en' }, pref: any = null, sends: any[] = [], writes: any[] = [];
  const model = {
    findUnique: async ({where}) => { assert.equal(where.userId, 'athlete-a'); return pref; },
    upsert: async a => { writes.push(a); pref = pref ? {...pref,...a.update} : {...a.create}; return pref; },
    updateMany: async ({where,data}) => {
      assert.equal(where.userId, 'athlete-a');
      if (where.OR && pref?.challengeSentAt && !(pref.challengeSentAt < where.OR[1].challengeSentAt.lt)) return {count:0};
      if (where.challengeHash && pref?.challengeHash !== where.challengeHash) return {count:0};
      if (where.challengeAttempts && pref.challengeAttempts >= where.challengeAttempts.lt) return {count:0};
      pref = {...pref,...data, ...(data.challengeAttempts?.increment ? {challengeAttempts:pref.challengeAttempts+1} : {})}; writes.push(data); return {count:1};
    },
  };
  const db={manualWorkoutEmailPreference:model,manualWorkoutEmailOutbox:{updateMany:async()=>({count:1})}};
  db.$transaction=async work=>work(db);
  const deps={
    '@/lib/manual-workout-email-locale':{manualEmailLanguage:language=>['en','es'].includes(language)?language:null}, '@/lib/auth':{getCurrentUser:async()=>user}, '@/lib/db':{prisma:db}, 'node:crypto':crypto,
    '@/lib/manual-workout-email':{manualEmailConfigured:()=>true, MANUAL_EMAIL_CONSENT, parseManualEmailSettings},
    '@/lib/manual-workout-email-transport':{sendManualEmail:async msg=>{sends.push(msg);return {status:'accepted'}}},
  };
  function load(file) {
    const compiled=ts.transpileModule(fs.readFileSync(`src/app/api/workout-email/${file}/route.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const sandboxModule={exports:{}};
    vm.runInNewContext(compiled,{module:sandboxModule,exports:sandboxModule.exports,require:key=>{if(!(key in deps))throw Error(`Unmocked ${key}`);return deps[key]},Response,Date,Buffer,Intl});
    return sandboxModule.exports;
  }
  return {load,sends,writes,setLanguage:language=>{user.language=language},getPref:()=>pref,setPref:p=>{pref=p},signOut:()=>{user=null}};
}
const req=(body)=>new Request('https://app.example.invalid/api/workout-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const settings={enabled:true,daily:true,revisions:true,timezone:'UTC',minuteOfDay:360,leadMinutes:60,consentVersion:MANUAL_EMAIL_CONSENT};
test('email routes require account authentication and reject unverified or client-selected recipients',async()=>{
  const f=fixture(), route=f.load('preferences');
  assert.equal((await route.PUT(req(settings))).status,409);
  assert.equal((await route.PUT(req({...settings,to:'victim@example.invalid',userId:'athlete-b'}))).status,400);
  assert.equal(f.writes.length,0);
  f.signOut();assert.equal((await route.GET()).status,401);assert.equal((await route.PUT(req(settings))).status,401);
  assert.equal((await f.load('verify').POST(req({action:'request',sendCodeToAccountEmail:true}))).status,401);
});
test('verification sends only explicitly requested account email, persists only hash, binds code and rate limits',async()=>{
  const f=fixture(), route=f.load('verify');
  assert.equal((await route.POST(req({action:'request'}))).status,400);assert.equal(f.sends.length,0);
  const response=await route.POST(req({action:'request',sendCodeToAccountEmail:true,to:'victim@example.invalid'}));
  assert.equal(response.status,202);assert.equal(f.sends[0].to,'athlete-a@example.invalid');
  const code=f.sends[0].text.match(/code is ([A-F0-9]{12})/)[1];
  assert.doesNotMatch(JSON.stringify(f.getPref()),new RegExp(code));assert.equal(f.getPref().enabled,false);
  assert.equal((await route.POST(req({action:'request',sendCodeToAccountEmail:true}))).status,429);
  assert.equal((await route.POST(req({action:'confirm',code:'000000000000'}))).status,400);
  assert.equal((await route.POST(req({action:'confirm',code}))).status,200);
  assert.ok(f.getPref().verifiedAt);assert.equal(f.getPref().challengeHash,null);assert.equal(f.getPref().enabled,false);
  assert.equal((await route.POST(req({action:'confirm',code}))).status,409);
  assert.equal((await f.load('preferences').PUT(req(settings))).status,200);
  assert.equal(f.getPref().enabled,true);assert.equal(f.getPref().calendarGuidance,false);
});
test('verification cannot use expired, exhausted or another recipient challenge',async()=>{
  for(const override of [{challengeExpiresAt:new Date(0)},{challengeAttempts:5},{recipient:'different@example.invalid'}]) {
    const f=fixture();f.setPref({userId:'athlete-a',recipient:'athlete-a@example.invalid',challengeHash:'a'.repeat(64),challengeExpiresAt:new Date(Date.now()+60000),challengeAttempts:0,...override});
    assert.equal((await f.load('verify').POST(req({action:'confirm',code:'123456789ABC'}))).status,409);
  }
});

test('verification email and preferences use saved Spanish and reject unsupported saved language',async()=>{
  const f=fixture();f.setLanguage('es');
  const response=await f.load('verify').POST(req({action:'request',sendCodeToAccountEmail:true}));
  assert.equal(response.status,202);assert.match(f.sends[0].subject,/Verifica/);assert.match(f.sends[0].text,/Tu código/);assert.doesNotMatch(f.sends[0].text,/Your verification/);
  const g=fixture();g.setLanguage('fr');
  assert.equal((await g.load('verify').POST(req({action:'request',sendCodeToAccountEmail:true}))).status,409);assert.equal(g.sends.length,0);
  assert.equal((await g.load('preferences').PUT(req(settings))).status,409);
  assert.equal((await g.load('preferences').PUT(req({...settings,enabled:false,calendarGuidance:true}))).status,200);
});
