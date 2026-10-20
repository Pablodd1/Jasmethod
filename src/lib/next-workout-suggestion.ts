import type { StreamAnalysis } from "./stream-analysis";
import type { IntervalPatch, SetSummary } from "./workout-interval-edit";

/**
 * "What should the NEXT workout look like, given how this one went?" — as a deterministic proposal, never an edit.
 *
 * The output is an `IntervalPatch` that the athlete previews and confirms through the normal interval-edit flow
 * (preview → approve → clears approval → re-approve before anything is exported or sent). This module cannot write
 * anything. Direction rule: a REDUCTION is proposed on evidence of struggle; a PROGRESSION is proposed only on
 * positive evidence and always `requiresConfirmation`; missing evidence yields `none`, never a guess.
 *
 * These thresholds are JMM coaching heuristics (documented in docs/smart-coach-pilot.md), not validated
 * prescriptions: decoupling ≥ 5% is the common rule-of-thumb flag for aerobic drift, and "fade" is the drop in
 * average output from the first to the last detected hard effort. The owner/coach should sign off on them.
 */
export interface Localized { en: string; es: string }
export interface NextWorkoutInput {
  analysis: StreamAnalysis;
  /** The set that was planned for the completed session, when it is known. */
  plannedSet?: SetSummary | null;
  /** The upcoming planned session's set; null when it is not an interval set. */
  nextSet: SetSummary | null;
}
export type SuggestionKind = "reduce" | "hold" | "progress" | "none";
export interface NextWorkoutSuggestion {
  kind: SuggestionKind;
  patch?: IntervalPatch;
  requiresConfirmation: boolean;
  reasons: Localized[];
  evidence: { decouplingPct: number | null; fadePct: number | null; hardEfforts: number; plannedRepeats: number | null };
}

export const THRESHOLDS = { decouplingHold: 5, decouplingReduce: 8, fadeHold: 4, fadeReduce: 8, fadeProgressMax: 3, minEffortsForFade: 3 } as const;

export function fadePercent(efforts: StreamAnalysis["efforts"]): number | null {
  if (efforts.length < THRESHOLDS.minEffortsForFade) return null;
  const channel = efforts[0].channel;
  if (efforts.some(e => e.channel !== channel)) return null;
  const first = efforts[0].avg, last = efforts[efforts.length - 1].avg;
  return first > 0 ? Math.round(((first - last) / first) * 1000) / 10 : null;
}

export function suggestNextWorkout(input: NextWorkoutInput): NextWorkoutSuggestion {
  const { analysis, plannedSet, nextSet } = input;
  const decoupling = analysis.decoupling?.percent ?? null;
  const fade = fadePercent(analysis.efforts);
  const efforts = analysis.efforts.length;
  const planned = plannedSet?.repeats ?? null;
  const evidence = { decouplingPct: decoupling, fadePct: fade, hardEfforts: efforts, plannedRepeats: planned };
  const none = (en: string, es: string): NextWorkoutSuggestion => ({ kind: "none", requiresConfirmation: false, reasons: [{ en, es }], evidence });

  if (!nextSet) return none("The next session is not an interval set, so there is nothing to adjust from this analysis.", "La próxima sesión no es una serie de intervalos, así que no hay nada que ajustar con este análisis.");
  if (decoupling === null && fade === null && (planned === null || efforts === 0)) return none("Not enough evidence in this activity to adjust the next session.", "No hay evidencia suficiente en esta actividad para ajustar la próxima sesión.");

  const reasons: Localized[] = [];
  const reduce: Localized[] = [];
  if (decoupling !== null && decoupling >= THRESHOLDS.decouplingReduce) reduce.push({ en: `Aerobic decoupling was ${decoupling}% (≥ ${THRESHOLDS.decouplingReduce}%).`, es: `El desacople aeróbico fue ${decoupling}% (≥ ${THRESHOLDS.decouplingReduce}%).` });
  if (fade !== null && fade >= THRESHOLDS.fadeReduce) reduce.push({ en: `Output faded ${fade}% from the first to the last hard effort.`, es: `La potencia/FC bajó ${fade}% del primer al último esfuerzo duro.` });
  if (planned !== null && efforts <= planned - 2) reduce.push({ en: `Only ${efforts} of ${planned} planned hard efforts were detected.`, es: `Solo se detectaron ${efforts} de ${planned} esfuerzos duros planificados.` });
  if (reduce.length) {
    if (nextSet.repeats <= 1) return { kind: "hold", requiresConfirmation: false, reasons: [...reduce, { en: "The next session already has a single hard effort; keep it as planned and watch how you feel.", es: "La próxima sesión ya tiene un solo esfuerzo duro; mantenla como está y observa cómo te sientes." }], evidence };
    return { kind: "reduce", patch: { repeatsDelta: -1 }, requiresConfirmation: false, reasons: [...reduce, { en: "Suggestion: one fewer repeat next time.", es: "Sugerencia: una repetición menos la próxima vez." }], evidence };
  }

  const hold: Localized[] = [];
  if (decoupling !== null && decoupling >= THRESHOLDS.decouplingHold) hold.push({ en: `Aerobic decoupling was ${decoupling}% (≥ ${THRESHOLDS.decouplingHold}%).`, es: `El desacople aeróbico fue ${decoupling}% (≥ ${THRESHOLDS.decouplingHold}%).` });
  if (fade !== null && fade >= THRESHOLDS.fadeHold) hold.push({ en: `Output faded ${fade}% across the hard efforts.`, es: `La potencia/FC bajó ${fade}% entre los esfuerzos duros.` });
  if (planned !== null && efforts === planned - 1) hold.push({ en: `${efforts} of ${planned} planned hard efforts were detected.`, es: `Se detectaron ${efforts} de ${planned} esfuerzos duros planificados.` });
  if (hold.length) return { kind: "hold", requiresConfirmation: false, reasons: [...hold, { en: "Suggestion: repeat the next session as planned; don't add load yet.", es: "Sugerencia: repite la próxima sesión como está; aún no agregues carga." }], evidence };

  // Positive evidence required for any increase.
  const complete = planned !== null && efforts >= planned;
  const steady = fade !== null && fade < THRESHOLDS.fadeProgressMax;
  const driftOk = decoupling === null || decoupling < THRESHOLDS.decouplingHold;
  if (complete && steady && driftOk) {
    reasons.push({ en: `All ${planned} planned hard efforts were completed with only ${fade}% fade.`, es: `Se completaron los ${planned} esfuerzos duros planificados con solo ${fade}% de caída.` });
    if (decoupling !== null) reasons.push({ en: `Aerobic decoupling stayed at ${decoupling}%.`, es: `El desacople aeróbico se mantuvo en ${decoupling}%.` });
    reasons.push({ en: "Suggestion: one more repeat next time. This raises load, so it needs your explicit confirmation.", es: "Sugerencia: una repetición más la próxima vez. Esto sube la carga, así que necesita tu confirmación explícita." });
    return { kind: "progress", patch: { repeatsDelta: 1 }, requiresConfirmation: true, reasons, evidence };
  }
  return none("Not enough evidence to change the next session.", "No hay evidencia suficiente para cambiar la próxima sesión.");
}
