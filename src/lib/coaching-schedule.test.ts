import {test} from 'node:test';
import assert from 'node:assert/strict';
import {boundPlanWeeks} from './planning-bounds';
import {parsePlanningSetup} from './planning-setup';
import type {GeneratedWeek,PlanSession} from './science';
import {coachingWeekTemplate} from './coaching-week-template';
import {DOUBLE_DAY_VERSION, type DoubleDayPreference} from './double-day';

const unit=(sport:PlanSession['sport'],minutes=40,demanding=false,recipe:NonNullable<PlanSession['coaching']>['recipe']='aerobic'):PlanSession=>({sport,minutes,zone:'z2',type:sport==='strength'?'strength':'endurance',title:`${sport} ${recipe}`,description:'Complete reviewed unit',coaching:{recipe,phase:'foundation',purpose:`${sport} purpose`,demanding,minimumMinutes:20,priority:1}});
const week=(sessions:PlanSession[]):GeneratedWeek=>({week:1,theme:'Development',templateVersion:'coaching-structure-v1',sessions,totalMinutes:sessions.reduce((n,s)=>n+s.minutes,0)});
const setup=(days=[0,1,2,3,4,5,6],budget=400,max=120)=>parsePlanningSetup({trainingDays:days,baselineWeeklyMinutes:budget,maxSessionMinutes:max});

test('complete triathlon units retain two strength exposures and explicit brick without overlaps or extra minutes',()=>{
  const brick=unit('brick',70,true,'brick');brick.coaching!.legs=[{sport:'bike',minutes:50,zone:'z2'},{sport:'run',minutes:20,zone:'z2'}];
  const raw=week([unit('swim'),unit('run'),unit('bike'),unit('strength',30,true,'strength-a'),unit('strength',30,false,'strength-b'),brick]);
  const before=JSON.stringify(raw);
  const result=boundPlanWeeks([raw],setup(),8,1,'advanced').weeks[0];
  assert.equal(result.sessions.length,6);
  assert.equal(result.sessions.filter(s=>s.sport==='strength').length,2);
  assert.equal(result.sessions.filter(s=>s.sport==='brick').length,1);
  assert.equal(new Set(result.sessions.map(s=>s.daySlot)).size,6);
  assert.equal(result.totalMinutes,250);
  assert.ok(result.restDaySlots.length>=1);
  assert.equal(JSON.stringify(raw),before);
});

test('five available days preserve a valid brick, swimming and both supporting strength exposures',()=>{
  const raw=coachingWeekTemplate({sport:'triathlon',level:'advanced',weeks:6,weeklyHours:8,volume:()=>1});
  const out=boundPlanWeeks(raw,setup([1,2,3,5,6],480,150),8,0,'advanced').weeks;
  for(const w of out){
    assert.equal(w.sessions.length,5);
    assert.equal(w.sessions.filter(s=>s.sport==='strength').length,2);
    assert.equal(w.sessions.filter(s=>s.sport==='brick').length,1);
    assert.ok(w.sessions.some(s=>s.sport==='swim'));
    assert.ok(w.sessions.some(s=>['swim','bike','run'].includes(s.sport)&&s!==w.sessions.find(x=>x.sport==='swim')));
    assert.ok(w.totalMinutes<=480);
    assert.match(w.doseAllocation!.note,/Reduced component coverage/);
  }
});

test('ordinary cycling and triathlon schedules open with selected primary endurance sport when feasible',()=>{
  for(const [sport,opening] of [['bike','bike'],['triathlon','swim']] as const){
    const raw=coachingWeekTemplate({sport,level:'advanced',weeks:6,weeklyHours:8,volume:()=>1});
    const out=boundPlanWeeks(raw,setup([0,1,2,3,4,5,6],480,180),8,1,'advanced').weeks;
    assert.equal(out[0].sessions[0].sport,opening);
    assert.equal(out[0].sessions[0].daySlot,0);
    assert.equal(out[0].sessions.filter(s=>s.sport==='strength').length,2);
  }
});

test('low availability explicitly reports omitted complete purposes rather than mincing or pretending full coverage',()=>{
  const raw=week([unit('swim'),unit('bike'),unit('run'),unit('strength',30,true,'strength-a'),unit('strength',30,false,'strength-b')]);
  const result=boundPlanWeeks([raw],setup([1,3],80,45),8,0,'advanced').weeks[0];
  assert.equal(result.sessions.length,2);
  assert.ok(result.sessions.every(s=>s.minutes===40));
  assert.ok(result.totalMinutes<=80);
  assert.equal(result.doseAllocation!.method,'coaching-complete-units-v1');
  const omitted='omitted' in result.doseAllocation! ? result.doseAllocation.omitted : [];
  assert.ok(Array.isArray(omitted));assert.equal(omitted.length,3);
  assert.match(result.doseAllocation!.note,/Reduced component coverage/);
});

test('complete oversized sessions are omitted instead of reducing brick legs inconsistently',()=>{
  const raw=week([unit('brick',100,true,'brick'),unit('swim',40)]);
  const result=boundPlanWeeks([raw],setup([1,3,5],150,60),8,0,'advanced').weeks[0];
  assert.deepEqual(result.sessions.map(s=>s.sport),['swim']);
  assert.ok('omitted' in result.doseAllocation!);
  const omitted='omitted' in result.doseAllocation! ? result.doseAllocation.omitted : [];
  assert.ok(Array.isArray(omitted));assert.match(omitted[0].reason,/daily time/);
});

test('demand is explicit: technical strength may precede quality, demanding strength cannot',()=>{
  const raw=week([unit('strength',30,false,'strength-b'),unit('bike',40,true,'threshold'),unit('strength',30,true,'strength-a')]);
  const result=boundPlanWeeks([raw],setup([1,2,3],150),8,0,'advanced').weeks[0];
  assert.equal(result.sessions.length,3);
  const hard=result.sessions.filter(s=>s.coaching?.demanding);
  assert.equal(Math.abs(hard[0].daySlot-hard[1].daySlot),2);
});

test('hard recovery separation crosses the week boundary without requiring professional seven-day training',()=>{
  const first=week([unit('bike',40,true,'threshold')]);
  const next=week([unit('run',40,true,'threshold')]);
  const result=boundPlanWeeks([first,next],setup([6,0],100),8,1,'pro').weeks;
  const hard=result.flatMap((w,i)=>w.sessions.filter(s=>s.coaching?.demanding).map(s=>i*7+s.daySlot));
  assert.equal(hard.length,2);
  assert.ok(hard[1]-hard[0]>1);
  assert.ok(result.every(w=>w.restDaySlots.length>=6));
});

test('all sport templates retain complete units inside capacity and report availability tradeoffs',()=>{
  for(const sport of ['swim','bike','run','triathlon','hyrox'] as const)for(const level of ['beginner','amateur','advanced','pro']){
    const raw=coachingWeekTemplate({sport,level,weeks:6,weeklyHours:8,volume:()=>1});
    for(const days of [[0,1,2,3,4,5,6],[1,3,5],[0,6]]){
      const out=boundPlanWeeks(raw,setup(days,480,150),8,1,level).weeks;
      const hard:number[]=[];
      out.forEach((w,index)=>{
        assert.ok(w.totalMinutes<=480,`${sport}/${level}: budget`);
        assert.equal(new Set(w.sessions.map(s=>s.daySlot)).size,w.sessions.length);
        for(const s of w.sessions){
          assert.ok(days.includes((s.daySlot+1)%7));
          assert.ok(s.minutes<=150&&s.minutes>=(s.coaching?.minimumMinutes??1));
          assert.ok(raw[index].sessions.some(original=>original.title===s.title&&original.minutes===s.minutes));
          if(s.coaching?.demanding)hard.push(index*7+s.daySlot);
        }
        if(w.sessions.length<raw[index].sessions.length)assert.match(w.doseAllocation!.note,/Reduced component coverage/);
      });
      for(let i=1;i<hard.length;i++)assert.ok(hard[i]-hard[i-1]>1,`${sport}/${level}: hard adjacency`);
    }
  }
});

test('small capacity receives separate short introductory aerobic units with original omissions retained',()=>{
  for(const sport of ['swim','bike','run','triathlon','hyrox'] as const){
    const raw=coachingWeekTemplate({sport,level:'beginner',weeks:1,weeklyHours:2,volume:()=>1});
    const result=boundPlanWeeks(raw,setup([1,3,5],24,12),2,0,'beginner').weeks[0];
    assert.ok(result.sessions.length>0&&result.sessions.length<=3);
    assert.ok(result.totalMinutes<=24);
    for(const s of result.sessions){assert.ok(s.minutes>=5&&s.minutes<=10);assert.equal(s.coaching?.recipe,'aerobic');assert.equal(s.coaching?.demanding,false);assert.match(s.title,/short introductory/);}
    assert.ok('omitted' in result.doseAllocation!&&Array.isArray(result.doseAllocation.omitted));
    assert.match(result.doseAllocation!.note,/alternatives only/);
  }
});

test('introductory alternatives never exceed small weekly capacity or create unavailable days',()=>{
  const raw=week([unit('run',40)]);
  const result=boundPlanWeeks([raw],setup([1],7,10),1,0,'advanced').weeks[0];
  assert.equal(result.sessions.length,1);assert.equal(result.sessions[0].minutes,7);assert.equal(result.sessions[0].daySlot,1);
  assert.equal(boundPlanWeeks([raw],setup([],20,10),1,0,'advanced').weeks[0].sessions.length,0);
});

test('expressly consented complete easy pair preserves dose, timing and readiness requirements',()=>{
  for(const sport of ['bike','triathlon'] as const){
    const raw=coachingWeekTemplate({sport,level:'advanced',weeks:4,weeklyHours:8,volume:()=>1});
    const preference:DoubleDayPreference={version:DOUBLE_DAY_VERSION,weekday:1,purpose:'Convenient familiar pair',firstStart:'07:00',secondStart:'18:00',athleteAgreed:true,priorTolerance:true,foodFluidsAvailable:true,recheckBetween:true};
    const base=setup([0,1,2,3,4,5,6],480,180);base.doubleDay=preference;
    const out=boundPlanWeeks(raw,base,8,1,'advanced').weeks;
    assert.equal(out[0].sessions.filter(s=>s.doubleDayRole).length,2);
    for(const w of out){
      assert.ok(w.totalMinutes<=480);
      const pair=w.sessions.filter(s=>s.doubleDayRole);
      assert.equal(pair.length,2);assert.equal(pair[0].daySlot,0);assert.equal(pair[1].daySlot,0);
      assert.ok(pair.every(s=>['swim','bike','run'].includes(s.sport)));assert.ok(pair[0].minutes+pair[1].minutes<=180);
      assert.match(pair[1].description,/new check-in/);
      assert.equal(pair[0].startTime,'07:00');assert.equal(pair[1].startTime,'18:00');
    }
    base.doubleDay={...preference,athleteAgreed:false};
    assert.ok(boundPlanWeeks(raw,base,8,1,'advanced').weeks.every(w=>w.sessions.every(s=>!s.doubleDayRole)));
  }
});
