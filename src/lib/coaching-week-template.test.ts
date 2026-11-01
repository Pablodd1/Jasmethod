import test from 'node:test';
import assert from 'node:assert/strict';
import { coachingWeekTemplate } from './coaching-week-template';
import { generateHyroxPlan, generatePlan, generateSingleSport } from './science';
import {boundPlanWeeks} from './planning-bounds';
import {parsePlanningSetup} from './planning-setup';
import {shapeTrainingCycle} from './training-cycle';

test('five reviewed sport families retain complete bounded units and two supporting strength exposures when time permits',()=>{
  for(const sport of ['swim','bike','run','triathlon','hyrox'] as const) for(const level of ['beginner','amateur','advanced','pro']) {
    const weeks=coachingWeekTemplate({sport,level,weeks:12,weeklyHours:8,volume:i=>i%6===5?.65:1});
    for(const week of weeks){
      assert.equal(week.templateVersion,'coaching-structure-v1');
      assert.ok(week.totalMinutes<=480);
      assert.equal(week.totalMinutes,week.sessions.reduce((sum,s)=>sum+s.minutes,0));
      assert.equal(week.sessions.filter(s=>s.sport==='strength').length,2);
      for(const s of week.sessions){assert.ok(s.coaching);assert.ok(s.minutes>=s.coaching.minimumMinutes);assert.ok(Number.isInteger(s.minutes));assert.ok(!s.description.includes('FTP is'));}
      if(sport==='triathlon'){assert.equal(week.sessions.filter(s=>s.sport==='brick').length,1);for(const leg of ['swim','bike','run'])assert.ok(week.sessions.some(s=>s.sport===leg));}
      if(level==='beginner')assert.ok(!week.sessions.some(s=>['vo2','over-under','short-interval'].includes(s.coaching!.recipe)));
    }
    assert.ok(weeks[5].totalMinutes<weeks[4].totalMinutes);
    assert.ok(weeks[5].sessions.every(s=>!s.coaching?.demanding));
  }
});

test('limited budgets explicitly omit components rather than fabricate tiny units or exceed reported time',()=>{
  for(const sport of ['swim','bike','run','triathlon','hyrox'] as const) for(const budget of [0,10,45,90,120]){
    const week=coachingWeekTemplate({sport,level:'beginner',weeks:1,weeklyHours:budget/60,volume:()=>1})[0];
    assert.ok(week.totalMinutes<=budget);
    assert.ok(week.sessions.every(s=>s.minutes>=s.coaching!.minimumMinutes));
    if(budget<=45)assert.match(week.theme,/Time budget.*excludes/);
  }
  assert.equal(coachingWeekTemplate({sport:'run',level:'pro',weeks:1,weeklyHours:NaN,volume:()=>1})[0].totalMinutes,0);
});

test('known daily ceiling shapes complete sport recipes before allocating weekly time',()=>{
  for(const weeklyHours of [8,12]){
    const tri=generatePlan({level:'advanced',distance:'half',weeks:12,startDate:new Date('2026-11-02T12:00:00Z'),weeklyHours,sessionLimitMinutes:90,reviewedCycle:true});
    for(const week of tri){
      const brick=week.sessions.find(s=>s.coaching?.recipe==='brick');
      assert.ok(brick&&brick.minutes>=40&&brick.minutes<=90,`Week${week.week} retains a viable brick.`);
      assert.ok(week.totalMinutes<=weeklyHours*60);
    }
  }
  for(const sport of ['swim','bike','run','triathlon','hyrox'] as const)for(const limit of [4,5,10,20,39,90]){
    const week=coachingWeekTemplate({sport,level:'advanced',weeks:1,weeklyHours:12,sessionLimitMinutes:limit,volume:()=>1})[0];
    assert.ok(week.sessions.every(s=>s.minutes<=limit&&s.minutes>=s.coaching!.minimumMinutes));
    assert.ok(week.totalMinutes<=720);
    if(limit<15)assert.ok(!week.sessions.some(s=>s.sport==='strength'));
    if(limit<40&&sport==='triathlon'){
      assert.ok(!week.sessions.some(s=>s.sport==='brick'));
      assert.match(week.theme,/excludes complete components:.*Brick/);
    }
    if(limit<5)assert.equal(week.sessions.length,0);
  }
});

test('reviewed public generators dispatch into the coaching allocator without changing legacy generation',()=>{
  const common={level:'amateur',weeks:2,startDate:new Date('2026-11-02T12:00:00Z'),weeklyHours:7,reviewedCycle:true};
  for(const sport of ['swim','bike','run'] as const)assert.equal(generateSingleSport({...common,sport})[0].templateVersion,'coaching-structure-v1');
  assert.equal(generateHyroxPlan(common)[0].templateVersion,'coaching-structure-v1');
  assert.equal(generatePlan({...common,distance:'custom'})[0].templateVersion,'coaching-structure-v1');
  assert.notEqual(generatePlan({...common,distance:'half',reviewedCycle:false})[0].templateVersion,'coaching-structure-v1');
});

test('tiny weekly budgets retain separate complete easy introductions through scheduling and cycle shaping',()=>{
  for(const sport of ['swim','bike','run','triathlon','hyrox'] as const)for(const budget of [10,20]){
    const raw=coachingWeekTemplate({sport,level:'beginner',weeks:1,weeklyHours:budget/60,volume:()=>1});
    const setup=parsePlanningSetup({trainingDays:[0,1,2,3,4,5],maxSessionMinutes:10,baselineWeeklyMinutes:budget});
    const bounded=boundPlanWeeks(raw,setup,budget/60,1,'beginner',[],{preserveWeeklyDose:true});
    const cycle=shapeTrainingCycle(bounded.weeks,{startKey:'2026-11-02',needsAssessment:true,recoveryReview:false,protectedDays:[],templatePeriodized:true});
    assert.ok(cycle[0].sessions.length>0,`${sport}/${budget}`);
    assert.ok(cycle[0].totalMinutes<=budget);
    for(const s of cycle[0].sessions){assert.ok(s.minutes>=5&&s.minutes<=10);assert.ok(Number(s.zone.slice(1))<=2);assert.equal(s.coaching?.demanding,false);}
    if(budget===10)assert.match(raw[0].theme,/Brief introduction only/);
  }
});
