import type { GeneratedWeek, PlanSession } from './science';

/** Transparent allocation defaults, not a fitted athlete response model.
 * The input is the athlete's reviewed recent weekly dose, never a race-derived
 * entitlement to extra hours. Availability, recovery and event guards run next.
 * Separate bouts prevent one session from inheriting an entire sport's week. */
export function reviewedTriathlonTemplate(options: {
  weeks: number;
  weeklyHours: number;
  distance?: string;
  volume: (index: number) => number;
}): GeneratedWeek[] {
  // Distance changes the distribution within the same tolerated ceiling. These
  // proportions are explicit coaching defaults, not physiological measurements
  // or a claim that this frequency/dose is sufficient to finish any distance.
  const doses = options.distance === 'sprint' ? [.1, .25, .175, .1, .2, .175]
    : options.distance === 'olympic' ? [.09, .28, .16, .09, .22, .16]
      : options.distance === 'full' ? [.075, .34, .125, .075, .26, .125]
        : [.075, .32, .15, .075, .23, .15];
  const sports = ['swim', 'bike', 'run', 'swim', 'bike', 'run'] as const;
  return Array.from({ length: options.weeks }, (_, index) => {
    const factor = options.volume(index);
    const budget = Math.max(0, Math.round(options.weeklyHours * 60 * Math.min(1, factor)));
    // Round the cumulative allocation so six independently rounded bouts do
    // not silently lose time. Sport caps can still leave honest unused time.
    let cumulative = 0, allocated = 0;
    const boutMinutes = doses.map((dose, i) => {
      cumulative += dose;
      const next = i === doses.length - 1 ? budget : Math.round(budget * cumulative);
      const minutes = next - allocated; allocated = next; return minutes;
    });
    const quality = index % 6 >= 2 && index % 6 < 5;
    const sessions: PlanSession[] = sports.flatMap((sport, i) => {
      const hard = quality && (i === 1 || i === 5), zone = hard ? 'z4' : 'z2';
      const cap = hard ? 90 : sport === 'swim' ? 75 : sport === 'run' ? 120 : 240;
      // A zero/tiny dose cannot create six compulsory one-minute workouts.
      const minutes = Math.min(cap, boutMinutes[i]);
      if (!minutes) return [];
      const purpose = sport === 'swim'
        ? i === 0 ? 'comfortable aerobic swimming and familiar technique' : 'repeatable relaxed swimming with pauses as needed'
        : hard ? 'controlled threshold intervals with easy recoveries'
          : i === 4 ? 'steady aerobic riding and a repeatable fueling routine'
            : i === 5 ? 'comfortable sustained running without a fast finish' : 'comfortable aerobic practice';
      return [{ sport, minutes, zone, type: hard ? 'threshold' : 'endurance',
        title: sport === 'swim' ? i === 0 ? 'Swim: Aerobic practice' : 'Swim: Technique and repeatability'
          : hard ? `${sport}: Provisional threshold intervals`
            : i === 4 ? 'Bike: Long aerobic practice' : i === 5 ? 'Run: Long aerobic practice' : `${sport}: Easy aerobic practice`,
        description: `Purpose: ${purpose}. Follow the duration-matched warm-up, work, recovery and cool-down steps; do not add a fixed distance or extra repetitions. ${sport === 'swim' ? 'Use a safe familiar setting; pool length, stroke, repetitions and rests require explicit review before FIT export. ' : ''}Numerical targets require current dated evidence for this sport; otherwise use the displayed effort guidance. This session does not test or renew a baseline. Run-off-bike and swim-bike-run race rehearsal require explicit ordered legs and transitions; ordinary single-sport sessions are not a structured brick. Missing minutes are not redistributed beyond sport/session ceilings.` }];
    });
    return { week: index + 1, templateVersion: 'triathlon-foundation-v3',
      theme: index % 6 === 5 ? 'Recovery and response review' : quality ? 'Structured development · sport evidence and daily review required' : 'Aerobic practice and response review',
      periodizationFactor: factor, sessions, totalMinutes: sessions.reduce((sum, s) => sum + s.minutes, 0) };
  });
}
