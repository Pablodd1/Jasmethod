/** Deterministic planning arithmetic, not a validated race/physiology predictor.
 * Evidence and limitations: docs/research/model-evidence.md (research handoff).
 * Grade: doi:10.1152/japplphysiol.01177.2001; cycling: doi:10.1123/jab.14.3.276.
 */
export const RACE_SCENARIO_VERSION = 'scenario-v1';
export type ScenarioSport = 'run' | 'bike' | 'swim';
export interface ScenarioBaseline {
  sourceId: string | null; source: 'benchmark' | 'manual'; observedAt: string;
  context: string; protocol: string; sport: ScenarioSport;
  metric: 'pace_sec_km' | 'power_w' | 'pace_sec_100m'; value: number;
}
/** distanceM is surface/path distance, not horizontal map distance. grade=rise/horizontal run. */
export interface ScenarioSegment { distanceM: number; grade: number; headwindMps: number; speedCapMps: number | null }
export interface ScenarioPracticeEvidence { observedAt: string; context: string; source: string; confirmed: boolean }
export interface ScenarioLeg {
  id: string; sport: ScenarioSport; distanceM: number;
  baseline: ScenarioBaseline | null;
  target: number | null; // sec/km run, watts bike, sec/100m swim; explicitly selected, never silently baseline-derived
  targetConfirmed: boolean;
  segments: ScenarioSegment[];
  flatCourseConfirmed?: boolean;
  timeMultiplier: number; // user scenario assumption, not automatic heat/altitude physiology
  bike: { totalMassKg: number; cdaM2: number; crr: number; airDensityKgM3: number; drivetrainEfficiency: number; grossEfficiency: number | null } | null;
  hrTargetBpm: [number, number] | null;
  intensityEvidence?: ScenarioPracticeEvidence | null;
  runPowerTargetW?: number | null;
  runPowerDevice?: string | null;
}
export interface ScenarioWeather {
  kind: 'unknown' | 'manual' | 'forecast' | 'history' | 'climatology';
  source: string; issuedAt: string | null; validFrom: string | null; validTo: string | null;
  temperatureC: number | null; humidityPct: number | null; windMps: number | null;
}
export interface RaceScenarioInput {
  name: string; eventType: 'run_road' | 'run_trail' | 'bike_road' | 'bike_tt' | 'triathlon' | 'swim';
  startAt: string | null; weather: ScenarioWeather; legs: ScenarioLeg[];
  transitionSeconds: number; practicedCarbsGph: number | null;
  fuelEvidence?: ScenarioPracticeEvidence | null;
  sensitivityPercent: number; // explicitly selected symmetric target-time sensitivity, NOT confidence
}
export interface ScenarioSegmentResult {
  index: number; distanceM: number; grade: number; durationSeconds: number;
  speedMps: number; paceSecondsPerKm: number; actualPowerW: number | null;
  mechanicalWorkKj: number | null;
}
export interface ScenarioLegResult {
  id: string; sport: ScenarioSport; durationSeconds: number | null; paceSecondsPerKm: number | null;
  powerW: number | null; actualAveragePowerW: number | null; runPowerTargetW: number | null; hrTargetBpm: [number, number] | null;
  mechanicalWorkKj: number | null; metabolicKcal: number | null;
  missingInputs: string[]; warnings: string[]; segments: ScenarioSegmentResult[];
}
export interface RaceScenarioResult {
  modelVersion: string; classification: 'scenario'; inputSnapshot: RaceScenarioInput;
  durationSeconds: number | null; legs: ScenarioLegResult[];
  carbohydrateGrams: number | null; feedingDurationSeconds: number | null;
  sensitivity: { label: 'Selected time sensitivity, not a confidence interval'; lowSeconds: number; highSeconds: number } | null;
  warnings: string[];
}
export type ScenarioParseResult = { ok: true; value: RaceScenarioInput } | { ok: false; errors: string[] };

/** Reject unknown fields and non-finite JSON numbers, rather than silently coercing them. */
export function parseRaceScenarioInput(raw: unknown, asOf: Date = new Date()): ScenarioParseResult {
  const errors: string[] = [];
  if (!Number.isFinite(asOf.getTime())) return {ok:false,errors:['Invalid validation clock']};
  const record = (v: unknown, path: string, keys: string[]): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${path}: expected object`); return {}; }
    const r = v as Record<string, unknown>;
    for (const key of Object.keys(r)) if (!keys.includes(key)) errors.push(`${path}.${key}: unknown field`);
    return r;
  };
  const number = (v: unknown, path: string, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) { errors.push(`${path}: finite number required (${min}–${max})`); return min; }
    return v;
  };
  const nullableNumber = (v: unknown, path: string, min: number, max: number) => v === null ? null : number(v, path, min, max);
  const string = (v: unknown, path: string, max = 500): string => {
    if (typeof v !== 'string' || !v.trim() || v.length > max) { errors.push(`${path}: nonempty text required (max ${max})`); return ''; }
    return v.trim();
  };
  const date = (v: unknown, path: string, nullable: boolean): string | null => {
    if (nullable && v === null) return null;
    const s = string(v, path, 40);
    if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(s) || !Number.isFinite(Date.parse(s))) errors.push(`${path}: valid ISO date or offset timestamp required`);
    if (s.includes('T')) {
      const time=s.slice(11,19).split(':').map(Number);
      if(time[0]>23||time[1]>59||time[2]>59)errors.push(`${path}: invalid clock time`);
    }
    // Date.parse normalizes impossible dates (e.g. February 30); reject them.
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const [y,m,d] = s.slice(0,10).split('-').map(Number);
      const check = new Date(Date.UTC(y,m-1,d));
      if (check.getUTCFullYear()!==y || check.getUTCMonth()!==m-1 || check.getUTCDate()!==d) errors.push(`${path}: invalid calendar date`);
    }
    return s;
  };
  const enumeration = <T extends string>(v: unknown, path: string, allowed: readonly T[]): T => {
    if (typeof v !== 'string' || !allowed.includes(v as T)) { errors.push(`${path}: unsupported value`); return allowed[0]; }
    return v as T;
  };
  const practiceEvidence = (v: unknown, path: string): ScenarioPracticeEvidence | null => {
    if (v === null || v === undefined) return null;
    const e=record(v,path,['observedAt','context','source','confirmed']);
    if (typeof e.confirmed !== 'boolean') errors.push(`${path}.confirmed: boolean required`);
    const observedAt=date(e.observedAt,`${path}.observedAt`,false)!;
    if (Date.parse(observedAt)>asOf.getTime()) errors.push(`${path}.observedAt: observed evidence cannot be in the future`);
    return {observedAt,context:string(e.context,`${path}.context`),source:string(e.source,`${path}.source`),confirmed:e.confirmed===true};
  };
  const r = record(raw,'scenario',['name','eventType','startAt','weather','legs','transitionSeconds','practicedCarbsGph','fuelEvidence','sensitivityPercent']);
  const w = record(r.weather,'weather',['kind','source','issuedAt','validFrom','validTo','temperatureC','humidityPct','windMps']);
  const weather: ScenarioWeather = {
    kind: enumeration(w.kind,'weather.kind',['unknown','manual','forecast','history','climatology']),
    source: typeof w.source === 'string' && w.source.length <= 500 ? w.source.trim() : string(w.source,'weather.source'),
    issuedAt: date(w.issuedAt,'weather.issuedAt',true), validFrom: date(w.validFrom,'weather.validFrom',true), validTo: date(w.validTo,'weather.validTo',true),
    temperatureC: nullableNumber(w.temperatureC,'weather.temperatureC',-90,65), humidityPct: nullableNumber(w.humidityPct,'weather.humidityPct',0,100), windMps: nullableNumber(w.windMps,'weather.windMps',0,100),
  };
  if (weather.kind !== 'unknown' && !weather.source) errors.push('weather.source: provenance required');
  if (weather.kind === 'forecast' && (!weather.issuedAt || !weather.validFrom || !weather.validTo)) errors.push('weather: forecast issue and validity timestamps required');
  if (weather.validFrom && weather.validTo && Date.parse(weather.validFrom) > Date.parse(weather.validTo)) errors.push('weather: validity range reversed');
  if (!Array.isArray(r.legs) || r.legs.length<1 || r.legs.length>10) errors.push('legs: between 1 and 10 legs required');
  const legs: ScenarioLeg[] = (Array.isArray(r.legs) ? r.legs.slice(0,10) : []).map((item,index) => {
    const p = `legs[${index}]`;
    const l = record(item,p,['id','sport','distanceM','baseline','target','targetConfirmed','segments','flatCourseConfirmed','timeMultiplier','bike','hrTargetBpm','intensityEvidence','runPowerTargetW','runPowerDevice']);
    const sport = enumeration(l.sport,`${p}.sport`,['run','bike','swim']);
    let baseline: ScenarioBaseline | null = null;
    if (l.baseline !== null) {
      const b=record(l.baseline,`${p}.baseline`,['sourceId','source','observedAt','context','protocol','sport','metric','value']);
      baseline={sourceId:b.sourceId===null?null:string(b.sourceId,`${p}.baseline.sourceId`,200),source:enumeration(b.source,`${p}.baseline.source`,['benchmark','manual']),observedAt:date(b.observedAt,`${p}.baseline.observedAt`,false)!,context:string(b.context,`${p}.baseline.context`),protocol:string(b.protocol,`${p}.baseline.protocol`),sport:enumeration(b.sport,`${p}.baseline.sport`,['run','bike','swim']),metric:enumeration(b.metric,`${p}.baseline.metric`,['pace_sec_km','power_w','pace_sec_100m']),value:number(b.value,`${p}.baseline.value`,0.001,10000)};
      if (Date.parse(baseline.observedAt)>asOf.getTime()) errors.push(`${p}.baseline.observedAt: observed evidence cannot be in the future`);
      if (baseline.sport!==sport || baseline.metric!==({run:'pace_sec_km',bike:'power_w',swim:'pace_sec_100m'}[sport])) errors.push(`${p}.baseline: sport/metric mismatch`);
      if (baseline.source==='benchmark' && !baseline.sourceId) errors.push(`${p}.baseline.sourceId: benchmark id required`);
    }
    if (!Array.isArray(l.segments) || l.segments.length>1000) errors.push(`${p}.segments: array up to 1000 segments required`);
    const segments: ScenarioSegment[] = (Array.isArray(l.segments)?l.segments.slice(0,1000):[]).map((entry,j)=>{
      const sp=`${p}.segments[${j}]`;const s=record(entry,sp,['distanceM','grade','headwindMps','speedCapMps']);
      return {distanceM:number(s.distanceM,`${sp}.distanceM`,0.01,1000000),grade:number(s.grade,`${sp}.grade`,-0.45,0.45),headwindMps:number(s.headwindMps,`${sp}.headwindMps`,-50,50),speedCapMps:nullableNumber(s.speedCapMps,`${sp}.speedCapMps`,0.1,40)};
    });
    const distanceM=number(l.distanceM,`${p}.distanceM`,1,1000000);
    if (segments.length && Math.abs(segments.reduce((s,x)=>s+x.distanceM,0)-distanceM)>Math.max(1,distanceM*0.001)) errors.push(`${p}.segments: distances must sum to leg distance within 0.1% or 1 m`);
    if (sport==='swim' && segments.length) errors.push(`${p}.segments: swimming requires explicit pace, no road mechanics`);
    let bike: ScenarioLeg['bike']=null;
    if (l.bike!==null) {
      const b=record(l.bike,`${p}.bike`,['totalMassKg','cdaM2','crr','airDensityKgM3','drivetrainEfficiency','grossEfficiency']);
      bike={totalMassKg:number(b.totalMassKg,`${p}.bike.totalMassKg`,20,350),cdaM2:number(b.cdaM2,`${p}.bike.cdaM2`,0.05,2),crr:number(b.crr,`${p}.bike.crr`,0.0001,0.1),airDensityKgM3:number(b.airDensityKgM3,`${p}.bike.airDensityKgM3`,0.3,1.6),drivetrainEfficiency:number(b.drivetrainEfficiency,`${p}.bike.drivetrainEfficiency`,0.5,1),grossEfficiency:nullableNumber(b.grossEfficiency,`${p}.bike.grossEfficiency`,0.1,0.35)};
      if (sport!=='bike') errors.push(`${p}.bike: bicycle mechanics only valid for bike legs`);
    }
    let hrTargetBpm: [number,number] | null=null;
    if (l.hrTargetBpm!==null) {
      if (!Array.isArray(l.hrTargetBpm)||l.hrTargetBpm.length!==2) errors.push(`${p}.hrTargetBpm: pair required`);
      else {hrTargetBpm=[number(l.hrTargetBpm[0],`${p}.hrTargetBpm[0]`,30,240),number(l.hrTargetBpm[1],`${p}.hrTargetBpm[1]`,30,240)];if(hrTargetBpm[0]>hrTargetBpm[1])errors.push(`${p}.hrTargetBpm: reversed band`);}
    }
    const intensityEvidence=practiceEvidence(l.intensityEvidence,`${p}.intensityEvidence`);
    const runPowerTargetW=l.runPowerTargetW===undefined?null:nullableNumber(l.runPowerTargetW,`${p}.runPowerTargetW`,1,2500);
    const runPowerDevice=l.runPowerDevice===undefined||l.runPowerDevice===null?null:string(l.runPowerDevice,`${p}.runPowerDevice`,200);
    if(runPowerTargetW!==null&&sport!=='run')errors.push(`${p}.runPowerTargetW: running only`);
    if(l.flatCourseConfirmed!==undefined&&typeof l.flatCourseConfirmed!=='boolean')errors.push(`${p}.flatCourseConfirmed: boolean required`);
    if(sport==='bike'&&l.timeMultiplier!==1)errors.push(`${p}.timeMultiplier: cycling requires 1; vary power or explicit sensitivity instead`);
    if(typeof l.targetConfirmed!=='boolean')errors.push(`${p}.targetConfirmed: boolean required`);
    return {id:string(l.id,`${p}.id`,100),sport,distanceM,baseline,target:nullableNumber(l.target,`${p}.target`,sport==='bike'?1:10,sport==='bike'?2500:3600),targetConfirmed:l.targetConfirmed===true,segments,flatCourseConfirmed:l.flatCourseConfirmed===true,timeMultiplier:number(l.timeMultiplier,`${p}.timeMultiplier`,0.5,3),bike,hrTargetBpm,intensityEvidence,runPowerTargetW,runPowerDevice};
  });
  if(new Set(legs.map(l=>l.id)).size!==legs.length)errors.push('legs: duplicate ids');
  const value: RaceScenarioInput={name:string(r.name,'name',150),eventType:enumeration(r.eventType,'eventType',['run_road','run_trail','bike_road','bike_tt','triathlon','swim']),startAt:date(r.startAt,'startAt',true),weather,legs,transitionSeconds:number(r.transitionSeconds,'transitionSeconds',0,86400),practicedCarbsGph:nullableNumber(r.practicedCarbsGph,'practicedCarbsGph',0,180),fuelEvidence:practiceEvidence(r.fuelEvidence,'fuelEvidence'),sensitivityPercent:number(r.sensitivityPercent,'sensitivityPercent',0,50)};
  if (value.startAt && !value.startAt.includes('T')) errors.push('startAt: time and offset required');
  if(value.eventType!=='triathlon'){
    const requiredSport=value.eventType.startsWith('run')?'run':value.eventType.startsWith('bike')?'bike':'swim';
    if(legs.some(l=>l.sport!==requiredSport))errors.push('legs: event sport mismatch');
  } else if (legs.length!==3 || legs.map(l=>l.sport).join(',')!=='swim,bike,run') errors.push('triathlon: exactly swim, bike, run in order required');
  return errors.length?{ok:false,errors}:{ok:true,value};
}

export function runningGradeCost(grade: number): number {
  return 155.4*grade**5-30.4*grade**4-43.3*grade**3+46.3*grade**2+19.5*grade+3.6;
}
export function cyclingCrankPower(speed: number, segment: ScenarioSegment, bike: NonNullable<ScenarioLeg['bike']>): number {
  const angle=Math.atan(segment.grade),air=speed+segment.headwindMps;
  return (bike.totalMassKg*9.80665*Math.sin(angle)+bike.crr*bike.totalMassKg*9.80665*Math.cos(angle)+0.5*bike.airDensityKgM3*bike.cdaM2*air*Math.abs(air))*speed/bike.drivetrainEfficiency;
}

export function calculateScenario(raw: RaceScenarioInput, asOf: Date = new Date()): RaceScenarioResult {
  const parsed=parseRaceScenarioInput(raw,asOf);
  if(!parsed.ok)throw new Error(`Invalid race scenario: ${parsed.errors.join('; ')}`);
  const fresh = (e: {observedAt:string} | null | undefined): boolean => !!e && asOf.getTime()-Date.parse(e.observedAt)<=90*86400000;
  const input=parsed.value; // parser reconstructs nested input, so the snapshot does not alias caller data
  const warnings=['Evidence recency uses a 90-day product review window, not a physiological expiry date.','Planning scenario, not a validated finish-time or physiology prediction.','Weather is contextual; no automatic heat, humidity, altitude or acclimation adjustment.','Selected targets do not establish that this effort is sustainable.'];
  if(input.eventType==='bike_road')warnings.push('Solo-equivalent cycling: drafting, attacks and pack tactics are not modeled.');
  if(input.eventType==='triathlon')warnings.push('Each leg target is selected separately; fresh benchmarks do not establish post-bike run capacity.');
  if(input.practicedCarbsGph!==null&&input.practicedCarbsGph>90)warnings.push('High intake is user-entered, not recommended by this model; retain a practiced, individually reviewed plan.');
  const legs=input.legs.map((leg):ScenarioLegResult=>{
    const missingInputs:string[]=[],warn:string[]=[];
    if(!leg.baseline)missingInputs.push('Dated sport-specific baseline/reference');
    else if(!fresh(leg.baseline))missingInputs.push('Reference outside the 90-day product review window; reconfirm with current evidence');
    if(leg.target===null||!leg.targetConfirmed)missingInputs.push('Explicitly confirmed race target');
    if(leg.sport!=='swim'&&!leg.segments.length&&!leg.flatCourseConfirmed)missingInputs.push('Course segments or explicitly confirmed flat/zero axial wind course assumption');
    if(leg.sport==='bike'&&!leg.bike)missingInputs.push('Explicit bicycle mass, drag, rolling resistance, density and drivetrain inputs');
    if(leg.sport==='run'&&leg.segments.some(s=>Math.abs(s.grade)>0.15))missingInputs.push('Segment target required beyond ±15% grade; automatic grade pacing unsupported');
    if(leg.baseline)warn.push(`Reference only: ${leg.baseline.protocol}. Selected target is not inferred from that reference.`);
    if(leg.timeMultiplier!==1)warn.push(`User-selected time multiplier ${leg.timeMultiplier}; not a calibrated physiological correction.`);
    const result:ScenarioLegResult={id:leg.id,sport:leg.sport,durationSeconds:null,paceSecondsPerKm:null,powerW:leg.sport==='bike'&&leg.targetConfirmed?leg.target:null,actualAveragePowerW:null,runPowerTargetW:leg.intensityEvidence?.confirmed&&fresh(leg.intensityEvidence)&&leg.runPowerDevice?leg.runPowerTargetW??null:null,hrTargetBpm:leg.intensityEvidence?.confirmed&&fresh(leg.intensityEvidence)&&leg.hrTargetBpm?[...leg.hrTargetBpm]:null,mechanicalWorkKj:null,metabolicKcal:null,missingInputs,warnings:warn,segments:[]};
    if(leg.hrTargetBpm&&(!leg.intensityEvidence?.confirmed||!fresh(leg.intensityEvidence)))warn.push('HR target withheld: dated sport-specific intensity evidence must be confirmed.');
    if(leg.runPowerTargetW&&(!leg.intensityEvidence?.confirmed||!fresh(leg.intensityEvidence)||!leg.runPowerDevice))warn.push('Running watts withheld: dated same-device intensity evidence and device required.');
    if(missingInputs.length)return result;
    const target=leg.target!;
    const segments=leg.segments.length?leg.segments:[{distanceM:leg.distanceM,grade:0,headwindMps:0,speedCapMps:null}];
    if(!leg.segments.length && leg.sport!=='swim')warn.push('Flat, zero axial wind scenario explicitly used because no course segments were supplied.');
    let duration=0,work=0;
    if(leg.sport==='swim'){
      duration=leg.distanceM*target/100*leg.timeMultiplier;
      result.segments.push({index:0,distanceM:leg.distanceM,grade:0,durationSeconds:duration,speedMps:leg.distanceM/duration,paceSecondsPerKm:duration/leg.distanceM*1000,actualPowerW:null,mechanicalWorkKj:null});
      warn.push('Selected swim pace; pool CSS is not an open-water prediction. Current, waves and navigation are not modeled.');
    } else if(leg.sport==='run') {
      for(const s of segments){
        let speed=1000/target/(runningGradeCost(s.grade)/3.6)/leg.timeMultiplier;
        if(s.grade<0 && s.speedCapMps===null){speed=Math.min(speed,1000/target/leg.timeMultiplier);warn.push('No downhill speed credit without an explicit athlete-selected speed cap.');}
        if(s.speedCapMps!==null)speed=Math.min(speed,s.speedCapMps);
        const seconds=s.distanceM/speed;duration+=seconds;
        result.segments.push({index:result.segments.length,distanceM:s.distanceM,grade:s.grade,durationSeconds:seconds,speedMps:speed,paceSecondsPerKm:1000/speed,actualPowerW:null,mechanicalWorkKj:null});
        if(s.headwindMps!==0)warn.push('Running wind effect not quantified; segment wind retained as context.');
      }
      warn.push('Fixed metabolic-power grade-cost-to-pace mapping is an additional, unvalidated field assumption; technical terrain and fatigue are not modeled.');
    } else {
      const bike=leg.bike!;
      for(const s of segments){
        // On the positive-power branch, the root after any negative-power/coasting region is unique.
        let lo=0,hi=40;
        if(cyclingCrankPower(hi,s,bike)<target){missingInputs.push('Selected power/conditions exceed the bounded 40 m/s solver; revise assumptions');return result;}
        for(let i=0;i<80;i++){const mid=(lo+hi)/2;if(cyclingCrankPower(mid,s,bike)<target)lo=mid;else hi=mid;}
        let speed=(lo+hi)/2;
        if(s.speedCapMps!==null)speed=Math.min(speed,s.speedCapMps);
        // A user-selected time multiplier changes speed; recompute work consistently at the resulting speed.
        speed/=leg.timeMultiplier;
        if(s.speedCapMps!==null)speed=Math.min(speed,s.speedCapMps);
        const needed=cyclingCrankPower(speed,s,bike),actualPower=Math.max(0,needed);
        if(needed<0)warn.push('Speed cap requires coasting/braking; no negative rider work counted.');
        const seconds=s.distanceM/speed;duration+=seconds;work+=actualPower*seconds/1000;
        result.segments.push({index:result.segments.length,distanceM:s.distanceM,grade:s.grade,durationSeconds:seconds,speedMps:speed,paceSecondsPerKm:1000/speed,actualPowerW:actualPower,mechanicalWorkKj:actualPower*seconds/1000});
      }
      result.mechanicalWorkKj=work;
      result.actualAveragePowerW=work*1000/duration;
      result.metabolicKcal=bike.grossEfficiency===null?null:work/bike.grossEfficiency/4.184;
      warn.push('Segment steady-state axial-wind mechanics; acceleration, crosswind yaw, corners and surface changes need explicit scenarios.');
      if(leg.timeMultiplier!==1)warn.push('Cycling time multiplier changes required mechanical power; displayed target remains the selected reference, not actual segment power.');
    }
    result.durationSeconds=duration;
    result.paceSecondsPerKm=duration/(leg.distanceM/1000);
    result.warnings=[...new Set(warn)];return result;
  });
  const complete=legs.every(l=>l.durationSeconds!==null);
  const durationSeconds=complete?legs.reduce((sum,l)=>sum+l.durationSeconds!,input.transitionSeconds):null;
  // Fuel scheduling counts bike/run windows only. It is not estimated metabolic demand.
  const feedingDurationSeconds=complete&&input.eventType!=='swim'?legs.filter(l=>l.sport!=='swim').reduce((sum,l)=>sum+l.durationSeconds!,0):null;
  const carbohydrateGrams=feedingDurationSeconds!==null&&input.practicedCarbsGph!==null&&input.fuelEvidence?.confirmed&&fresh(input.fuelEvidence)?feedingDurationSeconds/3600*input.practicedCarbsGph:null;
  if(input.practicedCarbsGph!==null&&(!input.fuelEvidence?.confirmed||!fresh(input.fuelEvidence)))warnings.push('Fuel total withheld: dated practiced tolerance evidence must be confirmed.');
  if(input.weather.kind==='forecast'){
    const start=input.startAt?Date.parse(input.startAt):NaN;
    if(!Number.isFinite(start)||durationSeconds===null||start<Date.parse(input.weather.validFrom!)||start+durationSeconds*1000>Date.parse(input.weather.validTo!))warnings.push('Forecast does not cover the complete race window; do not treat it as race-day forecast coverage.');
  }
  if(input.eventType==='swim')warnings.push('Open-water swim feeding windows are not modeled; a zero-carbohydrate plan is not implied.');
  if(input.weather.kind==='history'||input.weather.kind==='climatology')warnings.push('Historical conditions are not a forecast for the event.');
  if(input.weather.kind==='unknown')warnings.push('Weather unknown; no actual conditions assumed.');
  return {modelVersion:RACE_SCENARIO_VERSION,classification:'scenario',inputSnapshot:input,durationSeconds,legs,carbohydrateGrams,feedingDurationSeconds,sensitivity:durationSeconds===null?null:{label:'Selected time sensitivity, not a confidence interval',lowSeconds:durationSeconds*(1-input.sensitivityPercent/100),highSeconds:durationSeconds*(1+input.sensitivityPercent/100)},warnings};
}
