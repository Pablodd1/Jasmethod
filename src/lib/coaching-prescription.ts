import type { CoachingSessionMetadata } from './coaching-week-template';
import type { WorkoutStep } from './prescription';
import { sportStructureSteps, type SportStructure, type StrengthStructure, type HyroxStructure } from './sport-structure';

const recipes = ['aerobic','technique','tempo','threshold','vo2','short-interval','over-under','strength-a','strength-b','brick','hyrox-technique','hyrox-hybrid'];
/** Validate persisted recipe identity before using it to generate an executable dose. */
export function validCoachingMetadata(value: unknown, sport: string): value is CoachingSessionMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const c = value as CoachingSessionMetadata;
  if (!recipes.includes(c.recipe) || !['foundation','development','specific','recovery'].includes(c.phase) || typeof c.purpose !== 'string' || !c.purpose.trim() || c.purpose.length > 2000 || typeof c.demanding !== 'boolean' || !Number.isInteger(c.minimumMinutes) || c.minimumMinutes < 1 || c.minimumMinutes > 240) return false;
  if (c.emphasis !== undefined && !['swim','bike','run','triathlon','hyrox'].includes(c.emphasis)) return false;
  if (c.note !== undefined && (typeof c.note !== 'string' || c.note.length > 2000)) return false;
  if (c.recipe.startsWith('strength-')) return sport === 'strength';
  if (c.recipe.startsWith('hyrox-')) return sport === 'hyrox';
  if (c.recipe === 'brick') return sport === 'brick';
  return ['swim','bike','run'].includes(sport);
}
const timed = (name: string, seconds: number, zone: string, phase: WorkoutStep['phase'] = 'active', note?: string): WorkoutStep => ({name,seconds,zone,phase,endpoint:{type:'time',seconds},...(note ? {note} : {})});

/** Relative zones are resolved against dated, sport-specific baselines at read/export.
 * All time includes warmup, complete work/recovery bouts and cooldown. Shortened
 * quality sessions become aerobic rather than compressed hard repetitions. */
export function coachingEnduranceSteps(sport: string, minutes: number, zone: string, recipe: CoachingSessionMetadata['recipe']): WorkoutStep[] {
  const total = Math.max(0, Math.floor(minutes * 60));
  if (!total) return [];
  const warm = Math.min(600, Math.floor(total * .2)), cool = Math.min(300, Math.floor(total * .1));
  const main = total - warm - cool;
  const steps = [timed('Progressive easy warm-up',warm,'z1','warmup')];
  const cap = Number(zone.slice(1)) || 1;
  // Over/under requires separate anchors and familiarity; use capped threshold
  // repeats until a reviewed protocol supplies those details.
  const requested = ['vo2','short-interval'].includes(recipe) ? 5 : ['threshold','over-under'].includes(recipe) ? 4 : 3;
  const quality = !['aerobic','technique','brick'].includes(recipe) && cap >= requested && minutes >= 25;
  if (quality) {
    const work = recipe === 'short-interval' ? 60 : recipe === 'vo2' ? 180 : recipe === 'tempo' ? 300 : 240;
    const recovery = recipe === 'short-interval' ? 120 : recipe === 'vo2' ? 180 : 120;
    const count = Math.min(recipe === 'short-interval' ? 8 : 4, Math.floor(main / (work + recovery)));
    for (let i = 0; i < count; i++) {
      steps.push(timed(`Repeat ${i+1}/${count} · controlled work`,work,`z${Math.min(cap,requested)}`));
      steps.push(timed('Easy recovery',recovery,'z1','recovery'));
    }
    const remainder = main - count * (work + recovery);
    if (remainder) steps.push(timed('Easy aerobic finish',remainder,`z${Math.min(2,cap)}`));
  } else if (sport === 'swim' || recipe === 'technique') {
    // Timed repeats do not invent pool length, stroke, CSS or distance.
    const count = Math.max(1, Math.floor(main / 300));
    const block = Math.floor(main / count);
    for (let i=0;i<count;i++) {
      const seconds = i === count-1 ? main-block*i : block;
      steps.push(timed(`Relaxed repeat ${i+1}/${count}`,Math.max(1,seconds-30),`z${Math.min(2,cap)}`,'active','Use a familiar technique. Swim in a supervised setting; no breath-hold drills.'));
      steps.push(timed('Reset and easy recovery',Math.min(30,seconds-1),'z1','recovery'));
    }
  } else steps.push(timed('Steady aerobic work',main,`z${Math.min(2,cap)}`));
  steps.push(timed('Easy cool-down',cool,'z1','cooldown'));
  return steps;
}

export function buildCoachingPrescription(sport: string, minutes: number, zone: string, coaching: CoachingSessionMetadata, easy = false): {steps:WorkoutStep[];sportStructure?:SportStructure;note?:string;paused?:boolean} {
  if (!validCoachingMetadata(coaching,sport)) throw new Error('Invalid saved coaching recipe. Review this session.');
  if (!minutes) return {steps:[]};
  if (easy) zone = `z${Math.min(2,Number(zone.slice(1))||1)}`;
  const total = Math.floor(minutes*60);
  if (sport === 'brick') {
    if (minutes < 15) return {steps:[],paused:true,note:'Insufficient time for two complete legs and a safe transition. Brick practice paused.'};
    const transition=120, run=Math.min(1200,Math.floor((total-transition)*.25)), bike=total-transition-run;
    const components = [
      {id:'bike',title:'Controlled bike leg',sport:'bike' as const,durationMin:bike/60,steps:coachingEnduranceSteps('bike',bike/60,zone,'aerobic')},
      {id:'run',title:'Comfortable run off the bike',sport:'run' as const,durationMin:run/60,steps:coachingEnduranceSteps('run',run/60,zone,'aerobic')},
    ];
    const transitions = [{afterComponentId:'bike',instruction:'T2: stop safely, park bike, remove helmet, change shoes. Extend transition or stop if unsafe; do not rush.',endpoint:{type:'time' as const,seconds:transition}}];
    return {steps:[...components[0].steps,timed('T2 · safe bike-to-run transition',transition,'z1','recovery'),...components[1].steps],sportStructure:{schemaVersion:1,kind:'brick',components,transitions}};
  }
  if (sport === 'strength') {
    const structure: StrengthStructure={schemaVersion:1,kind:'strength',steps:[]};
    const warm=Math.min(300,Math.floor(total*.2)), cool=Math.min(180,Math.floor(total*.1));
    structure.steps.push({kind:'step',name:'Easy mobility and familiar movement rehearsal',phase:'warmup',zone:'z1',endpoint:{type:'time',seconds:warm}});
    const support:Record<string,[string[],string[]]> = {
      swim:[['Wall slide','Wall push-up','Supported hip hinge','Bird dog'],['Prone scapular retraction','Glute bridge','Standing calf raise','Side-lying hip raise']],
      bike:[['Controlled sit-to-stand','Supported hip hinge','Glute bridge','Standing calf raise'],['Supported split squat','Wall push-up','Bird dog','Side-lying hip raise']],
      run:[['Supported split squat','Standing calf raise','Glute bridge','Bird dog'],['Controlled sit-to-stand','Supported hip hinge','Wall push-up','Side-lying hip raise']],
      hyrox:[['Controlled sit-to-stand','Supported hip hinge','Wall push-up','Standing calf raise'],['Supported reverse lunge','Glute bridge','Bird dog','Side-lying hip raise']],
    };
    const defaults:[string[],string[]]=[['Controlled sit-to-stand','Supported hip hinge','Wall push-up','Standing calf raise'],['Supported split squat','Glute bridge','Bird dog','Side-lying hip raise']];
    const exercises=(support[coaching.emphasis??'']??defaults)[coaching.recipe==='strength-a'?0:1];
    const rounds = easy ? 1 : Math.min(3,Math.max(1,Math.floor((total-warm-cool)/360)));
    for (let round=1;round<=rounds;round++) for (let i=0;i<exercises.length;i++) {
      structure.steps.push({kind:'set',exerciseId:`${coaching.emphasis??'general'}-${coaching.recipe}-${i}`,exerciseName:exercises[i],setNumber:round,zone:'z1',endpoint:{type:'reps',reps:6},estimatedSeconds:30,note:'Six total controlled repetitions; alternate sides for unilateral movements. Comfortable range; use support. Stop with at least 3 repetitions in reserve. No prescribed external load. Stop painful movement; substitute only with a reviewed familiar exercise.'});
      structure.steps.push({kind:'rest',seconds:60});
    }
    const remaining=total-warm-cool-rounds*360;
    if(remaining>0) structure.steps.push({kind:'step',name:'Comfortable mobility and recovery',phase:'cooldown',zone:'z1',endpoint:{type:'time',seconds:remaining}});
    structure.steps.push({kind:'step',name:'Easy cool-down',phase:'cooldown',zone:'z1',endpoint:{type:'time',seconds:cool}});
    // A shortened check-in can provide less than one complete set circuit.
    if(remaining<0) return {steps:[],paused:true,note:'Complete sets and recoveries do not fit. Strength work is paused.'};
    return {steps:sportStructureSteps(structure).map(s=>s.step),sportStructure:structure,note:'Introductory support strength. Progression to heavy lifting or plyometrics requires technique, equipment and tolerance review.'};
  }
  if(sport==='hyrox') {
    const structure: HyroxStructure={schemaVersion:1,kind:'hyrox',steps:[]};
    const warm=Math.min(300,Math.floor(total*.2)),cool=Math.min(180,Math.floor(total*.1));
    structure.steps.push({kind:'step',name:'Easy movement and station rehearsal',phase:'warmup',zone:'z1',endpoint:{type:'time',seconds:warm}});
    const main=total-warm-cool, count=Math.max(1,Math.floor(main/300));
    for(let i=0;i<count;i++) {
      const block=i===count-1 ? main-Math.floor(main/count)*i : Math.floor(main/count);
      const technique=coaching.recipe==='hyrox-technique';
      const station=technique?90:60,recovery=technique?90:60;
      structure.steps.push({kind:'run',name:technique?'Easy run / walk between technique blocks':'Controlled run into station',zone:easy?'z1':`z${Math.min(2,Number(zone.slice(1))||1)}`,endpoint:{type:'time',seconds:Math.max(1,block-station-recovery)}});
      structure.steps.push({kind:'station',name:i%2?'Bodyweight squat technique':'Supported reverse-lunge technique',stationId:i%2?'squat-pattern':'lunge-pattern',zone:'z1',endpoint:{type:'time',seconds:station},note:'Familiar comfortable movement; no division load assumed. Stop before fatigue changes technique. This is preparatory practice, not an official race simulation.'});
      structure.steps.push({kind:'rest',seconds:recovery});
    }
    structure.steps.push({kind:'step',name:'Easy cool-down',phase:'cooldown',zone:'z1',endpoint:{type:'time',seconds:cool}});
    if(main<(coaching.recipe==='hyrox-technique'?240:180)) return {steps:[],paused:true,note:'Not enough time for complete run–station practice.'};
    return {steps:sportStructureSteps(structure).map(s=>s.step),sportStructure:structure,note:'Station equipment, division and tolerated loads must be reviewed before prescribing loaded sleds, carries, wall balls or race simulation.'};
  }
  const required=['vo2','short-interval'].includes(coaching.recipe)?5:['threshold','over-under'].includes(coaching.recipe)?4:3;
  return {steps:coachingEnduranceSteps(sport,minutes,zone,coaching.recipe),...(!['aerobic','technique'].includes(coaching.recipe)&&(Number(zone.slice(1))<required||minutes<25)?{note:'Quality work replaced by aerobic practice because the current readiness/baseline cap or available time cannot support the complete quality dose.'}:{})};
}
