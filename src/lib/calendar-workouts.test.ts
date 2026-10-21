import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calendarWorkoutView,currentOrReportedWorkoutWhere,hasWorkoutReport,unreportedWorkoutWhere} from './calendar-workouts';
import {activityFingerprint,type ActivityDecision} from './activity-evidence';
const row=(id:string,extra:any={})=>({id,userId:'owner',date:new Date('2026-10-19T12:00Z'),sport:'run',title:'Synthetic run',source:'manual',planned:true,completed:false,durationMin:30,...extra});
const plan=(id:string,status='active')=>({plan:{id,status,userId:'owner'}});
function matches(row:any,where:any):boolean {
 return Object.entries(where).every(([key,value]:any)=>{
  if(key==='OR')return value.some((part:any)=>matches(row,part));
  if(key==='AND')return value.every((part:any)=>matches(row,part));
  if(value===null)return row[key]==null;
  if(value&&typeof value==='object'){
   if('not'in value)return row[key]!=null;
   if('notIn'in value)return row[key]!=null&&!value.notIn.includes(row[key]);
   return row[key]!=null&&matches(row[key],value);
  }
  return row[key]===value;
 });
}
test('retirement predicate preserves every report or source field including zero-valued actuals',()=>{
 const predicate=unreportedWorkoutWhere();
 const untouched=row('untouched');assert.equal(matches(untouched,predicate),true);assert.equal(hasWorkoutReport(untouched),false);
 for(const key of Object.keys(predicate)) {
  const reported={...untouched,[key]:key==='completed'?true:0};
  assert.equal(hasWorkoutReport(reported),true,key);
  assert.equal(matches(reported,predicate),false,key);
 }
});

test('database visibility matches calendar before limiting; old report and source evidence remain selectable',()=>{
 const rows=[...Array.from({length:100},(_,i)=>row(`old-${i}`,{planDay:plan('old','archived')})),row('current1',{planDay:plan('current')}),row('current2',{planDay:plan('current')}),row('other-active',{planDay:plan('older-active')}),row('starter',{source:'superseded-starter'}),row('actual-old',{planDay:plan('old','archived'),actualDurationMin:0}),row('energy-old',{planDay:plan('old','archived'),calories:0}),row('provider-old',{planDay:plan('old','archived'),externalId:'source-record'}),row('unknown-old',{planDay:plan('old','archived'),feedbackStatus:'unknown'}),row('foreign',{userId:'someone-else',completed:true}),row('standalone',{source:null})];
 const where=currentOrReportedWorkoutWhere('owner','current');
 const queried=rows.filter(w=>matches(w,where));
 assert.deepEqual(queried.map(w=>w.id),calendarWorkoutView(rows,'owner','current').workouts.map(w=>w.id));
 assert.deepEqual(queried.slice(0,80).map(w=>w.id),['current1','current2','actual-old','energy-old','provider-old','unknown-old','standalone']);
 assert.equal(rows.length,110,'visibility never deletes a saved record');
 const noActive=rows.filter(w=>matches(w,currentOrReportedWorkoutWhere('owner',null)));
 assert.deepEqual(noActive.map(w=>w.id),calendarWorkoutView(rows,'owner',null).workouts.map(w=>w.id));
});
test('calendar hides pending replaced cycles and starters, retains active doubles and actual reports without writes',()=>{
 const rows=[row('active1',{planDay:plan('current')}),row('active2',{planDay:plan('current')}),row('old',{planDay:plan('old','archived')}),row('retired',{source:'superseded-plan',planned:false}),row('starter',{source:'superseded-starter'}),row('reported-old',{planDay:plan('old','archived'),actualDurationMin:27}),row('unknown-old',{planDay:plan('old','archived'),feedbackStatus:'unknown'}),row('foreign',{userId:'other'})];
 const before=JSON.stringify(rows),v=calendarWorkoutView(rows,'owner','current');assert.deepEqual(v.workouts.map(w=>w.id),['active1','active2','reported-old','unknown-old']);assert.equal(v.hiddenUnperformed,3);assert.equal(JSON.stringify(rows),before);assert.ok(v.workouts.every(w=>!('planDay'in w)));
});
test('possible provider copies use one review bundle without identity, duration sum, lost source records or merged data',()=>{
 const rows=[row('a',{source:'strava',planned:false,completed:true,actualDurationMin:63}),row('b',{source:'whoop',planned:false,completed:true,actualDurationMin:65}),row('later',{source:'strava',planned:false,completed:true,date:new Date('2026-10-19T18:00Z'),actualDurationMin:20})];
 const v=calendarWorkoutView(rows,'owner',null);assert.equal(v.workouts.length,3);assert.equal(v.displayWorkouts.length,2);assert.equal(v.possibleCopyGroups,1);const b=v.displayWorkouts.find(w=>w.calendarGroup)!;assert.equal(b.calendarGroup.pending,true);assert.equal(b.durationMin,null);assert.deepEqual(b.calendarGroup.recordIds.sort(),['a','b']);assert.equal(v.workouts[0].actualDurationMin,63);assert.equal(v.workouts[1].actualDurationMin,65);
 const decision:ActivityDecision={version:1,kind:'different_sessions',userId:'owner',primaryId:null,members:rows.slice(0,2).map(w=>({id:w.id,fingerprint:activityFingerprint(w)}))};assert.equal(calendarWorkoutView(rows,'owner',null,[decision]).displayWorkouts.length,3,'Explicitly separate sessions remain separate');
});
