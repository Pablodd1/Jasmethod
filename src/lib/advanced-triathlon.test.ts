import test from 'node:test';
import assert from 'node:assert/strict';
import { Decoder,Stream } from '@garmin/fitsdk';
import { generatePlan } from './science';
import { parsePlanningSetup } from './planning-setup';
import { boundPlanWeeks } from './planning-bounds';
import { shapeTrainingCycle } from './training-cycle';
import { buildCycleBaselineReviews } from './cycle-review';
import { recordReportedAnchors,reportedAnchor } from './reported-anchors';
import { evidencedTargetProfile } from './anchor-evidence';
import { canonicalSession } from './canonical-session';
import { structuredSteps } from './prescription';
import { buildSessionDownload } from './fit-export';
import { buildSessionNutrition } from './session-nutrition';
import { buildCoachReply } from './coach-conversation';
import { onboardingSectionPayload } from './onboarding-save';
const now=new Date('2026-10-29T00:30:00Z'),timezone='America/New_York',today='2026-10-28';
const entered={ftp:330,runPaceBase:360/1.609344,swimPaceBase:78/.9144,units:'imperial',weightKg:159*.45359237,sweatRateMlH:750,sodiumMgPerL:700};
const profile={...entered,manualPrs:recordReportedAnchors(null,entered,today,today)};
test('dated manual references preserve exact units, source and local date; no test or VO2 measurement is invented',()=>{
 const a=evidencedTargetProfile(profile,[],[],now,timezone);assert.equal(a.ftp,330);assert.equal(a.runPaceBase,entered.runPaceBase);assert.equal(a.swimPaceBase,entered.swimPaceBase);assert.equal(a.lthr,null);assert.equal(a.referenceEvidence.ftp.source,'athlete_reported_reference');
 assert.equal(evidencedTargetProfile(entered,[],[],now,timezone).ftp,null);
 assert.equal(reportedAnchor(profile,'ftp',new Date('2027-03-01T12:00Z'),timezone),null);
 assert.throws(()=>recordReportedAnchors(null,entered,'2026-10-29',today),/actual reference observation date/);
 assert.equal(recordReportedAnchors(profile.manualPrs,entered,today,today),profile.manualPrs);
 assert.equal(reportedAnchor({...profile,ftp:331},'ftp',now,timezone),null);
});
test('the exact advanced triathlon allocation retains two swims and two runs, bounded duration and purposeful work without renewing expired anchors',()=>{
 const setup=parsePlanningSetup({trainingDays:[2,3,4,5,6,0],maxSessionMinutes:300,baselineWeeklyMinutes:720,baselineObservedAt:today,doubleDay:{version:'optional-double-day-v1',weekday:3,purpose:'Optional second familiar easy sport',firstStart:'06:00',secondStart:'18:00',athleteAgreed:true,priorTolerance:true,foodFluidsAvailable:true,recheckBetween:true}},now,timezone);
 const raw=generatePlan({level:'advanced',distance:'half',weeks:24,startDate:new Date('2026-10-28T12:00Z'),weeklyHours:12,reviewedCycle:true});
 const bounded=boundPlanWeeks(raw,setup,12,3,'advanced',[],{preserveWeeklyDose:true});
 const baselineReviews=buildCycleBaselineReviews({profile,tests:[],appliedIds:[],sports:['swim','bike','run'],now,timezone});
 assert.ok(baselineReviews.every(r=>r.source==='athlete_reported_reference'));
 const cycle=shapeTrainingCycle(bounded.weeks,{startKey:today,needsAssessment:false,recoveryReview:false,protectedDays:[],baselineReviews,templatePeriodized:true,events:[{id:'c',name:'Mock 10K',dateKey:'2027-01-17',priority:3},{id:'b',name:'Mock Olympic',dateKey:'2027-02-21',priority:2},{id:'a',name:'Mock half',dateKey:'2027-04-11',priority:1}]});
 for(const week of cycle){assert.ok(week.totalMinutes<=720);for(const s of week.sessions){assert.ok(s.sport!=='swim'||s.minutes<=75);assert.ok(s.sport!=='run'||s.minutes<=120);}for(let day=0;day<7;day++)assert.ok(week.sessions.filter(s=>s.daySlot===day).reduce((n,s)=>n+s.minutes,0)<=300);if(!week.theme.includes('Event')&&!week.theme.includes('event')){assert.ok(week.sessions.filter(s=>s.sport==='swim').length>=2);assert.ok(week.sessions.filter(s=>s.sport==='run').length>=2);}assert.ok(!week.sessions.some(s=>s.doubleDayRole==='secondary'&&/long/i.test(s.title)));}
 assert.ok(cycle.slice(2,10).some(w=>w.sessions.some(s=>Number(s.zone.slice(1))>2)));
 for(const date of ['2027-01-17','2027-02-21','2027-04-11'])assert.ok(!cycle.some((w,wi)=>w.sessions.some(s=>new Date(Date.parse(today+'T12:00Z')+(wi*7+s.daySlot)*86400000).toISOString().slice(0,10)===date)));
});
test('valid dated run, bike and CSS targets survive numerical resolution and parseable FIT; missing swim context remains actionable',()=>{
 const anchors=evidencedTargetProfile(profile,[],[],now,timezone);
 for(const sport of ['run','bike','swim']){
  const swim=sport==='swim'?{schemaVersion:1,kind:'pool',poolLength:{value:25,unit:'yd'},steps:[{kind:'lengths',name:'Easy warm-up',phase:'warmup',zone:'z1',lengths:8,stroke:'freestyle'},{kind:'lengths',name:'Reviewed practice',phase:'active',zone:'z2',lengths:20,stroke:'freestyle'},{kind:'rest',seconds:30},{kind:'lengths',name:'Easy finish',phase:'cooldown',zone:'z1',lengths:4,stroke:'freestyle'}]}:undefined;
  const session=canonicalSession({athleteId:'mock',dateLocal:today,timezone,workout:{id:sport,sport,title:'Reviewed '+sport,durationMin:30},profile:anchors,prescription:{sport,durationMin:30,verdict:'full',steps:structuredSteps(30,'z2','endurance',0,sport),...(swim?{sportStructure:swim}:{})}});
  assert.equal(session.verdict,'ready',session.reason);assert.ok(session.steps.some(s=>s.target.type===(sport==='bike'?'power':'pace')));assert.ok(session.steps.some(s=>s.target.reference?.observedAt===today));
  const file=buildSessionDownload(session,now);assert.ok(file.bytes.length>100);const decoder=new Decoder(Stream.fromByteArray(file.bytes));assert.equal(decoder.checkIntegrity(),true);const parsed=decoder.read();assert.deepEqual(parsed.errors,[]);assert.ok((parsed.messages as any).workoutStepMesgs.some((s:any)=>['speed','power'].includes(s.targetType)));
 }
 const held=canonicalSession({athleteId:'mock',dateLocal:today,timezone,workout:{id:'unsafe',sport:'swim',title:'Generic 200 minute swim',durationMin:200},prescription:{sport:'swim',durationMin:200,steps:structuredSteps(200,'z2','endurance',0,'swim')}});assert.equal(held.verdict,'blocked');assert.match(held.reason,/coach review/);
});
test('canonical fueling preserves concentration versus hourly rate and shows post-workout protein',()=>{
 const session={id:'bike',dateLocal:today,timezone,sport:'bike',durationMin:180,intensity:'z2',verdict:'ready' as const};
 const n=buildSessionNutrition(profile,session,now)!;assert.equal(n.fuel.fluidMlPerHour,750);assert.equal(n.fuel.sodiumMgPerHour,525);assert.ok((n.post.proteinG??0)>0);assert.deepEqual(buildSessionNutrition(profile,session,now),n);
});

test('a general CSS reference does not invent pace for other strokes or drills',()=>{
 const anchors=evidencedTargetProfile(profile,[],[],now,timezone);
 for(const stroke of ['backstroke','breaststroke','butterfly','drill','mixed','im']){
  const sportStructure={schemaVersion:1,kind:'pool',poolLength:{value:25,unit:'yd'},steps:[{kind:'lengths',name:'Explicit stroke practice',phase:'active',zone:'z2',lengths:8,stroke}]};
  const session=canonicalSession({athleteId:'mock',dateLocal:today,timezone,profile:anchors,workout:{id:stroke,sport:'swim',title:'Stroke practice',durationMin:20},prescription:{sport:'swim',durationMin:20,verdict:'full',sportStructure}});
  assert.equal(session.verdict,'ready',session.reason);assert.equal(session.steps[0].target.type,'swimStroke');assert.equal(session.steps[0].target.reference,undefined);
 }
});
test('onboarding Continue saves edited body data atomically with references and does not clear unanswered body fields',()=>{
 const p=onboardingSectionPayload('essentials',{sex:'male',heightCm:'180.34',weightKg:'72.12',ftp:'330',manualPrs:profile.manualPrs},{},{profile:{},setup:null},null);assert.equal(p.sex,'male');assert.equal(p.heightCm,'180.34');assert.equal(p.weightKg,'72.12');assert.equal(p.ftp,'330');assert.equal(p.manualPrs,profile.manualPrs);
 assert.deepEqual(onboardingSectionPayload('essentials',{weightKg:''},{},{profile:{weightKg:72},setup:null},null),{});
});
test('the combined VO2max and long-swim question is handled directly by local rules without a rest-day detour or an invented save',()=>{
 const response=buildCoachReply('Please review my VO2max workout and 200-minute swim with recovery.',{localToday:today});assert.match(response.ruleId,/specific-training-review/);assert.match(response.answer,/200-minute swim/);assert.match(response.answer,/No workout has been changed/);
 for(const minutes of [90,120,251]){const other=buildCoachReply(`Review a ${minutes}-minute swim with recovery.`,{localToday:today});assert.match(other.ruleId,/specific-training-review/);assert.ok(other.answer.includes(`${minutes}-minute swim`));}
 const noDuration=buildCoachReply('Review my swim technique.',{localToday:today});assert.doesNotMatch(noDuration.answer,/200-minute/);
});
