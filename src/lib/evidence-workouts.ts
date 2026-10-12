// Reviewed main-set structures. Effort-based execution is a JMM adaptation,
// never a claim that a trial's HRmax, PPO or maximal-speed target was measured.
import type { WorkoutStep } from './prescription';
export const WORKOUT_EVIDENCE_VERSION = '2026-10-11';
export interface EvidenceWorkout {
  id: string; title: string; sport: 'run' | 'bike'; purpose: string;
  source: { title: string; url: string; population: string; finding: string; limitation: string };
  studiedDose: string; adaptation: string; effort: string;
  bouts: number; workSeconds: number; recoverySeconds: number;
  warmupSeconds: number; cooldownSeconds: number;
  warmupSource?: 'study-duration';
  pattern?: '10-20-30';
}
export const EVIDENCE_WORKOUTS: EvidenceWorkout[] = [
  {
    id: 'cycling-4x8', title: 'Cycling · 4 × 8-minute intervals', sport: 'bike',
    purpose: 'Accumulate sustained aerobic work at a repeatable whole-session effort.',
    source: { title: 'Seiler et al. (2013)', url: 'https://pubmed.ncbi.nlm.nih.gov/21812820/', population: '35 recreational cyclists (29 men, 6 women); seven weeks, with two interval sessions weekly in the study.', finding: 'The 4 × 8-minute group had larger improvements in several aerobic and performance measures than the comparison prescriptions in this small study.', limitation: 'A small study does not establish a universal best session. Observed peak-heart-rate responses are not prescribed targets, FTP percentages or evidence of an individual lactate threshold.' },
    studiedDose: '4 × 8 minutes at the maximum effort sustainable across the complete session, with 2 minutes recovery between bouts; 15-minute warm-up.',
    adaptation: 'Preserve all four work bouts, three 2-minute recoveries and the 15-minute warm-up. The 5-minute cool-down and controlled hard-repeatable effort are JMM adaptations; study frequency is not automatically copied. Do not convert observed heart rate into an FTP target.',
    effort: 'Hard but controlled cycling you can repeat across all four bouts. Start conservatively; do not sprint or chase an observed study heart-rate value.',
    bouts: 4, workSeconds: 480, recoverySeconds: 120, warmupSeconds: 900, cooldownSeconds: 300, warmupSource: 'study-duration',
  },
  {
    id: 'running-10-20-30', title: 'Running · 10–20–30 blocks', sport: 'run',
    purpose: 'Practice changes of running speed inside controlled five-minute blocks.',
    source: { title: 'Gunnarsson & Bangsbo (2012)', url: 'https://pubmed.ncbi.nlm.nih.gov/22556401/', population: '18 moderately trained adults (6 women, 12 men), seven weeks.', finding: 'The intervention improved 1,500 m and 5 km performance in this small study.', limitation: 'Small sample and specific training context; not proof of benefit for every runner or permission for novice maximal sprinting.' },
    studiedDose: '3–4 × 5-minute blocks: five cycles of 30 s low (<30% maximal intensity), 20 s moderate (<60%), 10 s high (>90%); 2 min recovery between blocks.',
    adaptation: 'Use the lower studied block count (3). The 10-minute warm-up, 5-minute cool-down and controlled effort cues are JMM choices. Maximal-intensity percentages are not HR percentages; no maximal-speed test is inferred.',
    effort: 'Easy jog for 30 s, moderate controlled running for 20 s, fast relaxed running for 10 s. Keep technique; this adaptation does not demand an all-out sprint.',
    bouts: 3, workSeconds: 300, recoverySeconds: 120, warmupSeconds: 600, cooldownSeconds: 300, pattern: '10-20-30',
  },
  {
    id: 'cycling-60-75', title: 'Cycling · 60 s work / 75 s easy', sport: 'bike',
    purpose: 'Accumulate short repeatable aerobic efforts with complete scheduled recovery.',
    source: { title: 'Little et al. (2010)', url: 'https://doi.org/10.1113/jphysiol.2009.181743', population: 'Seven men; six training sessions over two weeks.', finding: 'Low-volume interval training produced skeletal-muscle metabolic adaptations.', limitation: 'Very small short study; muscle adaptations do not establish individual race benefit or long-term optimal programming.' },
    studiedDose: '8–12 × 60 s at approximately 100% ramp-test peak power output, with 75 s recovery.',
    adaptation: 'Eight bouts retain the lower studied count and recovery. The 10-minute warm-up, 5-minute cool-down and hard-repeatable effort are JMM choices. Ramp-test peak power is not FTP; this is not a 100% FTP prescription.',
    effort: 'Hard but repeatable cycling. Use familiar resistance and cadence; finish able to maintain control. No watt target without the applicable reviewed test.',
    bouts: 8, workSeconds: 60, recoverySeconds: 75, warmupSeconds: 600, cooldownSeconds: 300,
  },
];
export function evidenceWorkout(id: string) { return EVIDENCE_WORKOUTS.find(w => w.id === id); }
export function evidenceWorkoutSeconds(w: EvidenceWorkout) {
  return w.warmupSeconds + w.bouts * w.workSeconds + (w.bouts - 1) * w.recoverySeconds + w.cooldownSeconds;
}
export function buildEvidenceWorkout(w: EvidenceWorkout, minutes: number): WorkoutStep[] {
  const required = evidenceWorkoutSeconds(w);
  // No squeezing full recoveries, adding repetitions, or silently shortening
  // a reviewed main set to match the calendar's rounded-minute budget.
  if (!Number.isFinite(minutes) || minutes < Math.ceil(required / 60)) throw Error(`This protocol needs at least ${Math.ceil(required / 60)} minutes to preserve all work and recovery.`);
  const step = (name: string, seconds: number, phase: WorkoutStep['phase'], zone: string, note: string): WorkoutStep => ({ name, seconds, phase, zone, note, target: { type: 'open' }, endpoint: { type: 'time', seconds } });
  const steps = [step('Warm-up · easy and progressive', w.warmupSeconds, 'warmup', 'z1', `${w.warmupSource === 'study-duration' ? 'Warm-up duration follows the study; easy progressive execution is a JMM cue.' : 'Preparation time is a JMM coaching choice, not a verified trial warm-up.'} Stop and reassess if symptoms or pain appear.`)];
  for (let bout = 0; bout < w.bouts; bout++) {
    if (w.pattern === '10-20-30') {
      for (let cycle = 0; cycle < 5; cycle++) {
        const group = `Block ${bout + 1} · cycle ${cycle + 1}`;
        steps.push({ ...step(`${group} · easy`, 30, 'active', 'z2', 'Easy relaxed running.'), group });
        steps.push({ ...step(`${group} · moderate`, 20, 'active', 'z3', 'Controlled moderate effort; not a measured threshold.'), group });
        steps.push({ ...step(`${group} · fast relaxed`, 10, 'active', 'z5', w.effort), group });
      }
    } else steps.push(step(`Work ${bout + 1} of ${w.bouts}`, w.workSeconds, 'active', 'z5', w.effort));
    if (bout < w.bouts - 1) steps.push(step(`Easy recovery after block ${bout + 1}`, w.recoverySeconds, 'recovery', 'z1', 'Take the complete recovery. If quality does not return, stop the hard work.'));
  }
  // Round only the easy finish to whole minutes required by the saved workout
  // schema. Expose the extra seconds explicitly instead of hiding duration drift.
  const padding = Math.ceil(required / 60) * 60 - required;
  steps.push(step('JMM easy cool-down', w.cooldownSeconds + padding, 'cooldown', 'z1', `Easy finish is a coaching choice.${padding ? ` Includes ${padding} s to round the saved session to whole minutes.` : ''}`));
  return steps;
}

/** A retained protocol label must never bless edited or stale stored steps. */
export function reviewedWorkoutStructureCurrent(prescription: unknown): boolean {
  if (!prescription || typeof prescription !== 'object') return false;
  const p = prescription as Record<string, any>;
  const w = evidenceWorkout(p.protocol?.id);
  if (!w) return false;
  const expected = buildEvidenceWorkout(w, Math.ceil(evidenceWorkoutSeconds(w) / 60));
  return p.sport === w.sport && p.protocol.sport === w.sport && p.intensity === 'z5' &&
    p.durationMin === expected.reduce((sum, s) => sum + s.seconds, 0) / 60 &&
    Array.isArray(p.steps) && p.steps.length === expected.length &&
    p.steps.every((s: any, i: number) => s && s.seconds === expected[i].seconds &&
      s.phase === expected[i].phase && s.zone === expected[i].zone &&
      s.target?.type === 'open' && s.target.low == null && s.target.high == null &&
      s.endpoint?.type === 'time' && s.endpoint.seconds === expected[i].seconds &&
      s.reps == null);
}
