import test from 'node:test';import assert from 'node:assert/strict';
import {deliveryWorkoutPreview} from './delivery-workout-preview';
import {manualWorkoutEmail} from './manual-workout-email-template';
const now=new Date('2026-10-16T09:00:00Z'),context={dateLocal:'2026-10-16',timezone:'America/New_York',verdict:'blocked',language:'en'};
const workout={planned:true,completed:false,feedbackStatus:null,sport:'run',type:'endurance',durationMin:30,startTime:'06:00',title:'PRIVATE_MEDICAL',notes:'PRIVATE_FREE_TEXT',targets:'500W'};
test('pending-check-in preview shows only saved bounded schedule and a private question CTA in English and Spanish',()=>{
 for(const language of ['en','es']){const preview=deliveryWorkoutPreview(workout,{...context,language},now)!;assert.ok(preview);assert.match(preview.summary,/30 min.*06:00/);assert.doesNotMatch(JSON.stringify(preview),/PRIVATE_|500W/);const email=manualWorkoutEmail({language:language as 'en'|'es',kind:'held',dateLabel:context.dateLocal,revision:'rev',workoutUrl:'https://app.example.invalid/daily',settingsUrl:'https://app.example.invalid/settings',heldPreview:preview});assert.match(email.text,language==='en'?/Saved plan preview.*not cleared to execute/:/Vista previa.*no autorizado/);assert.match(email.text,language==='en'?/sleep, energy, soreness, stress, symptoms and available time/:/sueño, energía, molestias, estrés, síntomas/);assert.doesNotMatch(email.html,/cid:/);}
});
test('rest, performed, cancelled, malformed and other-date records cannot create a workout preview',()=>{
 for(const update of [{planned:false},{completed:true},{feedbackStatus:'skipped'},{durationMin:0},{durationMin:-1},{durationMin:NaN},{durationMin:2000},{sport:'unrecognized'}])assert.equal(deliveryWorkoutPreview({...workout,...update},context,now),null);
 assert.equal(deliveryWorkoutPreview(workout,{...context,verdict:'rest'},now),null);assert.equal(deliveryWorkoutPreview(workout,{...context,dateLocal:'2026-10-15'},now),null);
 const preview=deliveryWorkoutPreview(workout,context,now)!;const cancelled=manualWorkoutEmail({language:'en',kind:'cancelled',dateLabel:context.dateLocal,revision:'rev',workoutUrl:'https://app.example.invalid/daily',settingsUrl:'https://app.example.invalid/settings',heldPreview:preview});assert.doesNotMatch(cancelled.text,/planned duration|Saved plan preview/);
});

test('planned recovery email distinguishes scheduled rest from a missed workout or completed rest',()=>{
 const email=manualWorkoutEmail({language:'en',kind:'held',dateLabel:context.dateLocal,revision:'rev',workoutUrl:'https://app.example.invalid/daily',settingsUrl:'https://app.example.invalid/settings',plannedRest:true});assert.match(email.subject,/planned recovery day/);assert.match(email.text,/not a missed workout or a report of completed rest/);assert.doesNotMatch(email.html,/cid:|Garmin\/NewFiles/);
});
