import { dateKey } from './dates';
export type DeliveryWorkoutPreview = { heading: string; summary: string; caution: string; checkinLabel: string };
/** Whitelisted schedule metadata only. A preview carries no executable steps,
 * targets, nutrition, health reasons, arbitrary title/notes or device claims. */
export function deliveryWorkoutPreview(workout: { planned?: boolean; completed?: boolean; feedbackStatus?: string | null; sport?: string; type?: string; durationMin?: number; startTime?: string | null },
 context: { dateLocal: string; timezone: string; verdict: string; language?: string }, now = new Date()): DeliveryWorkoutPreview | null {
 if (!workout.planned || workout.completed || workout.feedbackStatus || context.verdict === 'rest' || context.dateLocal !== dateKey(now, context.timezone) || typeof workout.durationMin !== 'number' || !Number.isInteger(workout.durationMin) || workout.durationMin < 1 || workout.durationMin > 1440) return null;
 const es=context.language==='es';
 const sports:Record<string,string>=es?{run:'Carrera',bike:'Ciclismo',swim:'Natación',strength:'Fuerza',mobility:'Movilidad',hyrox:'HYROX',brick:'Sesión combinada',recovery:'Recuperación'}:{run:'Run',bike:'Bike',swim:'Swim',strength:'Strength',mobility:'Mobility',hyrox:'HYROX',brick:'Brick',recovery:'Recovery'};
 const sport=sports[workout.sport||''];if(!sport)return null;
 const types:Record<string,string>=es?{endurance:'resistencia',recovery:'recuperación',interval:'intervalos',tempo:'tempo',threshold:'umbral',strength:'fuerza',skill:'técnica',speed:'velocidad',plyo:'pliometría',mobility:'movilidad',hyrox:'HYROX',race:'evento',test:'observación/prueba',volume:'volumen'}:{endurance:'endurance',recovery:'recovery',interval:'intervals',tempo:'tempo',threshold:'threshold',strength:'strength',skill:'skills',speed:'speed',plyo:'plyometrics',mobility:'mobility',hyrox:'HYROX',race:'event',test:'observation/test',volume:'volume'};
 const time=workout.startTime&&/^([01]\d|2[0-3]):[0-5]\d$/.test(workout.startTime)?` · ${workout.startTime} (${context.timezone})`:'';
 return {heading:es?'Vista previa del plan guardado — no autorizado para ejecutar':'Saved plan preview — not cleared to execute',
  summary:`${sport}${types[workout.type||'']?` · ${types[workout.type||'']}`:''} · ${es?'duración prevista':'planned duration'} ${workout.durationMin} min${time}`,
  caution:es?'Es el horario guardado, no el entrenamiento autorizado de hoy. El check-in y la revisión pueden cambiarlo o sustituirlo. No contiene objetivos ejecutables ni archivo FIT.':'This is the saved schedule, not today’s cleared prescription. Check-in and review may change or replace it. No executable targets or FIT file are included.',
  checkinLabel:es?'Abre el check-in privado: sueño, energía, molestias, estrés, síntomas y tiempo disponible. Revisa y aprueba el entrenamiento actualizado antes de empezar.':'Open your private daily check-in: sleep, energy, soreness, stress, symptoms and available time. Review and approve the updated workout before starting.'};
}
