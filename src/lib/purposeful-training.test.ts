import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generatePlan,generateSingleSport,generateHyroxPlan} from './science';
import {parsePlanningSetup} from './planning-setup';
import {boundPlanWeeks} from './planning-bounds';
import {shapeTrainingCycle} from './training-cycle';
import {buildCoachReply} from './coach-conversation';
import {structuredSteps} from './prescription';
const start=new Date('2026-10-19T12:00Z');
const setup=(restPreference='no_fixed_rest')=>parsePlanningSetup({baselineWeeklyMinutes:411,maxSessionMinutes:90,trainingDays:[0,1,2,3,4,5,6],restPreference});
const raw=()=>generatePlan({level:'advanced',distance:'half',weeks:12,startDate:start,weeklyHours:411/60,easyPct:60});
test('new planning preserves template weekly dose once and honors explicit no-fixed-rest intent',()=>{
 const source=raw(),before=JSON.stringify(source);const bounded=boundPlanWeeks(source,setup(),11,1,'advanced',[],{preserveWeeklyDose:true});
 const shaped=shapeTrainingCycle(bounded.weeks,{startKey:'2026-10-19',needsAssessment:true,recoveryReview:false,protectedDays:[],templatePeriodized:true});
 assert.equal(bounded.recoveryPolicy.minimumRestDays,0);assert.equal(shaped[0].totalMinutes,source[0].totalMinutes);assert.ok(shaped[0].totalMinutes>300);assert.equal(shaped[0].restDaySlots.length,0);assert.equal(shaped[0].cycleFactor,1);assert.ok(shaped[0].sessions.some(s=>s.sport==='mobility'&&s.type==='recovery'&&s.minutes<=20));
 assert.equal(JSON.stringify(source),before);assert.ok(shaped.every(w=>w.totalMinutes<=411&&w.sessions.every(s=>s.minutes<=90)));
 assert.ok(shaped[5].totalMinutes<shaped[4].totalMinutes,'Existing template taper remains; no extra cycle ramp is stacked');
 const legacy=boundPlanWeeks(source,setup('level_default'),11,1,'advanced',[],{preserveWeeklyDose:true});assert.equal(legacy.recoveryPolicy.minimumRestDays,1);assert.ok(legacy.weeks[0].restDaySlots.length>=1);
});
test('all five sports and four levels obey reviewed weekly/day ceilings without an arbitrary duration floor',()=>{
 for(const level of ['beginner','amateur','advanced','pro'])for(const sport of ['triathlon','hyrox','bike','run','swim']){
  const s=setup();const weeks=sport==='triathlon'?generatePlan({reviewedCycle:true,level,distance:'half',weeks:12,startDate:start,weeklyHours:411/60}):sport==='hyrox'?generateHyroxPlan({reviewedCycle:true,level,weeks:12,startDate:start,weeklyHours:411/60}):generateSingleSport({reviewedCycle:true,level,sport:sport as 'run'|'bike'|'swim',weeks:12,startDate:start,weeklyHours:411/60,hasRace:false});
  const b=boundPlanWeeks(weeks,s,undefined,1,level,[],{preserveWeeklyDose:true});
  for(const w of b.weeks){assert.ok(w.totalMinutes<=411,`${level} ${sport}`);assert.ok(w.sessions.every(x=>Number.isInteger(x.minutes)&&x.minutes>0&&x.minutes<=90));assert.equal(w.totalMinutes,w.sessions.reduce((n,x)=>n+x.minutes,0));}
 }
});
test('optional pairing preserves every requested available day and does not add weekly time',()=>{
 const s={...setup(),doubleDay:{version:'optional-double-day-v1' as const,weekday:3,purpose:'Convenient familiar pairing',firstStart:'07:00',secondStart:'18:00',athleteAgreed:true,priorTolerance:true,foodFluidsAvailable:true,recheckBetween:true}};
 const b=boundPlanWeeks(raw(),s,11,1,'advanced',[],{preserveWeeklyDose:true}).weeks[0];assert.equal(b.restDaySlots.length,0);assert.equal(b.totalMinutes,raw()[0].totalMinutes);assert.equal(b.sessions.filter(s=>s.doubleDayRole).length,2);
 for(const slot of new Set(b.sessions.map(s=>s.daySlot)))assert.ok(b.sessions.filter(s=>s.daySlot===slot).reduce((n,s)=>n+s.minutes,0)<=90);
 assert.ok(b.sessions.filter(s=>s.doubleDayRole).every(s=>s.sport!=='mobility'),'Recovery mobility is never a donor for a sport double');
});

test('reviewed cycles compare existing recovery waves and event reductions without two taper cuts',()=>{
 const source=generatePlan({level:'advanced',distance:'half',weeks:12,startDate:new Date('2026-10-18T12:00Z'),weeklyHours:411/60,easyPct:60,reviewedCycle:true});
 assert.match(source[5].theme,/recovery/i);assert.ok(source[5].sessions.every(s=>s.coaching?.phase==='recovery'&&!s.coaching?.demanding));assert.ok(!source[5].sessions.some(s=>/taper|sharpening/i.test(s.title)));
 const b=boundPlanWeeks(source,setup(),11,0,'advanced',[],{preserveWeeklyDose:true}).weeks;
 const shaped=shapeTrainingCycle(b,{startKey:'2026-10-18',needsAssessment:true,recoveryReview:false,protectedDays:[],templatePeriodized:true,events:[{id:'a',dateKey:'2026-12-06',priority:'A',name:'Synthetic A race',source:'stored'}]});
 assert.equal(shaped[5].cycleFactor,1,'A 0.55 template recovery is already below the 0.65 event ceiling');assert.equal(shaped[5].totalMinutes,b[5].totalMinutes);assert.ok(shaped[5].totalMinutes>180);assert.ok(shaped.every(w=>w.totalMinutes<=411));
 for(const sport of ['run','swim']){const steps=structuredSteps(60,'z3','interval',0,sport);assert.equal(steps.reduce((n,s)=>n+s.seconds,0),3600);assert.doesNotMatch(JSON.stringify(steps),/Easy spin|Sweet-spot|Rønnestad|Stepto/);assert.ok(steps.some(s=>s.name.includes(sport==='swim'?'Swim effort':'Run effort')));}
});
test('performed/event dates still remove work without catch-up or accidental seven-day compulsion',()=>{
 const b=boundPlanWeeks(raw(),setup(),11,1,'advanced',[],{preserveWeeklyDose:true}).weeks;
 const cycle=shapeTrainingCycle(b,{startKey:'2026-10-19',needsAssessment:true,recoveryReview:false,protectedDays:['2026-10-19'],templatePeriodized:true});
 assert.ok(!cycle[0].sessions.some(s=>s.daySlot===0));assert.ok(cycle[0].totalMinutes<b[0].totalMinutes);assert.ok(cycle[0].volumeDecision.protectedDates.includes('2026-10-19'));
});
test('motivational coaching supports challenge without promises, invented dose or bypassing symptoms',()=>{
 const c={localToday:'2026-10-19'};const reply=buildCoachReply('Challenge me and help me improve',c);assert.equal(reply.ruleId,'coach-conversation-v1:purposeful-progression');assert.match(reply.answer,/cannot be guaranteed/);assert.match(reply.answer,/confirmation/);
 assert.equal(buildCoachReply('Push me, I have chest pain',c).ruleId,'coach-conversation-v1:urgent-symptoms');
});
