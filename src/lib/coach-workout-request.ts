import type { TodayWorkoutRequest } from "./coach-review-intent";
import type { CoachReply, CoachReplyContext } from "./coach-conversation";

/** This reply may persist in chat. Never copy private titles, dates, targets or metrics into it. */
export function workoutRequestReply(request: TodayWorkoutRequest, context: CoachReplyContext, performedToday: boolean): CoachReply {
  const es = context.language === "es";
  const answer = (suffix: string, en: string, spanish: string) => ({ ruleId: "coach-conversation-v1:workout-request-" + suffix, answer: es ? spanish : en });
  const sport = { bike: ["bike", "ciclismo"], run: ["run", "carrera"], swim: ["swim", "natación"], brick: ["triathlon brick", "transición de triatlón"], hyrox: ["HYROX", "HYROX"], strength: ["strength", "fuerza"] }[request.sport];
  const recovery = context.recovery;
  if (recovery?.mode === "hold") return answer("hold", "Training is on hold. Review the restriction before deciding whether to train. I haven't changed your plan.", "El entrenamiento sigue en pausa. Revisa la restricción antes de decidir si entrenar. No he cambiado tu plan.");
  if (recovery?.mode === "planned-rest" || recovery?.mode === "event-day") return answer("reserved", "Keep today's reserved rest or event plan. I won't add or swap in a workout over it. Nothing has changed.", "Respeta el descanso o evento reservado para hoy. No añadiré ni sustituiré ese plan. No he cambiado nada.");
  const en = "You're asking for a " + sport[0] + " workout" + (request.minutes === null ? "." : " within " + request.minutes + " minutes.");
  const sp = "Buscas una sesión de " + sport[1] + (request.minutes === null ? "." : " de hasta " + request.minutes + " minutos.");
  const timeEn = request.minutes === null ? " How many minutes do you have?" : "";
  const timeEs = request.minutes === null ? " ¿Cuántos minutos tienes?" : "";
  const matching = context.approvedSession?.sport === request.sport;
  if (matching && recovery?.safetyStatus === "clear" && !recovery.recoveryNeedsReview && !performedToday && request.minutes !== null && (context.approvedSession?.durationMin ?? Infinity) <= request.minutes) {
    return answer("review", en + " Open the matching session in the private Today card below to review the structured steps and targets. No workout was changed.", sp + " Abre la sesión correspondiente en la tarjeta privada de Hoy para ver los pasos y objetivos. No he cambiado la sesión.");
  }
  if (!recovery || recovery.safetyStatus !== "clear" || recovery.recoveryNeedsReview || recovery.mode === "review-needed") {
    return answer("checkin", en + " Review today's check-in before I recommend a session. If Today already has a plan, the card below lets you review it without changing it." + timeEn, sp + " Revisa el check-in de hoy antes de que recomiende una sesión. Si ya hay un plan, puedes revisarlo en la tarjeta de abajo sin cambiarlo." + timeEs);
  }
  return answer("plan", en + " Use the private Today card to review the current plan. If there's no matching session or it doesn't fit, review a shorter session or a swap with your coach rather than adding another workout or increasing intensity." + timeEn + " Nothing has been changed.", sp + " Usa la tarjeta privada de Hoy para revisar el plan actual. Si no hay una sesión adecuada o no cabe en tu horario, revisa una opción más corta o un cambio con tu entrenador en lugar de sumar una sesión o subir la intensidad." + timeEs + " No he cambiado nada.");
}
