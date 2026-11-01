import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeTrainingCycle } from './training-cycle';
import type { PlanSession } from './science';
import type { BoundedPlanSession } from './planning-bounds';

const session=(sport:PlanSession['sport'],recipe:NonNullable<PlanSession['coaching']>['recipe'],daySlot:number,zone:PlanSession['zone']='z2'):BoundedPlanSession=>({sport,title:`${sport} · ${recipe}`,description:`Purpose: ${sport} reviewed complete work`,minutes:50,zone,type:sport==='strength'?'strength':'endurance',daySlot,
  coaching:{recipe,phase:'development',purpose:`${sport} verified purpose`,demanding:recipe==='threshold'||recipe==='strength-a',minimumMinutes:20,role:sport==='strength'?'support':'primary'}});
const week=(sessions:BoundedPlanSession[])=>({week:1,templateVersion:'coaching-structure-v1',theme:'Reviewed sport development',periodizationFactor:1,sessions,totalMinutes:sessions.reduce((n,s)=>n+s.minutes,0),restDaySlots:[],doubleDayNote:''});
const options={startKey:'2026-11-02',needsAssessment:false,recoveryReview:false,protectedDays:[] as string[],templatePeriodized:true};

test('coaching shape preserves sport purpose and strength/brick identity without creating movement baseline tests',()=>{
  const raw=week([session('strength','strength-a',0,'z1'),session('brick','brick',2),session('swim','technique',4)]);
  const before=JSON.stringify(raw);
  const result=shapeTrainingCycle([raw],options)[0];
  assert.equal(JSON.stringify(raw),before);
  for(const shaped of result.sessions){
    assert.equal(shaped.title,raw.sessions.find(s=>s.sport===shaped.sport)!.title);
    assert.match(shaped.description,new RegExp(`${shaped.sport} reviewed complete work`));
    assert.equal(shaped.coaching!.purpose,`${shaped.sport} verified purpose`);
  }
  assert.ok(!result.observations.some(o=>['strength','brick'].includes(o.sport)));
});

test('missing evidence downgrades quality metadata and observation without claiming a hard threshold session',()=>{
  const result=shapeTrainingCycle([week([session('bike','threshold',0,'z4'),session('run','threshold',2,'z4')])],{...options,needsAssessment:true})[0];
  for(const s of result.sessions){
    assert.equal(s.zone,'z2');assert.equal(s.coaching!.demanding,false);
    assert.equal(s.coaching!.recipe,'threshold','Recipe identity retained for effective-zone-aware execution.');
    assert.match(s.coaching!.purpose,/Comfortable/);
    assert.doesNotMatch(s.title,/threshold/);
    assert.match(s.description,/does not measure VO2max|No original threshold/);
  }
});

test('event/recovery reductions omit incomplete minimum units with an explicit reason',()=>{
  const small=session('strength','strength-a',0,'z1');small.minutes=20;
  const result=shapeTrainingCycle([week([small,session('brick','brick',2)])],{...options,recoveryReview:true})[0];
  assert.ok(!result.sessions.some(s=>s.sport==='strength'));
  assert.match(result.cycleOmissions.join(' '),/complete minimum prescription/);
  assert.ok(result.sessions.every(s=>!s.coaching?.demanding));
  assert.ok(result.totalMinutes<=70);
});

test('duration reductions cannot preserve stale original brick leg minutes',()=>{
  const brick=session('brick','brick',0);
  brick.coaching!.legs=[{sport:'bike',minutes:35,zone:'z2'},{sport:'run',minutes:15,zone:'z2'}];
  const reduced=shapeTrainingCycle([week([brick])],{...options,recoveryReview:true})[0].sessions[0];
  assert.equal(reduced.minutes,30);
  assert.equal(reduced.coaching!.legs,undefined,'Canonical builder must regenerate complete legs at the effective duration.');
  assert.equal(brick.coaching!.legs![0].minutes,35,'Original source remains unchanged.');
});
