import type { CoachingSessionMetadata } from './coaching-week-template';
import type { WorkoutStep } from './prescription';
import { normalizeSportStructure, sportStructureSteps, type SportStructure, type StrengthStructure, type HyroxStructure, type Load } from './sport-structure';

/** Race station identities, not automatic race doses or division loads. */
export const HYROX_COACHING_STATIONS = {
  ski: { name: 'SkiErg', purpose: 'Begin the pull with a hip hinge, finish with hands near the thighs, and return smoothly.', loaded: false },
  sledpush: { name: 'Sled push', purpose: 'Maintain controlled short steps and trunk position against the reviewed resistance.', loaded: true },
  sledpull: { name: 'Sled pull', purpose: 'Rehearse controlled rope handling and stable footwork in a clear lane.', loaded: true },
  burpee: { name: 'Burpee broad jump', purpose: 'Practice a familiar controlled floor transition and balanced two-foot landing.', loaded: false },
  row: { name: 'Row', purpose: 'Coordinate legs, trunk and arms; recover smoothly without chasing stroke rate.', loaded: false },
  farmers: { name: 'Farmer carry', purpose: 'Maintain posture and a secure grip while walking the reviewed route.', loaded: true },
  lunges: { name: 'Sandbag lunge', purpose: 'Keep balance and controlled knee/hip movement with the reviewed implement.', loaded: true },
  wallball: { name: 'Wall ball', purpose: 'Coordinate the reviewed squat and throw to the reviewed target height.', loaded: true },
} as const;
type HyroxStationId = keyof typeof HYROX_COACHING_STATIONS;
type HyroxDoseEndpoint = Extract<NonNullable<WorkoutStep['endpoint']>, {type:'time'|'distance'|'reps'}>;
/** Trusted caller must obtain and persist an actual review; this helper does not
 * authenticate a reviewer or discover equipment/skill from a division label. */
export interface HyroxPrescriptionReview {
  reviewedAt: string;
  sourceReference: string;
  stations: {
    stationId: HyroxStationId;
    equipmentConfirmed: true;
    techniqueReviewed: true;
    endpoint: HyroxDoseEndpoint;
    estimatedSeconds?: number;
    load?: Load;
    loadBasis?: 'total-including-sled'|'per-hand'|'implement';
    targetHeightMeters?: number;
    runSeconds: number;
    recoverySeconds: number;
  }[];
}

function reviewedHyroxStructure(review: HyroxPrescriptionReview, total: number, warm: number, cool: number, zone: string): HyroxStructure | undefined {
  try {
    if (!review || typeof review !== 'object' || typeof review.reviewedAt !== 'string' || !Number.isFinite(Date.parse(review.reviewedAt)) || Date.parse(review.reviewedAt)>Date.now() || typeof review.sourceReference !== 'string' || !review.sourceReference.trim() || review.sourceReference.length>500 || !Array.isArray(review.stations) || !review.stations.length || review.stations.length>8) return;
    const structure: HyroxStructure={schemaVersion:1,kind:'hyrox',steps:[{kind:'step',name:'Easy movement and reviewed station rehearsal',phase:'warmup',zone:'z1',endpoint:{type:'time',seconds:warm}}]};
    const ids=new Set<string>();
    let used=warm+cool;
    for(const dose of review.stations){
      if(!dose || !Object.hasOwn(HYROX_COACHING_STATIONS,dose.stationId) || ids.has(dose.stationId) || dose.equipmentConfirmed!==true || dose.techniqueReviewed!==true) return;
      ids.add(dose.stationId);
      const station=HYROX_COACHING_STATIONS[dose.stationId];
      const expectedBasis=dose.stationId.startsWith('sled')?'total-including-sled':dose.stationId==='farmers'?'per-hand':'implement';
      if(station.loaded ? !dose.load || !(dose.load.value>0) || dose.loadBasis!==expectedBasis : dose.load!==undefined || dose.loadBasis!==undefined) return;
      if(dose.stationId==='wallball' ? !Number.isFinite(dose.targetHeightMeters) || dose.targetHeightMeters!<=0 || dose.targetHeightMeters!>5 : dose.targetHeightMeters!==undefined) return;
      const endpoint=dose.endpoint;
      if(!endpoint || !['time','distance','reps'].includes(endpoint.type) || (endpoint.type==='reps'&&!['burpee','lunges','wallball'].includes(dose.stationId)) || (dose.stationId==='wallball'&&endpoint.type==='distance')) return;
      const seconds=endpoint.type==='time'?endpoint.seconds:dose.estimatedSeconds;
      if(!Number.isInteger(seconds) || seconds!<=0 || !Number.isInteger(dose.runSeconds) || dose.runSeconds<=0 || !Number.isInteger(dose.recoverySeconds) || dose.recoverySeconds<=0) return;
      used+=seconds!+dose.runSeconds+dose.recoverySeconds;
      const loadNote=dose.load?` Reviewed load: ${dose.load.value} ${dose.load.unit} (${expectedBasis}).`:'';
      structure.steps.push({kind:'run',name:'Controlled run / walk before reviewed station',zone,endpoint:{type:'time',seconds:dose.runSeconds},note:'Start at an effort you can repeat after the stations. Ease off when you cannot maintain control at the same effort.'});
      structure.steps.push({kind:'station',name:station.name,stationId:dose.stationId,zone:'z1',endpoint,...(endpoint.type==='time'?{}:{estimatedSeconds:seconds}),...(dose.load?{load:dose.load}:{}),note:`Purpose: ${station.purpose}${loadNote}${dose.stationId==='wallball'?` Reviewed target: ${dose.targetHeightMeters} m.`:''} Stop before technique deteriorates; stop painful movement. Reviewed ${review.reviewedAt}; source: ${review.sourceReference}. This is reviewed station practice, not race simulation or automatic progression.`});
      structure.steps.push({kind:'rest',seconds:dose.recoverySeconds,note:'Recover and set up the next station safely. Extend rest or stop if needed; do not compress recovery to catch up.'});
    }
    // Do not truncate a reviewed dose, omit stations or compress their recoveries.
    if(used>total) return;
    if(used<total) structure.steps.push({kind:'step',name:'Easy recovery and mobility; no extra station volume',phase:'cooldown',zone:'z1',endpoint:{type:'time',seconds:total-used}});
    structure.steps.push({kind:'step',name:'Easy cool-down',phase:'cooldown',zone:'z1',endpoint:{type:'time',seconds:cool}});
    return normalizeSportStructure(structure,'hyrox') as HyroxStructure;
  } catch { return; }
}

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
  const cap = Number(zone.slice(1)) || 1;
  const requested = ['vo2','short-interval'].includes(recipe) ? 5 : ['threshold','over-under'].includes(recipe) ? 4 : 3;
  const work = recipe === 'short-interval' ? 60 : recipe === 'vo2' ? 180 : recipe === 'tempo' ? 300 : 240;
  const recovery = recipe === 'vo2' ? 180 : 120;
  const quality = !['aerobic','technique','brick'].includes(recipe) && cap >= requested &&
    total >= 1200 + 300 + 2 * (work + recovery);
  const cool = Math.min(300, Math.floor(total / 4));
  const warm = quality ? 1200 : Math.min(600, Math.floor(total * .2));
  const main = total - warm - cool;
  const warmup = sport === 'run' ? cap === 1 ? 'Easy walk or jog' : 'Easy jog' : sport === 'bike' ? 'Easy spin' : 'Easy swim';
  const cooldown = sport === 'run' ? 'Easy jog or walk' : sport === 'bike' ? 'Easy spin' : 'Easy swim';
  const steps = quality ? [
    timed(warmup, 900, 'z1', 'warmup'),
    timed(sport === 'run' ? 'Dynamic running drills' : sport === 'bike' ? 'Smooth cadence build' : 'Progressive technique swim', 300, 'z1', 'warmup',
      sport === 'run' ? 'Use familiar ankle rocks, controlled leg swings and marching. Keep the range comfortable and return to an easy jog between drills.'
      : sport === 'bike' ? 'Use a light gear and gradually increase cadence while keeping pressure on the pedals easy.'
      : 'Use a familiar stroke and gradually build rhythm. Pause as needed and use a supervised setting.'),
  ] : [timed(warmup,warm,'z1','warmup')];
  if (quality) {
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
      steps.push(timed(`Relaxed repeat ${i+1}/${count}`,Math.max(1,seconds-30),`z${Math.min(2,cap)}`,'active',sport === 'swim' ? 'Use a familiar technique. Swim in a supervised setting; no breath-hold drills.' : 'Keep the movement familiar and relaxed.'));
      steps.push(timed('Reset and easy recovery',Math.min(30,seconds-1),'z1','recovery'));
    }
  } else steps.push(timed(cap === 1 && sport === 'run' ? 'Comfortable walk / run practice' : 'Steady aerobic work',main,`z${Math.min(2,cap)}`));
  steps.push(timed(cooldown,cool,'z1','cooldown'));
  return steps;
}

export function buildCoachingPrescription(sport: string, minutes: number, zone: string, coaching: CoachingSessionMetadata, easy = false, hyroxReview?: HyroxPrescriptionReview): {steps:WorkoutStep[];sportStructure?:SportStructure;note?:string;paused?:boolean} {
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
    return {steps:[...components[0].steps.map(step=>({...step,name:`Bike · ${step.name}`})),timed('T2 · safe bike-to-run transition',transition,'z1','recovery'),...components[1].steps.map(step=>({...step,name:`Run · ${step.name}`}))],sportStructure:{schemaVersion:1,kind:'brick',components,transitions}};
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
    if(hyroxReview!==undefined){
      // An easy adaptation must not quietly execute a previously reviewed loaded dose.
      const reviewed=easy?undefined:reviewedHyroxStructure(hyroxReview,total,warm,cool,`z${Math.min(2,Number(zone.slice(1))||1)}`);
      if(!reviewed) return {steps:[],paused:true,note:'Reviewed station practice is paused: confirm equipment, technique, explicit load/endpoint, complete time budget and current tolerance. Do not infer a replacement dose from division or race distance.'};
      return {steps:sportStructureSteps(reviewed).map(s=>s.step),sportStructure:reviewed,note:'Execute the reviewed station endpoints and rests only. Non-time endpoint durations are planning estimates. Change loads, distance, repetitions or progression only after review; this is not a race simulation.'};
    }
    structure.steps.push({kind:'step',name:'Easy walk or jog, then unloaded station rehearsal',phase:'warmup',zone:'z1',endpoint:{type:'time',seconds:warm},note:'Start comfortably. Rehearse familiar squat, hinge or step-back patterns with control before the first run–station block.'});
    const main=total-warm-cool, count=Math.max(1,Math.floor(main/300));
    for(let i=0;i<count;i++) {
      const block=i===count-1 ? main-Math.floor(main/count)*i : Math.floor(main/count);
      const technique=coaching.recipe==='hyrox-technique';
      const station=technique?90:60,recovery=technique?90:60;
      structure.steps.push({kind:'run',name:technique?'Easy run / walk between technique blocks':'Controlled run into station',zone:easy?'z1':`z${Math.min(2,Number(zone.slice(1))||1)}`,endpoint:{type:'time',seconds:Math.max(1,block-station-recovery)},...(!technique ? {note:'Start at a pace you can repeat after each station. Ease off if fatigue changes your stride.'} : {})});
      const preparation=[['Supported reverse-lunge preparation','lunge-pattern','Balance and controlled stepping for later reviewed lunges.'],['Controlled sit-to-stand preparation','squat-pattern','Controlled squat pattern for later reviewed wall-ball technique; no throwing prescribed.'],['Supported hip-hinge preparation','hinge-pattern','Rehearse a comfortable hinge for later reviewed erg technique; no erg distance prescribed.'],['Wall push-up preparation','push-pattern','Practice comfortable trunk and upper-body control; this does not substitute for sled or burpee practice.']][i%4];
      structure.steps.push({kind:'station',name:preparation[0],stationId:preparation[1],zone:'z1',endpoint:{type:'time',seconds:station},note:`Purpose: ${preparation[2]} Familiar comfortable movement; use support and stop before fatigue changes technique. No external load assumed. This is unloaded preparation, not execution of the eight race stations.`});
      structure.steps.push({kind:'rest',seconds:recovery});
    }
    structure.steps.push({kind:'step',name:'Easy cool-down',phase:'cooldown',zone:'z1',endpoint:{type:'time',seconds:cool}});
    if(main<(coaching.recipe==='hyrox-technique'?240:180)) return {steps:[],paused:true,note:'Not enough time for complete run–station practice.'};
    return {steps:sportStructureSteps(structure).map(s=>s.step),sportStructure:structure,note:'Station equipment, division and tolerated loads must be reviewed before prescribing loaded sleds, carries, wall balls or race simulation.'};
  }
  const required=['vo2','short-interval'].includes(coaching.recipe)?5:['threshold','over-under'].includes(coaching.recipe)?4:3;
  const steps = coachingEnduranceSteps(sport, minutes, zone, coaching.recipe);
  const qualityOmitted = !['aerobic','technique'].includes(coaching.recipe) &&
    !steps.some(step => step.phase === 'active' && Number(step.zone.slice(1)) >= required);
  return {steps, ...(qualityOmitted ? {note:'Quality work replaced by aerobic practice because the current readiness/baseline cap or available time cannot support the complete quality dose.'} : {})};
}
