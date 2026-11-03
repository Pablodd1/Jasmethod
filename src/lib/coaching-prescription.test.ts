import test from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, generateSingleSport, generateHyroxPlan } from './science';
import { parsePlanningSetup } from './planning-setup';
import { boundPlanWeeks } from './planning-bounds';
import { shapeTrainingCycle } from './training-cycle';
import { prescribeToday } from './adaptive';
import { canonicalSession } from './canonical-session';
import { buildCoachingPrescription, HYROX_COACHING_STATIONS, type HyroxPrescriptionReview } from './coaching-prescription';
import { preserveSportStructure } from './preserve-sport-structure';
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

const hyroxCoaching={recipe:'hyrox-hybrid' as const,phase:'development' as const,purpose:'Synthetic reviewed HYROX practice',demanding:false,minimumMinutes:35};
function reviewedStations():HyroxPrescriptionReview {
  return {reviewedAt:'2026-01-01T12:00:00Z',sourceReference:'synthetic-coach-review',stations:(Object.keys(HYROX_COACHING_STATIONS) as (keyof typeof HYROX_COACHING_STATIONS)[]).map(stationId=>({
    stationId,equipmentConfirmed:true,techniqueReviewed:true,runSeconds:60,recoverySeconds:60,
    endpoint:stationId==='wallball'?{type:'reps',reps:8}:{type:'distance',meters:stationId==='ski'||stationId==='row'?100:10},estimatedSeconds:60,
    ...(HYROX_COACHING_STATIONS[stationId].loaded?{load:{value:stationId==='wallball'?4:10,unit:'kg' as const},loadBasis:stationId.startsWith('sled')?'total-including-sled' as const:stationId==='farmers'?'per-hand' as const:'implement' as const}:{}),
    ...(stationId==='wallball'?{targetHeightMeters:2.5}:{})
  }))};
}

test('HYROX preparation actually used without evidence is varied and never claims eight-station execution',()=>{
  const p=buildCoachingPrescription('hyrox',40,'z2',hyroxCoaching);
  assert.equal(p.sportStructure?.kind,'hyrox');
  const stations=p.sportStructure?.kind==='hyrox'?p.sportStructure.steps.filter(step=>step.kind==='station'):[];
  assert.equal(new Set(stations.map(step=>step.kind==='station'?step.name:'')).size,4);
  for(const step of stations)if(step.kind==='station'){
    assert.equal(step.load,undefined);assert.equal(step.endpoint.type,'time');
    assert.match(step.note??'',/Purpose:/);assert.match(step.note??'',/unloaded preparation, not execution/);
    assert.ok(!Object.hasOwn(HYROX_COACHING_STATIONS,step.stationId!));
  }
  assert.equal(p.steps.reduce((sum,step)=>sum+step.seconds,0),2400);
});

test('reviewed HYROX covers all eight station identities with exact authored endpoints, loads, purposes and rests',()=>{
  const review=reviewedStations(),before=JSON.stringify(review);
  const p=buildCoachingPrescription('hyrox',60,'z5',hyroxCoaching,false,review);
  assert.equal(p.paused,undefined);assert.equal(p.sportStructure?.kind,'hyrox');
  const steps=p.sportStructure?.kind==='hyrox'?p.sportStructure.steps:[];
  const stations=steps.filter(step=>step.kind==='station');
  assert.equal(stations.length,8);
  stations.forEach((step,index)=>{
    if(step.kind!=='station')return;
    const dose=review.stations[index];
    assert.equal(step.stationId,dose.stationId);assert.deepEqual(step.endpoint,dose.endpoint);
    assert.deepEqual(step.load,dose.load);assert.equal(step.estimatedSeconds,60);
    assert.match(step.note??'',/Purpose:/);assert.match(step.note??'',/synthetic-coach-review/);
    assert.match(step.note??'',/not race simulation or automatic progression/);
    const position=steps.indexOf(step);
    assert.equal(steps[position-1].kind,'run');assert.deepEqual(steps[position+1],{kind:'rest',seconds:60,note:'Recover and set up the next station safely. Extend rest or stop if needed; do not compress recovery to catch up.'});
  });
  assert.equal(p.steps.reduce((sum,step)=>sum+step.seconds,0),3600);
  assert.ok(p.steps.every(step=>step.seconds>0&&Number(step.zone.slice(1))<=2));
  assert.equal(JSON.stringify(review),before,'generation must not mutate the reviewed dose');
});

test('HYROX review cannot invent missing equipment, skill, loads, estimates or wall-ball targets',()=>{
  const mutations:((r:HyroxPrescriptionReview)=>void)[]=[
    r=>{r.stations[0].equipmentConfirmed=false as unknown as true;},
    r=>{r.stations[0].techniqueReviewed=false as unknown as true;},
    r=>{delete r.stations[1].load;},
    r=>{r.stations[1].loadBasis='per-hand';},
    r=>{delete r.stations[0].estimatedSeconds;},
    r=>{delete r.stations[7].targetHeightMeters;},
    r=>{r.stations[0].load={value:10,unit:'kg'};},
    r=>{r.stations[1].load={value:NaN,unit:'kg'};},
    r=>{r.stations[0].recoverySeconds=0;},
    r=>{r.stations[0].endpoint={type:'distance',meters:-1};},
    r=>{r.stations[1].stationId='ski';},
    r=>{r.sourceReference='';},
    r=>{r.reviewedAt='2099-01-01';},
  ];
  for(const mutate of mutations){
    const review=reviewedStations();mutate(review);
    const p=buildCoachingPrescription('hyrox',60,'z2',hyroxCoaching,false,review);
    assert.equal(p.paused,true);assert.deepEqual(p.steps,[]);assert.equal(p.sportStructure,undefined);
  }
  for(const [minutes,easy]of [[15,false],[60,true]] as const){
    const p=buildCoachingPrescription('hyrox',minutes,'z2',hyroxCoaching,easy,reviewedStations());
    assert.equal(p.paused,true);assert.deepEqual(p.steps,[],'cannot truncate station/rest doses or run a loaded dose on an easy adaptation');
  }
});

test('time-based reviewed station practice never acquires invented distance or timing estimates',()=>{
  const review=reviewedStations();review.stations=review.stations.slice(0,1);
  review.stations[0].endpoint={type:'time',seconds:90};delete review.stations[0].estimatedSeconds;
  const p=buildCoachingPrescription('hyrox',20,'z2',hyroxCoaching,false,review);
  const station=p.sportStructure?.kind==='hyrox'?p.sportStructure.steps.find(step=>step.kind==='station'):undefined;
  assert.equal(station?.kind,'station');
  if(station?.kind==='station'){assert.deepEqual(station.endpoint,{type:'time',seconds:90});assert.equal(station.estimatedSeconds,undefined);}
  assert.equal(p.steps.reduce((sum,step)=>sum+step.seconds,0),1200);
});

test('authored eight-station HYROX structure survives fallback regeneration and canonical execution unchanged',()=>{
  const authored=buildCoachingPrescription('hyrox',60,'z2',hyroxCoaching,false,reviewedStations());
  const originalPlan={sport:'hyrox',durationMin:60,intensity:'z2',cycleVersion:'bounded-cycle-v1',coaching:hyroxCoaching};
  const prior={...authored,sport:'hyrox',title:'Synthetic authored station practice',verdict:'full',durationMin:60,intensity:'z2',coaching:hyroxCoaching};
  const workout={id:'synthetic-authored-hyrox',userId:'synthetic',sport:'hyrox',title:prior.title,intensity:'z2',durationMin:60,prescription:JSON.stringify(prior),originalPlan:JSON.stringify(originalPlan)};
  const generic={...buildCoachingPrescription('hyrox',60,'z2',hyroxCoaching),sport:'hyrox',title:prior.title,verdict:'full',durationMin:60,intensity:'z2',coaching:hyroxCoaching,detail:{main:'Synthetic fallback'}};
  const retained=preserveSportStructure(workout,generic);
  assert.deepEqual(retained.sportStructure,authored.sportStructure);assert.equal(retained.structureReviewRequired,undefined);
  const c=canonicalSession({athleteId:'synthetic',workout,prescription:retained,dateLocal:startKey,timezone:'UTC'});
  assert.equal(c.verdict,'ready',c.reason);
  assert.equal(c.steps.filter(step=>step.sportDetail?.kind==='station').length,8);
  assert.equal(c.exactTimeSeconds,null,'distance/repetition work duration is estimated');
  assert.deepEqual(c.sportStructure,authored.sportStructure);
  const reduced=preserveSportStructure(workout,{...generic,durationMin:15});
  assert.equal(reduced.verdict,'rest');assert.deepEqual(reduced.sportStructure,authored.sportStructure,'a shortened budget must hold authored stations rather than erase them');
});
