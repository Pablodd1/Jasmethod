import test from 'node:test';
import assert from 'node:assert/strict';
import { prescribeToday } from './adaptive';
import { canonicalSession } from './canonical-session';
import { coachingWeekTemplate } from './coaching-week-template';
import { preserveSportStructure, holdStructuredPlanEdit } from './preserve-sport-structure';

function fixture(sport:'strength'|'hyrox'|'brick'){
  const week=coachingWeekTemplate({sport:sport==='brick'?'triathlon':sport==='strength'?'run':'hyrox',level:'advanced',weeks:1,weeklyHours:8,volume:()=>1})[0];
  const s=week.sessions.find(s=>s.sport===sport)!;
  const base={cycleVersion:'bounded-cycle-v1',coaching:s.coaching,title:s.title,sport:s.sport,type:s.type,intensity:s.zone,durationMin:s.minutes,description:s.description};
  const prior=prescribeToday({session:base,adaptation:{verdict:'planned',durationFactor:1,intensityCap:base.intensity}});
  assert.ok(prior.sportStructure);
  return {base,prior,workout:{id:`fixture-${sport}`,userId:'owner',...base,originalPlan:JSON.stringify(base),prescription:JSON.stringify(prior)}};
}

test('actual saved-coaching wrapper regenerates complete reduced/easy strength, HYROX and brick components',()=>{
  for(const sport of ['strength','hyrox','brick'] as const)for(const verdict of ['full','easy','trim']){
    const {base,prior,workout}=fixture(sport);
    const generated=prescribeToday({session:base,adaptation:{verdict,durationFactor:.75,intensityCap:'z2'},timeBudgetMin:30});
    const next=preserveSportStructure(workout,generated);
    assert.notEqual(next.verdict,'rest',`${sport}/${verdict}: ${next.detail.main}`);
    assert.ok(next.durationMin>0&&next.durationMin<=30);
    assert.equal(next.sportStructureBudgetMin,next.durationMin);
    assert.deepEqual(next.sportStructure,generated.sportStructure);
    assert.notDeepEqual(next.sportStructure,prior.sportStructure);
    const checked=canonicalSession({athleteId:'owner',workout,prescription:next,dateLocal:'2026-11-02',timezone:'UTC'});
    assert.equal(checked.verdict,'ready',checked.reason);
    assert.ok(checked.steps.every(s=>Number(s.zone.slice(1))<=2));
    // A later check-in must also recognize the already-reduced saved recipe.
    const again=preserveSportStructure({...workout,prescription:JSON.stringify(next)},prescribeToday({session:base,adaptation:{verdict:'trim',durationFactor:.5,intensityCap:'z2'},timeBudgetMin:20}));
    assert.notEqual(again.verdict,'rest',`${sport}: second adaptation must remain executable`);
    assert.ok(again.durationMin<=20);
    assert.equal(canonicalSession({athleteId:'owner',workout,prescription:again,dateLocal:'2026-11-02',timezone:'UTC'}).verdict,'ready');
  }
});

test('recipe-origin rest removes stale structure and never restores executable work',()=>{
  for(const sport of ['strength','hyrox','brick'] as const){
    const {base,workout}=fixture(sport);
    const generated=prescribeToday({session:base,adaptation:{verdict:'rest',durationFactor:0,intensityCap:'z1'}});
    const next=preserveSportStructure(workout,{...generated,sportStructure:JSON.parse(workout.prescription).sportStructure});
    assert.equal(next.verdict,'rest');assert.equal(next.durationMin,0);assert.deepEqual(next.steps,[]);assert.equal(next.sportStructure,undefined);
  }
});

test('manual structures, edited structures and fake markers keep explicit-structure reduction holds',()=>{
  for(const sport of ['strength','hyrox','brick'] as const){
    const {base,prior,workout}=fixture(sport);
    const generated=prescribeToday({session:base,adaptation:{verdict:'easy',durationFactor:.5,intensityCap:'z2'}});
    const edited=JSON.parse(JSON.stringify(prior));
    if(edited.sportStructure.kind==='brick')edited.sportStructure.components[0].title='Explicit author instruction';
    else edited.sportStructure.steps[0].name='Explicit author instruction';
    for(const changed of [
      {...workout,originalPlan:null},
      {...workout,originalPlan:'{malformed'},
      {...workout,originalPlan:JSON.stringify({...base,cycleVersion:undefined})},
      {...workout,originalPlan:JSON.stringify({...base,cycleVersion:'fake'})},
      {...workout,originalPlan:JSON.stringify({...base,coaching:{...base.coaching,recipe:'invalid'}})},
      {...workout,prescription:JSON.stringify(edited)},
      {...workout,prescription:holdStructuredPlanEdit(workout.prescription,sport,'Author edited plan')},
    ]){
      const next=preserveSportStructure(changed,generated);
      assert.equal(next.verdict,'rest');assert.equal(next.durationMin,0);assert.match(next.structureReviewRequired!,/explicit sport structure/);
    }
  }
});

test('a matching source marker cannot authorize a different newly generated structure',()=>{
  const {base,workout}=fixture('strength');
  const generated=prescribeToday({session:base,adaptation:{verdict:'easy',durationFactor:.5,intensityCap:'z2'}});
  const altered=JSON.parse(JSON.stringify(generated));
  altered.sportStructure.steps[1].endpoint.reps=60;
  const next=preserveSportStructure(workout,altered);
  assert.equal(next.verdict,'rest');assert.equal(next.durationMin,0);
});
