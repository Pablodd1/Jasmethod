import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { athleteDayReview } from './athlete-day-review';
import { parsePlanningSetup } from './planning-setup';
import { observationsFromForm, observedSweatRate, parseSessionObservations, readSessionObservations, weightChange } from './session-observations';
import { sessionPurposeTitle } from './session-purpose-title';
import { AthleteDayReview } from '../components/daily-training/AthleteDayReview';
import { SessionMeasurementsFields } from '../components/daily-training/SessionMeasurementsFields';
import { updateWorkout, workoutHasHistory, workoutRevision } from './workout-update';
import { parseActualFueling, readActualFueling } from './actual-fueling';
import { analyzeHydration } from './adaptive';
import { TrainingTargetSelector } from '../components/daily-training/UniversalWorkoutCard';
import { universalWorkoutExample } from './universal-workout-example';
const row = {id:'synthetic-ride',userId:'athlete-a',date:new Date('2026-10-17T10:00:00Z'),completed:true,planned:false,source:'garmin',sport:'bike',title:'Recorded ride',durationMin:138,avgHr:140,avgPower:180,calories:1200,distanceKm:79.54};
test('day review scopes athlete/local day, retains actuals, never substitutes planned duration',()=>{
 const review=athleteDayReview([row,{...row,id:'foreign',userId:'athlete-b'},{...row,id:'tomorrow',date:new Date('2026-10-18T10:00:00Z')},{...row,id:'reported-plan',planned:true,actualDurationMin:null}], 'athlete-a','2026-10-17','America/New_York',parsePlanningSetup({baselineWeeklyMinutes:90}));
 assert.equal(review.records.length,2);assert.equal(review.baselineWeeklyMinutes,90);
 assert.equal(review.records[0].minutes,138);assert.equal(review.records[0].avgPower,180);assert.equal(review.records[1].minutes,null);
 assert.equal(review.records[1].paceSecondsPerKm,null);assert.equal(Object.hasOwn(review,'totalMinutes'),false);
});
test('ambiguous cross-provider records stay separate, with a review warning and no summed training',()=>{
 const review=athleteDayReview([row,{...row,id:'whoop-copy',source:'whoop',durationMin:156}], 'athlete-a','2026-10-17','America/New_York',null);
 assert.equal(review.possibleCopies,1);assert.equal(review.records.length,2);
 const html=renderToStaticMarkup(React.createElement(AthleteDayReview,{review,plannedMinutes:6,onReport:()=>{}}));
 assert.match(html,/not added together/);assert.match(html,/Review this short session/);assert.match(html,/Log effort &amp; recovery/);
 assert.doesNotMatch(html,/294 min/);
});
test('observation forms preserve unknown/zero and reject invalid measurements rather than inventing targets',()=>{
 const f=new FormData();f.set('avgPower','0');f.set('calories','');f.set('preWeightKg','70.25');
 assert.deepEqual(observationsFromForm(f),{avgPower:0,calories:null,preWeightKg:70.25});
 assert.deepEqual(parseSessionObservations({}),{});
 for(const value of [{ftp:220},{avgHr:0},{avgPower:'200'},{calories:1.5},{postWeightKg:0},{preWeightKg:Infinity}])assert.throws(()=>parseSessionObservations(value));
 assert.equal(readSessionObservations({avgHr:0,avgPower:NaN}).avgHr,null);
});
test('mass change never becomes sweat rate without complete actual fluid/urine/duration reports',()=>{
 assert.deepEqual(weightChange(70,69),{lostKg:1,percent:1.43});
 assert.equal(observedSweatRate(70,69,500,null,60),null);
 assert.equal(observedSweatRate(70,69,null,0,60),null);
 assert.equal(observedSweatRate(70,69,500,0,0),null);
 assert.deepEqual(observedSweatRate(70,69,500,0,60),{litersPerHour:1.5,method:'reported_mass_balance_estimate'});
 assert.equal(observedSweatRate(70,72,0,0,60),null);
 assert.equal(parseActualFueling({urineMl:0})?.urineMl,0);
 const details={schemaVersion:1,values:{},fueling:{schemaVersion:1,carbsG:60,fluidMl:500,urineMl:0,giSymptoms:'none'}};
 assert.equal(readActualFueling(details)?.urineMl,0);
 const html=renderToStaticMarkup(React.createElement(SessionMeasurementsFields,{saved:{preWeightKg:70,postWeightKg:69},details,actualMinutes:60}));
 assert.match(html,/1.5 L\/h/);assert.match(html,/not automatically converted into carbohydrate grams/);
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(SessionMeasurementsFields,{saved:{preWeightKg:70,postWeightKg:69}})),/L\/h/);
});
test('saved title loses unsupported strides without deleting real stride blocks or changing an unknown held structure',()=>{
 assert.equal(sessionPurposeTitle('Run: Easy + Strides',[{name:'Steady effort',phase:'active'}]),'Run: Easy');
 assert.equal(sessionPurposeTitle('Run: Easy + Strides',[{name:'4 strides',phase:'active'}]),'Run: Easy + Strides');
 assert.equal(sessionPurposeTitle('Run: Easy + Strides',[]),'Run: Easy + Strides');
});
test('explicit running watts keep their sport label and complementary zone-reference RPE without inventing HR',()=>{
 const card=universalWorkoutExample();
 card.session.steps=[{...card.session.steps[0],componentSport:'run',target:{type:'power',source:'explicit',low:200,high:220,label:'200–220 W'}}];
 const html=renderToStaticMarkup(React.createElement(TrainingTargetSelector,{card}));
 assert.match(html,/run · 200–220 W/);assert.match(html,/RPE/);assert.match(html,/zone reference/);assert.doesNotMatch(html,/bpm/);
});
test('legacy hydration advice cannot equate weight change to sweat rate, diagnose dehydration or prescribe a forced replacement dose',()=>{
 for(const post of [70,71,69,68,67]) {
  const result=analyzeHydration(70,post);
  assert.doesNotMatch(result.advice,/that's your sweat rate|Drink 1\.5|Replace 150%|significant dehydration|ease tomorrow/);
  assert.match(result.advice,/mass|Weight change/);
 }
});
test('audited owner writer saves measurements and calories without changing plan or profile, rejects future actuals',async()=>{
 const athlete={id:'athlete-a',timezone:'UTC'}; let current:any={...row,date:new Date(),prescription:'saved',planDay:null};let writes=0,audits=0;
 const tx:any={workout:{findFirst:async({where}:any)=>where.userId===current.userId?current:null,update:async({data}:any)=>{writes++;current={...current,...data};return current;}},auditLog:{create:async()=>{audits++;}}};
 const beforeRevision=workoutRevision(current);
 await updateWorkout(athlete.id,athlete,{sessionId:row.id,calories:1100,preWeightKg:70,postWeightKg:69.5},tx);
 assert.equal(current.calories,1100);assert.equal(current.prescription,'saved');assert.ok(current.feedbackAt);assert.notEqual(workoutRevision(current),beforeRevision);assert.equal(writes,1);assert.equal(audits,1);
 assert.equal(workoutHasHistory({planned:true,calories:0}),true);
 for(const bad of [{preWeightKg:0},{calories:true},{calories:NaN},{avgHr:1}])await assert.rejects(updateWorkout(athlete.id,athlete,{sessionId:row.id,...bad},tx));
 await assert.rejects(updateWorkout('athlete-b',{...athlete,id:'athlete-b'},{sessionId:row.id,calories:100},tx),/not found/);
 current.date=new Date(Date.now()+2*86400000);
 await assert.rejects(updateWorkout(athlete.id,athlete,{sessionId:row.id,calories:100},tx),/Future sessions/);
 assert.equal(writes,1);
});
