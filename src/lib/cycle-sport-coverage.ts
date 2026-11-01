import {validCoachingMetadata} from './coaching-prescription';
/** Schedule coverage only. Presence does not establish sufficient frequency,
 * dose, technique, equipment, readiness or ability to finish the goal event. */
export const CYCLE_SPORT_COVERAGE_VERSION = 'cycle-sport-coverage-v1';
type RequiredComponent = { id: string; sports: readonly string[]; en: string; es: string };
export interface CoverageWeek {
  week: number;
  sessions: readonly { sport: string; minutes: number; coaching?: {legs?: readonly {sport:string;minutes:number}[]} }[];
  eventIds?: readonly string[];
  eventDays?: readonly string[];
  cycleFactor?: number;
  volumeDecision?: { protectedDates?: readonly string[] };
}
const swim: RequiredComponent = { id: 'swim', sports: ['swim'], en: 'swimming', es: 'natación' };
const bike: RequiredComponent = { id: 'bike', sports: ['bike'], en: 'cycling', es: 'ciclismo' };
const run: RequiredComponent = { id: 'run', sports: ['run'], en: 'running', es: 'carrera' };
function requiredComponents(goal: string): RequiredComponent[] {
  if (['sprint', 'olympic', 'half', 'full', 'custom'].includes(goal)) return [swim, bike, run];
  if (goal === 'cycle') return [bike];
  if (goal === 'swim-only') return [swim];
  if (['run-only', 'track-sprint', '5k', '10k', 'half-marathon', 'marathon'].includes(goal)) return [run];
  if (goal === 'hyrox') return [run, { id: 'station-practice', sports: ['strength', 'hyrox'], en: 'station or strength practice', es: 'práctica de estaciones o fuerza' }];
  throw new Error('Unsupported cycle coverage goal');
}

export function assessCycleSportCoverage(goal: string, weeks: readonly CoverageWeek[], beforeContextReductions: readonly CoverageWeek[] = []) {
  const required = requiredComponents(goal);
  // Explicit context wins. A protected/performed day, event preparation or an
  // additional recovery reduction must not be mistaken for failed scheduling.
  const snapshot = (week: CoverageWeek) => {
    const presentSports = [...new Set(week.sessions.filter(session => Number.isFinite(session.minutes) && session.minutes > 0).flatMap(session => {
      const legs=session.coaching?.legs;
      // A label is not evidence of both sports. Count only explicit complete
      // bike-to-run components within the session's duration budget.
      const validBrick=session.sport==='brick'&&legs?.length===2&&legs[0].sport==='bike'&&legs[1].sport==='run'
        &&legs.every(leg=>Number.isFinite(leg.minutes)&&leg.minutes>0)&&legs.reduce((n,leg)=>n+leg.minutes,0)<=session.minutes;
      const reviewedBrick=session.sport==='brick'&&session.minutes>=40&&validCoachingMetadata(session.coaching,'brick')&&session.coaching.recipe==='brick'&&session.minutes>=session.coaching.minimumMinutes;
      return validBrick?[session.sport,...legs.map(leg=>leg.sport)]:reviewedBrick?['brick','bike','run']:[session.sport];
    }))];
    return { week: week.week, presentSports, missingComponents: required.filter(component => !component.sports.some(sport => presentSports.includes(sport))).map(component => component.id) };
  };
  const constrained = (week: CoverageWeek) => (week.eventIds?.length ?? 0) > 0 || (week.eventDays?.length ?? 0) > 0
    || (week.volumeDecision?.protectedDates?.length ?? 0) > 0 || (week.cycleFactor !== undefined && week.cycleFactor < 1);
  // An irrelevant protected day does not invalidate actual remaining coverage.
  // When a component was removed, compare the original bounded schedule if
  // supplied. That can reveal a persistent availability failure without
  // reconstructing or making up a performed/event day's removed workout.
  const excluded = weeks.filter(week => constrained(week) && snapshot(week).missingComponents.length > 0);
  const excludedIds = new Set(excluded.map(week => week.week));
  const routine = weeks.filter(week => !excludedIds.has(week.week)).map(snapshot);
  const beforeByWeek = new Map(beforeContextReductions.map(week => [week.week, week]));
  const planningBasisWeeks = weeks.flatMap<{ week: number; presentSports: string[]; missingComponents: string[]; basis: 'remaining_schedule' | 'before_context_reductions' }>(week => {
    if (!constrained(week)) return [{ ...snapshot(week), basis: 'remaining_schedule' as const }];
    const before = beforeByWeek.get(week.week);
    if (before) return [{ ...snapshot(before), basis: 'before_context_reductions' as const }];
    return snapshot(week).missingComponents.length === 0 ? [{ ...snapshot(week), basis: 'remaining_schedule' as const }] : [];
  });
  const persistentMissingComponents = planningBasisWeeks.length ? required.filter(component => planningBasisWeeks.every(week => week.missingComponents.includes(component.id))).map(component => component.id) : [];
  const noCompleteBasisWeek=planningBasisWeeks.length>0&&planningBasisWeeks.every(week=>week.missingComponents.length>0);
  const incompleteWeeks = routine.filter(week => week.missingComponents.length).map(week => week.week);
  const status = persistentMissingComponents.length ? 'incomplete' as const : !routine.length ? 'unassessed' as const : incompleteWeeks.length ? 'incomplete' as const : 'covered' as const;
  const missing = required.filter(component => persistentMissingComponents.includes(component.id));
  const message = status === 'unassessed'
    ? 'All weeks are constrained by recorded activity, events or additional recovery reductions. Normal sport coverage cannot be assessed; this is not proof of a complete goal-specific cycle.'
    : noCompleteBasisWeek&&!missing.length
      ? 'The available schedule contains no complete week with all required goal components. Review available days and time or use an initial assessment; this cannot be saved as a complete goal-specific cycle.'
    : missing.length
      ? `The available schedule contains no ${missing.map(component => component.en).join(' or ')} in any unconstrained week. Review available days and time or obtain a coach-reviewed schedule. This cannot be saved as a complete ${goal} cycle. A separate initial assessment remains available; no missing work is invented.`
      : incompleteWeeks.length
        ? 'Some unconstrained weeks omit a goal component. Review the actual sport distribution before confirming; no minimum effective frequency or event readiness is established.'
        : 'Required goal components appear in every unconstrained week. This confirms schedule coverage only, not sufficient dose, readiness or expected performance.';
  const messageEs = status === 'unassessed'
    ? 'Todas las semanas están limitadas por actividad registrada, eventos o reducciones adicionales de recuperación. No se puede evaluar la distribución habitual por deporte; esto no demuestra un ciclo completo para el objetivo.'
    : noCompleteBasisWeek&&!missing.length
      ? 'El horario disponible no contiene ninguna semana con todos los componentes del objetivo. Revisa los días y el tiempo disponibles o usa una evaluación inicial; no puede guardarse como un ciclo completo.'
    : missing.length
      ? `El horario disponible no incluye ${missing.map(component => component.es).join(' ni ')} en ninguna semana sin restricciones. Revisa los días y el tiempo disponibles o solicita un horario revisado por un coach. No puede guardarse como un ciclo completo de ${goal}. La evaluación inicial sigue disponible por separado; no se inventa trabajo faltante.`
      : incompleteWeeks.length
        ? 'Algunas semanas sin restricciones omiten un componente del objetivo. Revisa la distribución real antes de confirmar; no se demuestra una frecuencia mínima eficaz ni preparación para el evento.'
        : 'Los componentes necesarios del objetivo aparecen en cada semana sin restricciones. Solo se confirma su presencia en el horario, no una dosis suficiente, preparación ni rendimiento esperado.';
  return { version: CYCLE_SPORT_COVERAGE_VERSION, goal, status,
    requiredComponents: required.map(component => ({ id: component.id, acceptedSports: [...component.sports], label: component.en, labelEs: component.es })),
    routineWeeks: routine.map(week => week.week), excludedWeeks: excluded.map(week => week.week), weeks: routine, planningBasisWeeks,
    persistentMissingComponents, incompleteWeeks, canSaveCompleteCycle: persistentMissingComponents.length === 0&&!noCompleteBasisWeek,
    message, messageEs };
}
