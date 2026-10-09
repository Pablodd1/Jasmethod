// Only this authored, public safety instruction may flow from a generated step
// into message/calendar summaries. Never export arbitrary free-text step notes.
export const CYCLE_MOVEMENT_GUIDANCE = "Practice only familiar coach-reviewed movements or stations, with comfortable effort and full recovery inside this time budget. If technique, equipment or tolerable load is unknown, skip the loaded work and ask for review. No fixed load, repetitions, race distance or explosive movements are assigned.";
const SPANISH_GUIDANCE = "Practica solo movimientos o estaciones conocidos y revisados por un entrenador, con esfuerzo cómodo y recuperación completa dentro de este tiempo. Si desconoces la técnica, el equipo o la carga tolerable, omite el trabajo con carga y pide una revisión. No se asignan cargas, repeticiones, distancias de competición ni movimientos explosivos fijos.";
export function trustedCycleMovementGuidance(step: { phase?: string; note?: string }, language = "en"): string {
  return step.phase === "active" && step.note === CYCLE_MOVEMENT_GUIDANCE ? language === "es" ? SPANISH_GUIDANCE : CYCLE_MOVEMENT_GUIDANCE : "";
}
