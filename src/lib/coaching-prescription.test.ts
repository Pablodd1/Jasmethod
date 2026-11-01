import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, generateSingleSport, generateHyroxPlan } from './science';
import { parsePlanningSetup } from './planning-setup';
import { boundPlanWeeks } from './planning-bounds';
import { shapeTrainingCycle } from './training-cycle';
import { prescribeToday } from './adaptive';
import { canonicalSession } from './canonical-session';
import { buildCoachingPrescription } from './coaching-prescription';
import { sessionFitEntries } from './fit-export';
import { Decoder, Stream } from '@garmin/fitsdk';
import { addDaysKey } from './dates';

const startKey='2026-11-02';
const opts={level:'advanced',weeks:6,startDate:new Date(`${startKey}T12:00:00Z`),weeklyHours:8,reviewedCycle:true};
const syntheticAnchors={ftp:220,runPaceBase:300,swimPaceBase:110};
const adaptation={verdict:'full',durationFactor:1,intensityCap:'z5'};
const setup=parsePlanningSetup({trainingDays:[0,1,2,3,4,5,6],baselineWeeklyMinutes:480,maxSessionMinutes:150});
function pipeline(sport:string){
  const raw=sport==='triathlon'?generatePlan({...opts,distance:'custom'}):sport==='hyrox'?generateHyroxPlan(opts):generateSingleSport({...opts,sport:sport as 'swim'|'bike'|'run'});
  return shapeTrainingCycle(boundPlanWeeks(raw,setup,8,1,'advanced',[],{preserveWeeklyDose:true}).weeks,
    {startKey,needsAssessment:false,recoveryReview:false,protectedDays:[],templatePeriodized:true});
}

test('five-sport coaching pipeline preserves executable structures, full time budgets and relative targets',()=>{
  const observed=new Set<string>();
  for(const sport of ['swim','bike','run','triathlon','hyrox']) {
    const weeks=pipeline(sport);
    for(const [wi,week] of weeks.entries()) for(const [si,s] of week.sessions.entries()){
      assert.ok(s.coaching,`${sport}/${wi}/${s.title}: metadata lost`);
      const workout={id:`synthetic-${sport}-${wi}-${si}`,userId:'synthetic',sport:s.sport,title:s.title,type:s.type,intensity:s.zone,durationMin:s.minutes};
      const p=prescribeToday({session:{...workout,description:s.description,coaching:s.coaching,cycleVersion:'bounded-cycle-v1'},adaptation});
      assert.equal(p.steps.reduce((n,step)=>n+step.seconds,0),p.durationMin*60,`${sport}/${s.title}: elapsed estimates must fit budget`);
      assert.ok(p.steps.every(step=>step.seconds>0));
      assert.ok(!JSON.stringify(p.steps).includes('powerW'),'stored steps must not freeze absolute power');
      const c=canonicalSession({athleteId:'synthetic',workout,prescription:p,profile:syntheticAnchors,dateLocal:addDaysKey(startKey,wi*7+s.daySlot),timezone:'UTC'});
      assert.equal(c.verdict,'ready',`${sport}/${s.title}: ${c.reason}`);
      observed.add(s.sport);
      if(s.sport==='strength'){
        assert.equal(c.sportStructure?.kind,'strength');
        assert.ok(c.steps.some(step=>step.endpoint.type==='reps'&&step.endpoint.reps===6));
        assert.equal(c.exactTimeSeconds,null,'repetition timing is estimated, not exact');
      } else if(s.sport==='brick'){
        assert.equal(c.sportStructure?.kind,'brick');
        assert.deepEqual(c.components?.map(component=>component.sport),['bike','run']);
        assert.equal(c.exactTimeSeconds,p.durationMin*60);
        assert.equal(c.capability.mode,'split');
      } else if(s.sport==='hyrox'){
        assert.equal(c.sportStructure?.kind,'hyrox');
        assert.ok(c.steps.some(step=>step.sportDetail?.kind==='station'));
      } else {
        assert.equal(c.exactTimeSeconds,p.durationMin*60);
        assert.ok(c.steps.some(step=>step.target.type!=='open'),`${sport}: synthetic anchors should yield numerical targets`);
      }
    }
  }
  for(const sport of ['swim','bike','run','brick','strength','hyrox']) assert.ok(observed.has(sport));
});

test('check-in reductions rebuild complete strength, hybrid and brick prescriptions inside available time',()=>{
  for(const sport of ['triathlon','hyrox','bike']) for(const [wi,week] of pipeline(sport).entries()) for(const s of week.sessions){
    const workout={id:`reduced-${sport}-${wi}-${s.title}`,sport:s.sport,title:s.title,type:s.type,intensity:s.zone,durationMin:s.minutes};
    for(const timeBudgetMin of [5,15,30]){
      const p=prescribeToday({session:{...workout,coaching:s.coaching,cycleVersion:'bounded-cycle-v1'},adaptation:{verdict:'easy',durationFactor:.6,intensityCap:'z1'},timeBudgetMin});
      assert.ok(p.durationMin<=timeBudgetMin&&p.durationMin<=s.minutes);
      assert.equal(p.steps.reduce((n,step)=>n+step.seconds,0),p.durationMin*60);
      assert.ok(p.steps.every(step=>Number(step.zone.slice(1))<=1));
      const c=canonicalSession({athleteId:'synthetic',workout,prescription:p,dateLocal:startKey,timezone:'UTC'});
      assert.equal(c.verdict,p.verdict==='rest'?'rest':'ready',`${sport}/${s.title}/${timeBudgetMin}: ${c.reason}`);
      if(p.verdict==='rest'){
        assert.equal(p.durationMin,0);assert.deepEqual(p.steps,[]);assert.deepEqual(c.steps,[]);
        assert.match(p.detail.main,/paused|not enough time/i);
        assert.ok(['strength','brick','hyrox'].includes(s.sport),'only incomplete structured units should pause in this fixture');
      }
    }
    const rest=prescribeToday({session:{...workout,coaching:s.coaching,cycleVersion:'bounded-cycle-v1'},adaptation:{verdict:'rest',durationFactor:0,intensityCap:'z1'}});
    assert.equal(rest.durationMin,0);assert.deepEqual(rest.steps,[]);
  }
});

test('generated brick exports two independently decoded sport files with transition manifest',()=>{
  const s=pipeline('triathlon')[0].sessions.find(s=>s.sport==='brick')!;
  assert.ok(s);
  const workout={id:'synthetic-brick',sport:s.sport,title:s.title,type:s.type,intensity:s.zone,durationMin:s.minutes};
  const p=prescribeToday({session:{...workout,coaching:s.coaching,cycleVersion:'bounded-cycle-v1'},adaptation});
  const c=canonicalSession({athleteId:'synthetic',workout,prescription:p,profile:syntheticAnchors,dateLocal:startKey,timezone:'UTC'});
  const entries=sessionFitEntries(c,new Date(`${startKey}T12:00:00Z`));
  const sports=entries.filter(entry=>entry.name.endsWith('.fit')).map(entry=>{
    const decoder=new Decoder(Stream.fromByteArray(entry.data as Uint8Array));assert.equal(decoder.checkIntegrity(),true);
    const decoded=decoder.read();assert.deepEqual(decoded.errors,[]);return (decoded.messages as any).workoutMesgs[0].sport;
  });
  assert.deepEqual(sports,['cycling','running']);
  assert.ok(entries.some(entry=>entry.name==='transition-manifest.json'));
});

test('invalid persisted recipe cannot silently become an executable strength workout',()=>{
  assert.throws(()=>buildCoachingPrescription('strength',30,'z1',{recipe:'threshold',phase:'development',purpose:'synthetic invalid sport recipe',demanding:true,minimumMinutes:20}),/Invalid saved coaching recipe/);
});

test('stored relative coaching steps retarget on current sport reference without mutating saved work',()=>{
  const s=pipeline('bike')[0].sessions.find(s=>s.sport==='bike')!;
  const workout={id:'synthetic-targets',sport:s.sport,title:s.title,type:s.type,intensity:s.zone,durationMin:s.minutes};
  const p=prescribeToday({session:{...workout,coaching:s.coaching,cycleVersion:'bounded-cycle-v1'},adaptation});
  const saved=JSON.stringify(p);
  const resolve=(profile:Record<string,number>)=>canonicalSession({athleteId:'synthetic',workout,prescription:p,profile,dateLocal:startKey,timezone:'UTC'});
  const missing=resolve({}),low=resolve({ftp:180}),high=resolve({ftp:260});
  assert.ok(missing.steps.every(step=>step.target.type==='open'));
  assert.ok(low.steps.some(step=>step.target.type==='power'));
  assert.ok(high.steps.some(step=>step.target.type==='power'));
  assert.notDeepEqual(low.steps.map(step=>step.target),high.steps.map(step=>step.target));
  assert.deepEqual(low.steps.map(step=>step.endpoint),high.steps.map(step=>step.endpoint));
  assert.equal(JSON.stringify(p),saved);
});

test('easy verdict independently suppresses hard repetitions even when incoming cap remains Z5',()=>{
  const coaching={recipe:'threshold' as const,phase:'development' as const,purpose:'Synthetic threshold eligibility test',demanding:true,minimumMinutes:25};
  for(const sport of ['swim','bike','run']){
    const p=prescribeToday({session:{sport,title:'Synthetic quality',type:'interval',intensity:'z5',durationMin:45,cycleVersion:'bounded-cycle-v1',coaching},adaptation:{verdict:'easy',durationFactor:1,intensityCap:'z5'}});
    assert.equal(p.intensity,'z2');assert.equal(p.type,'endurance');
    assert.ok(p.steps.every(step=>Number(step.zone.slice(1))<=2));
    assert.ok(p.steps.every(step=>!step.name.includes('controlled work')));
  }
});

test('short intervals below their required intensity become aerobic with matching session labels',()=>{
  const coaching={recipe:'short-interval' as const,phase:'development' as const,purpose:'Synthetic short interval eligibility test',demanding:true,minimumMinutes:25};
  const p=prescribeToday({session:{sport:'bike',title:'Synthetic short intervals',type:'interval',intensity:'z5',durationMin:45,cycleVersion:'bounded-cycle-v1',coaching},adaptation:{verdict:'full',durationFactor:1,intensityCap:'z4'}});
  assert.equal(p.intensity,'z2');assert.equal(p.type,'endurance');
  assert.ok(p.steps.every(step=>Number(step.zone.slice(1))<=2));
  assert.equal(p.steps.reduce((sum,step)=>sum+step.seconds,0),2700);
});

test('strength support selects sport-specific familiar exercises without inventing external loads or plyometric eligibility',()=>{
  const bySport=new Map<string,string[]>();
  for(const emphasis of ['swim','bike','run','triathlon','hyrox']){
    const p=buildCoachingPrescription('strength',30,'z1',{recipe:'strength-a',phase:'foundation',purpose:'Synthetic sport supporting strength',demanding:false,minimumMinutes:15,emphasis});
    assert.equal(p.sportStructure?.kind,'strength');
    const sets=p.sportStructure?.kind==='strength'?p.sportStructure.steps.filter(step=>step.kind==='set'):[];
    const names=sets.map(step=>step.kind==='set'?step.exerciseName:'');
    bySport.set(emphasis,names);
    for(const step of sets)if(step.kind==='set'){
      assert.deepEqual(step.endpoint,{type:'reps',reps:6});
      assert.equal(step.load,undefined);
      assert.match(step.note??'',/3 repetitions in reserve/);
    }
    assert.match(p.note??'',/heavy lifting or plyometrics requires/);
  }
  assert.notDeepEqual(bySport.get('swim'),bySport.get('run'));
  assert.notDeepEqual(bySport.get('run'),bySport.get('bike'));
});
