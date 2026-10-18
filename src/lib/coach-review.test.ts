import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coachReviewScope,parseCoachReview,sendCoachReviewAlert} from './coach-review';
const input={sourceMessageId:'own-message',question:'Please help me decide how to adjust my training.',clientId:'review-once',confirmed:true,notifyAdmin:false};
test('human handoff requires explicit bounded question, recipients and notification choice',()=>{
  assert.equal(parseCoachReview(input).clientId,'kcoach-review-review-once');
  for(const patch of [{confirmed:false},{question:'short'},{notifyAdmin:'true'},{question:'x'.repeat(1501)},{athleteId:'other'},{question:'Here is my password=secret-value'}])assert.throws(()=>parseCoachReview({...input,...patch}));
});
test('review inbox includes self, granted assignments only, or all athletes for platform admin',async()=>{
  const db={coachAssignment:{findMany:async({where}:any)=>{assert.deepEqual(where,{coachId:'coach',status:'active',consent:'granted'});return [{athleteId:'authorized-athlete'}];}}} as any;
  assert.deepEqual(await coachReviewScope({id:'athlete',role:'athlete'},db),{athleteId:'athlete'});
  assert.deepEqual(await coachReviewScope({id:'coach',role:'coach'},db),{athleteId:{in:['coach','authorized-athlete']}});
  assert.deepEqual(await coachReviewScope({id:'admin',role:'admin'},db),{});
});
test('Telegram alert carries no athlete or question and needs an exact provider receipt; no fallback or retry',async()=>{
  const env={ADMIN_BOT_TOKEN:'synthetic-token',ADMIN_TELEGRAM_CHAT_ID:'123'};let calls=0;
  assert.equal(await sendCoachReviewAlert({},async()=>{throw Error('must not call');}),null);
  const send:typeof fetch=async(_url,init)=>{calls++;const b=JSON.parse(String(init?.body));assert.equal(b.chat_id,'123');assert.deepEqual(Object.keys(b).sort(),['chat_id','disable_web_page_preview','text']);assert.doesNotMatch(b.text,/athlete-id|email|password|heart rate|my training/);return Response.json({ok:true,result:{message_id:5,chat:{id:123}}});};
  assert.equal(await sendCoachReviewAlert(env,send),5);assert.equal(calls,1);
  for(const response of [Response.json({ok:false}),Response.json({ok:true,result:{message_id:5,chat:{id:999}}}),Response.json({ok:true,result:{message_id:0,chat:{id:123}}})])assert.equal(await sendCoachReviewAlert(env,async()=>response),null);
});
