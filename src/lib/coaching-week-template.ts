import type { GeneratedWeek, PlanSession, Sport, ZoneKey } from './science';

export type CoachingRecipe = 'aerobic' | 'technique' | 'tempo' | 'threshold' | 'vo2' | 'short-interval' | 'over-under' | 'strength-a' | 'strength-b' | 'brick' | 'hyrox-technique' | 'hyrox-hybrid';
export interface CoachingSessionMetadata {
  recipe: CoachingRecipe;
  phase: 'foundation' | 'development' | 'specific' | 'recovery';
  purpose: string;
  emphasis?: string;
  demanding: boolean;
  minimumMinutes: number;
  role?: 'primary' | 'support';
  priority?: number;
  legs?: { sport: 'bike' | 'run'; minutes: number; zone: ZoneKey }[];
  note?: string;
}

type Candidate = { sport: Sport; title: string; recipe: CoachingRecipe; purpose: string; minimum: number; cap: number; weight: number; priority: number; demanding?: boolean; role?: 'primary' | 'support' };

/** Versioned JMM allocation defaults, not a prediction of individual tolerance.
 * Uses the caller's reviewed dose, preserves complete minimum-sized sessions,
 * and never obtains extra training capacity from an event or experience label.
 * Availability, symptoms, event shaping and canonical execution validation run
 * after this raw template; its output is not clearance to train. */
export function coachingWeekTemplate(options: {
  sport: 'swim' | 'bike' | 'run' | 'triathlon' | 'hyrox';
  weeks: number; weeklyHours: number; level: string; distance?: string; sessionLimitMinutes?: number;
  volume: (index: number) => number;
}): GeneratedWeek[] {
  return Array.from({length: Math.max(0, Math.floor(options.weeks))}, (_, index) => {
    const rawFactor = options.volume(index);
    const factor = Number.isFinite(rawFactor) ? Math.max(0, Math.min(1, rawFactor)) : 0;
    const budget = Number.isFinite(options.weeklyHours) ? Math.max(0, Math.floor(options.weeklyHours * 60 * factor)) : 0;
    const sessionLimit = options.sessionLimitMinutes === undefined ? Infinity
      : Number.isFinite(options.sessionLimitMinutes) ? Math.max(0,Math.floor(options.sessionLimitMinutes)) : 0;
    const recovery = index % 6 === 5;
    const introductory = options.level === 'beginner';
    const phase: CoachingSessionMetadata['phase'] = recovery ? 'recovery' : index % 6 < 2 ? 'foundation' : index % 6 < 4 ? 'development' : 'specific';
    // Familiar controlled tempo precedes more demanding interval options. A
    // beginner label never establishes eligibility for VO2/over-under work.
    const quality: CoachingRecipe = recovery || phase === 'foundation' ? 'aerobic'
      : introductory ? 'tempo'
        : ['threshold', 'short-interval', 'over-under', 'vo2'][Math.floor(index / 6) % 4] as CoachingRecipe;
    const hard = quality !== 'aerobic';
    const candidates: Candidate[] = [];
    const add = (sport: Sport, title: string, recipe: CoachingRecipe, purpose: string, minimum: number, cap: number, weight: number, priority: number, demanding = false, role: 'primary'|'support' = 'primary') => candidates.push({sport,title,recipe,purpose,minimum,cap: Math.min(sessionLimit,recovery ? Math.max(minimum,Math.floor(cap*factor)) : cap),weight,priority,demanding,role});
    const strength = () => {
      add('strength','Supporting strength A','strength-a','Develop familiar whole-body force capacity with controlled technique and repetitions in reserve',15,40,0.09,3,!introductory && !recovery,'support');
      add('strength','Supporting strength B · technique','strength-b','Practice complementary unilateral, trunk and sport-supporting patterns without exhaustive loading',15,35,0.08,3,false,'support');
    };
    if (options.sport === 'triathlon') {
      const longBikeWeight = options.distance === 'full' ? .36 : options.distance === 'sprint' ? .23 : .3;
      add('swim','Swim · technique and aerobic repeatability','technique','Practice familiar technique and repeatable relaxed swimming',20,60,.13,1);
      add('bike',hard ? 'Bike · controlled quality' : 'Bike · aerobic practice',quality,'Develop controlled sport-specific work without guessing a threshold',25,90,.17,1,hard);
      add('run','Run · sustained aerobic practice','aerobic','Build repeatable running durability without a fast finish',20,100,.17,1);
      strength();
      // A brick replaces part of the endurance allocation, never an appended
      // bonus. Its canonical recipe owns warm-up, two legs and transition time.
      add('brick','Brick · bike to run pacing','brick','Practice controlled bike pacing, T2 and comfortable running off the bike',40,150,longBikeWeight,2);
      add('swim','Swim · sustained aerobic sets','aerobic','Develop sustained swimming economy with familiar pauses',20,75,.12,4);
    } else if (options.sport === 'hyrox') {
      add('run','HYROX · easy running durability','aerobic','Build comfortable running independent of station fatigue',20,75,.24,1);
      add('hyrox','HYROX · station technique','hyrox-technique','Practice controlled station movement patterns; division loads remain unverified until supplied',20,60,.18,1);
      strength();
      add('run',hard ? 'HYROX · controlled run intervals' : 'HYROX · aerobic running',quality,'Develop running repeatability without maximal testing',25,60,.17,2,hard);
      add('hyrox','HYROX · controlled run–station combination','hyrox-hybrid','Practice running and station transitions with controlled technique and recoveries',35,75,.24,4,!recovery && !introductory);
    } else {
      const sport = options.sport;
      const cap = sport === 'swim' ? 75 : sport === 'run' ? 120 : 240;
      add(sport,`${sport} · aerobic durability`,'aerobic','Develop comfortable sustained sport-specific work',20,cap,.38,1);
      add(sport,`${sport} · ${hard ? 'controlled quality' : 'technique and repeatability'}`,hard ? quality : 'technique','Develop repeatable execution with duration-matched work and recovery',25,sport==='swim'?60:90,.25,2,hard);
      strength();
      add(sport,`${sport} · easy practice`,'aerobic','Reinforce comfortable frequency without adding another demanding exposure',20,sport==='swim'?60:75,.2,4);
    }
    // Retain complete units in priority order. At low budgets a missing
    // component is explicit in the week theme, not a one-minute fake workout.
    let remaining = budget;
    const selected = [...candidates].sort((a,b)=>a.priority-b.priority).filter(c => {
      if (remaining < c.minimum || c.cap < c.minimum) return false;
      remaining -= c.minimum; return true;
    });
    const introductoryAlternative = selected.length === 0 && budget >= 5 && sessionLimit >= 5;
    if (introductoryAlternative) {
      const sport = options.sport === 'triathlon' || options.sport === 'hyrox' ? 'run' : options.sport;
      selected.push({sport,title:`${sport} · brief familiar introduction`,recipe:'aerobic',purpose:sport === 'run'?'Familiar comfortable walk/run observation; not a replacement for the full program':'Brief familiar comfortable practice; not a replacement for the full program',minimum:5,cap:Math.min(10,sessionLimit),weight:1,priority:1,demanding:false,role:'primary'});
      remaining-=5;
    }
    const minutes = selected.map(c=>c.minimum);
    while (remaining > 0) {
      let winner = -1, deficit = -Infinity;
      selected.forEach((c,i)=> { const d = budget*c.weight-minutes[i]; if(minutes[i]<c.cap && d>deficit){winner=i;deficit=d;} });
      if(winner<0)break;
      minutes[winner]++;remaining--;
    }
    const sessions: PlanSession[] = selected.map((c,i)=> ({sport:c.sport,title:c.title,minutes:minutes[i],zone:c.sport==='strength'?'z1':c.recipe==='hyrox-hybrid'&&c.demanding?'z3':c.demanding ? quality==='tempo'?'z3':['vo2','short-interval'].includes(quality)?'z5':'z4':'z2',type:c.sport==='strength'?'strength':c.recipe==='brick'?'brick':c.demanding?'interval':'endurance',
      description:`Purpose: ${c.purpose}. Follow the complete duration-matched prescription. Current dated sport references determine numerical targets; missing references use explicit effort guidance. No automatic maximal test, external load or plyometric eligibility is inferred.`,
      coaching:{recipe:c.recipe,phase,purpose:c.purpose,demanding:Boolean(c.demanding),minimumMinutes:c.minimum,role:c.role,priority:c.priority,
        ...(c.recipe==='brick'?{note:'Ordered bike, T2 and run components must be preserved by the executable prescription; no extra run added outside this budget.'}:{}),
        ...(c.sport==='strength'?{emphasis:options.sport,note:'Plyometrics require separate eligibility; otherwise use controlled non-jumping movements.'}:{})}}));
    const omitted = candidates.filter(c=>!selected.includes(c)).map(c=>c.title);
    return {week:index+1,templateVersion:'coaching-structure-v1',periodizationFactor:factor,
      theme:`${options.sport} · ${phase} · reviewed capacity ceiling${introductoryAlternative?' · Brief introduction only; full program does not fit':''}${omitted.length?` · Time budget/session limit excludes complete components: ${omitted.join('; ')}`:''}`,
      sessions,totalMinutes:sessions.reduce((sum,s)=>sum+s.minutes,0)};
  });
}
