import test from 'node:test';
import assert from 'node:assert/strict';
import { DOUBLE_DAY_VERSION, doubleDayTiming, type DoubleDayPreference, parseDoubleDay, doubleDayReadiness, reviewSecondaryDoubleDay, invalidateDoubleDay } from './double-day';
import { parsePlanningSetup } from './planning-setup';
import { boundPlanWeeks } from './planning-bounds';
import { effectiveSessionFromRecords } from './effective-prescription';
import { saveProfile, profileRevision } from './profile-service';
import type { PlanSession } from './science';
const preference:DoubleDayPreference={version:DOUBLE_DAY_VERSION,weekday:3,purpose:'Preserve quality and fit easy aerobic work around work hours',firstStart:'07:00',secondStart:'15:00',athleteAgreed:true,priorTolerance:true,foodFluidsAvailable:true,recheckBetween:true};
const now=new Date('2026-10-07T14:00Z');
const exercise=(zone:'z2'|'z4'='z2'):PlanSession=>({sport:'bike',title:zone==='z4'?'Priority intervals':'Easy bike',minutes:40,zone,type:zone==='z4'?'interval':'endurance',description:'Template'});
const week={week:1,theme:'Base',sessions:Array.from({length:7},(_,i)=>exercise(i===3?'z4':'z2')),totalMinutes:280};
const setup=parsePlanningSetup({trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:120,baselineWeeklyMinutes:400,doubleDay:preference},now);
test('double-day parser never treats absent/false agreement or practical checks as yes',()=>{
 assert.equal(parseDoubleDay(null),null);
 for(const key of ['athleteAgreed','priorTolerance','foodFluidsAvailable','recheckBetween']) {
  assert.equal(doubleDayReadiness({...preference,[key]:false},[3]).ready,false);
  assert.throws(()=>parseDoubleDay({...preference,[key]:undefined}),/missing is not yes/);
 }
 for(const bad of [{weekday:7},{weekday:'3'},{purpose:''},{firstStart:'25:00'},{secondStart:'06:00'},{version:'unknown'},{unexpected:true}])assert.throws(()=>parseDoubleDay({...preference,...bad}));
 assert.equal(doubleDayReadiness(preference,[1,2]).ready,false);
});
test('optional pair relocates one existing easy session without adding weekly load and preserves time/rest limits',()=>{
 const before=JSON.stringify(week);
 const ordinary=boundPlanWeeks([week],{...setup,doubleDay:null},10,0,'advanced').weeks[0];
 const paired=boundPlanWeeks([week],setup,10,0,'advanced').weeks[0];
 const pair=paired.sessions.filter(s=>s.doubleDayRole);
 assert.equal(pair.length,2);
 assert.deepEqual(pair.map(s=>s.startTime),['07:00','15:00']);
 assert.ok(pair.every(s=>s.daySlot===3));
 assert.equal(pair[1].zone,'z2');
 assert.equal(paired.totalMinutes,ordinary.totalMinutes);
 assert.ok(paired.restDaySlots.length>=ordinary.restDaySlots.length);
 assert.ok(pair.reduce((n,s)=>n+s.minutes,0)<=setup.maxSessionMinutes!);
 assert.ok(paired.restDaySlots.includes(pair[1].movedFromSlot!));
 assert.equal(JSON.stringify(week),before);
});
test('refusal, insufficient time/separation, race week and missing donor retain single sessions with reason',()=>{
 for(const altered of [{...setup,doubleDay:{...preference,athleteAgreed:false}},{...setup,maxSessionMinutes:60},{...setup,doubleDay:{...preference,secondStart:'07:30'}},{...setup,doubleDay:{...preference,weekday:6}}]){
  const result=boundPlanWeeks([week],altered,10,0,'advanced').weeks[0];
  assert.equal(result.sessions.filter(s=>s.doubleDayRole).length,0);assert.ok(result.doubleDayNote);
 }
 for(const input of [{...week,theme:'Race taper'},{...week,sessions:week.sessions.map(()=>exercise('z4'))}])assert.equal(boundPlanWeeks([input],setup,10,0,'advanced').weeks[0].sessions.filter(s=>s.doubleDayRole).length,0);
 const duplicates={...week,sessions:Array.from({length:14},()=>exercise())};
 const noConsent=boundPlanWeeks([duplicates],{...setup,doubleDay:null},20,0,'pro').weeks[0];
 assert.equal(new Set(noConsent.sessions.map(s=>s.daySlot)).size,noConsent.sessions.length);
});
function pairRecords() {
 const pair=[{id:'first',sport:'bike',type:'interval',intensity:'z4',durationMin:40,startTime:'07:00'},{id:'second',sport:'bike',type:'endurance',intensity:'z2',durationMin:40,startTime:'15:00'}];
 return pair.map((s,i)=>({...s,date:new Date('2026-10-07T00:00Z'),title:i?'Easy bike':'Priority',userId:'athlete',planned:true,originalPlan:JSON.stringify({...s,title:i?'Easy bike':'Priority',doubleDay:{version:DOUBLE_DAY_VERSION,setupRevision:'setup-v1',dateLocal:'2026-10-07',purpose:preference.purpose,role:i?'secondary':'primary',pair}}),prescription:JSON.stringify({sport:s.sport,intensity:s.intensity,durationMin:40,verdict:'full',steps:[{name:'Work',seconds:2400,zone:s.intensity,phase:'active',target:{type:'open'}}]})}));
}
function secondaryInput(){const [rawFirst,workout]=pairRecords();const first={...rawFirst,completed:true,feedbackStatus:'completed',feedbackAt:new Date('2026-10-07T08:00Z'),actualDurationMin:40,actualSport:'bike',rpe:7};return {workout,sameDay:[first,workout],preference,setupRevision:'setup-v1',setupSource:'athlete_reported',timezone:'UTC',checkinRecordedAt:Date.parse('2026-10-07T14:00Z'),now};}
test('second session requires current athlete agreement, unchanged pair and fresh post-first check-in',()=>{
 const input=secondaryInput();assert.equal(reviewSecondaryDoubleDay(input),null);
 for(const change of [{preference:null},{setupSource:'coach_set'},{setupRevision:'new'},{checkinRecordedAt:Date.parse('2026-10-07T07:00Z')},{checkinRecordedAt:NaN},{workout:{...input.workout,startTime:'16:00'}},{workout:{...input.workout,durationMin:41}},{workout:{...input.workout,originalPlan:invalidateDoubleDay(input.workout.originalPlan)}}])assert.match(reviewSecondaryDoubleDay({...input,...change})!,/on hold/);
 for(const change of [{feedbackStatus:'skipped'},{actualDurationMin:null},{rpe:null},{feedbackAt:null},{userId:'other-athlete'},{actualSport:'run'},{actualSport:null},{rpe:NaN},{rpe:11},{originalPlan:invalidateDoubleDay(input.sameDay[0].originalPlan)}])assert.match(reviewSecondaryDoubleDay({...input,sameDay:[{...input.sameDay[0],...change},input.workout]})!,/on hold/);
 assert.match(reviewSecondaryDoubleDay({...input,sameDay:[input.workout]})!,/unavailable/);
});
test('canonical second-session gate preserves urgent safety and does not export before first-session report',()=>{
 const input=secondaryInput();
 const answers={sleep:3,soreness:3,motivation:3,energy:3,stress:3,sick:false,newPain:false,urgentSymptoms:false,availableMin:80,inputMetadata:{recordedAt:new Date(input.checkinRecordedAt).toISOString()}};
 const records={userId:'athlete',timezone:'UTC',now,workout:input.workout,profile:{birthYear:1990,experience:'advanced',goal:'cycle',injured:false,weeklyHours:8},planning:{ready:true,missing:[],review:[],ruleId:'fixture'},sameDaySessions:input.sameDay,doubleDayContext:{preference,setupRevision:'setup-v1',source:'athlete_reported'},checkin:{date:input.workout.date,answers:JSON.stringify(answers),adaptation:JSON.stringify({verdict:'full',durationFactor:1,intensityCap:'z7'})}};
 assert.equal(effectiveSessionFromRecords(records).canonical.verdict,'ready');
 for(const replacement of [{version:'unknown'}, {pair:[]}, {role:'primary'}, null]) {
  const original=JSON.parse(input.workout.originalPlan);
  original.doubleDay=replacement===null?null:{...original.doubleDay,...replacement};
  const held=effectiveSessionFromRecords({...records,workout:{...input.workout,originalPlan:JSON.stringify(original)}});
  assert.equal(held.canonical.verdict,'blocked','invalid present pair metadata cannot become an unpaired session');
 }

 assert.equal(effectiveSessionFromRecords({...records,sameDaySessions:pairRecords()}).canonical.verdict,'blocked');
 for(const originalPlan of [null,'{broken',JSON.stringify({title:'Lost pairing'})]) assert.equal(effectiveSessionFromRecords({...records,workout:{...input.workout,originalPlan}}).canonical.verdict,'blocked');
 const urgent=effectiveSessionFromRecords({...records,checkin:{...records.checkin,answers:JSON.stringify({...answers,urgentSymptoms:true})}});
 assert.match(urgent.canonical.reason,/urgent|medical|emergency/i);
 assert.doesNotMatch(urgent.canonical.reason,/Optional second session/);
});
test('coach cannot manufacture athlete agreement; owner save is audited and revision bound',async()=>{
 await assert.rejects(saveProfile('coach',{id:'athlete',timezone:'UTC'},{expectedRevision:'x',setup:{doubleDay:preference}}),/Only the athlete/);
 const audits:any[]=[];const tx:any={athleteProfile:{findUnique:async()=>null,upsert:async()=>({id:'profile'})},auditLog:{findFirst:async()=>null,create:async(q:any)=>{audits.push(q);return q}}};
 await saveProfile('athlete',{id:'athlete',timezone:'UTC'},{expectedRevision:profileRevision(null),expectedSetupRevision:null,setup:{doubleDay:preference}},tx);
 assert.equal(JSON.parse(audits.find(a=>a.data.action==='profile.setup').data.after).doubleDay.athleteAgreed,true);
 await assert.rejects(saveProfile('athlete',{id:'athlete',timezone:'UTC'},{expectedRevision:'stale',expectedSetupRevision:null,setup:{doubleDay:preference}},tx),/changed while/);
});

test('actual local-time checks reject nonexistent and overlapping DST pair times',()=>{
 assert.throws(()=>doubleDayTiming('2026-03-08','America/New_York',[{startTime:'02:30',durationMin:20},{startTime:'05:00',durationMin:20}]),/does not exist/);
 assert.throws(()=>doubleDayTiming('2026-03-08','America/New_York',[{startTime:'01:30',durationMin:45},{startTime:'03:00',durationMin:20}]),/overlaps/);
 assert.equal(doubleDayTiming('2026-10-07','UTC',[{startTime:'07:00',durationMin:40},{startTime:'15:00',durationMin:40}]).length,2);
});

test('an existing shorter easy donor is selected if the first eligible one exceeds the daily cap',()=>{
 const sessions=[{...exercise(),minutes:100},{...exercise(),minutes:90},{...exercise(),minutes:30}];
 const p={...preference,weekday:0};
 const result=boundPlanWeeks([{...week,sessions}],{...setup,doubleDay:p,maxSessionMinutes:140},10,0,'pro').weeks[0];
 const pair=result.sessions.filter(s=>s.doubleDayRole);
 assert.equal(pair.length,2);assert.equal(pair[1].minutes,30);assert.equal(pair[1].movedFromSlot,2);
 assert.equal(result.totalMinutes,220);
});
