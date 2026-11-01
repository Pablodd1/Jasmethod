import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePlanningSetup} from './planning-setup';
import {weeklyAvailabilityMinutes} from './planning-availability';
import {hydrateOnboarding,EMPTY_PROFILE,EMPTY_SETUP,EMPTY_RACE,restoreOnboardingDraft} from './onboarding-form';
import {onboardingSectionPayload} from './onboarding-save';

const now=new Date('2026-11-01T12:00:00Z');
test('availability remains nullable and independent from dated tolerated work',()=>{
  const legacy=parsePlanningSetup({baselineWeeklyMinutes:420,baselineObservedAt:'2026-10-31',trainingDays:[1,3,5]},now);
  assert.equal(legacy.availableWeeklyMinutes,null);assert.equal(legacy.strengthWeekdays,undefined);
  for(const blank of [null,'',undefined])assert.equal(parsePlanningSetup({...legacy,availableWeeklyMinutes:blank},now).availableWeeklyMinutes,null);
  const explicit=parsePlanningSetup({...legacy,availableWeeklyMinutes:600,strengthWeekdays:[3,1,1]},now);
  assert.equal(explicit.baselineWeeklyMinutes,420);assert.equal(explicit.baselineObservedAt,'2026-10-31');
  assert.equal(explicit.availableWeeklyMinutes,600);assert.deepEqual(explicit.strengthWeekdays,[1,3]);
  assert.equal(explicit.source,'athlete_reported');assert.equal(explicit.confirmedAt,now.toISOString());
  assert.equal(parsePlanningSetup({...legacy,availableWeeklyMinutes:0},now).availableWeeklyMinutes,0);
});

test('invalid time ceilings and strength weekdays cannot pass server parsing',()=>{
  for(const availableWeeklyMinutes of [-1,2401,NaN,Infinity,600.5,'10 hours',{},true])assert.throws(()=>parsePlanningSetup({availableWeeklyMinutes},now),/availableWeeklyMinutes/);
  for(const strengthWeekdays of [[-1],[7],[1.5],['1'],{},[2]])assert.throws(()=>parsePlanningSetup({trainingDays:[1,3],strengthWeekdays},now),/strength days/);
  assert.deepEqual(parsePlanningSetup({trainingDays:[1],strengthWeekdays:[]},now).strengthWeekdays,[]);
});

test('hours editing converts to exact canonical minutes without inventing a recent baseline',()=>{
  assert.equal(weeklyAvailabilityMinutes('10'),600);assert.equal(weeklyAvailabilityMinutes('1.1'),66);assert.equal(weeklyAvailabilityMinutes('0'),0);assert.equal(weeklyAvailabilityMinutes(''),null);
  for(const value of ['-1','1e2','1 hour','0.125','41',{},true])assert.throws(()=>weeklyAvailabilityMinutes(value));
  const saved={profile:{experience:'advanced'},setup:{trainingDays:[0,1,2,3,4,5,6],availableWeeklyMinutes:600,strengthWeekdays:[1],baselineWeeklyMinutes:420,baselineObservedAt:'2026-10-31'}};
  const form=hydrateOnboarding(saved.profile,saved.setup);
  assert.equal(form.setup.availableWeeklyHours,'10');assert.deepEqual(form.setup.strengthWeekdays,[1]);
  const payload=onboardingSectionPayload('goals',form.profile,{...form.setup,availableWeeklyHours:'9.5'},saved,'revision');
  const serialized=payload.setup as Record<string,unknown>;
  assert.equal(serialized.availableWeeklyMinutes,570);assert.equal('availableWeeklyHours' in serialized,false);
  assert.equal(serialized.baselineWeeklyMinutes,'420');assert.equal(serialized.baselineObservedAt,'2026-10-31');
  const parsed=parsePlanningSetup(serialized,now);
  assert.equal(hydrateOnboarding({},parsed as unknown as Record<string,unknown>).setup.availableWeeklyHours,'9.5');
  assert.deepEqual(parsed.strengthWeekdays,[1]);
  const short=onboardingSectionPayload('intent',form.profile,{...form.setup,availableWeeklyHours:'30'},saved,'revision').setup as Record<string,unknown>;
  assert.equal('availableWeeklyMinutes' in short,false,'Unrelated section saves cannot persist time drafts.');
});

test('legacy and interrupted drafts retain explicit scheduling preferences without borrowing profile defaults',()=>{
  assert.equal(hydrateOnboarding({weeklyHours:10},null).setup.availableWeeklyHours,'');
  const draft={version:1,userId:'athlete',revision:'p',setupRevision:'s',profile:{...EMPTY_PROFILE},setup:{...EMPTY_SETUP,availableWeeklyHours:'10',trainingDays:[1,3],strengthWeekdays:[1]},race:{...EMPTY_RACE},raceId:null,reviewedWeightId:null,step:'race'};
  const restored=restoreOnboardingDraft(JSON.stringify(draft),'athlete','p','s')!;
  assert.equal(restored.setup.availableWeeklyHours,'10');assert.deepEqual(restored.setup.strengthWeekdays,[1]);
  const ui=readFileSync('src/components/detailed-athlete-setup.tsx','utf8');
  assert.match(ui,/Time available each week \(hours, optional\)/);assert.match(ui,/Tiempo disponible por semana/);
  assert.match(ui,/Preferred strength days/);assert.match(ui,/Días preferidos de fuerza/);
  assert.match(ui,/disabled=\{!setup\.trainingDays\.includes\(index\)\}/);
  assert.match(ui,/strengthWeekdays:.*setup\.strengthWeekdays\.filter\(d=>d!==index\)/,'Removing an available day also removes its gym preference.');
});
