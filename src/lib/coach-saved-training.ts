import type { CoachReply, CoachReplyContext } from "./coach-conversation";
import { resolveCheckinSafety } from "./checkin-safety";
import { endpointText } from "./universal-workout-card";

/** Read-only navigation and saved-plan context, never a training clearance. */
export function savedTrainingReply(message: string, context: CoachReplyContext): CoachReply | null {
  // Narrow read-only aliases for common phone typing/dictation. Do not repair
  // numbers, dates, symptoms or mutation commands into permission to change data.
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’‘]/g, "'")
    .replace(/\b(?:explin|explan|explainn)\b/g, 'explain').replace(/\btodays\b/g, "today's");
  const subject = /\b(?:my|today'?s|this|mi|mis|hoy|este)\s+(?:saved\s+)?(?:training|trainings|workouts?|sessions?|plan|entrenamientos?|sesion|sesiones)\b|\b(?:training|workout|session|entrenamiento|sesion) (?:for )?today\b|\b(?:entrenamiento|sesion) de hoy\b/.test(text);
  const readIntent = /\b(?:show|see|view|find|where|explain|help|guidance|what|won't load|doesn't load|not loading|can't see|cannot see|ver|muestra|muestrame|donde|explica|ayuda|orientacion|que|no carga|no veo)\b/.test(text);
  // Queries about other days, history and changes retain their own handlers.
  if (!subject || !readIntent || /\b(?:yesterday|tomorrow|last|next|history|ayer|manana|ultimo|proximo|historial|change|set|shorten|reduce|extend|edit|save|log|record|cambia|cambiar|ajusta|ajustar|guarda|guardar|registra)\b/.test(text)) return null;
  if (/\b(?:if|example|quote|hypothetical|ejemplo|hipotetic[oa])\b/.test(text) || /["“”]/.test(message)) return null;
  // Detailed metric, progress, recovery and goal questions retain their richer
  // handlers instead of being reduced to a navigation-only session list.
  if (/\b(?:j ?metrics|jstress|j ?base|j ?recent|j ?balance|progress|performance|biometrics|readings|hrv|resting|sleep|recovery|rest|goal|target|availability|progreso|rendimiento|datos|lecturas|vfc|sueno|recuperacion|descanso|objetivo|meta|disponibilidad)\b/.test(text)) return null;

  const es = context.language === "es";
  const sessions = (context.savedTodaySessions ?? []).filter(session => session.date === context.localToday);
  const lines = sessions.map(session => {
    const title = session.title.replace(/\s+/g, " ").trim().slice(0, 200);
    const duration = Number.isFinite(session.durationMin) && session.durationMin >= 0 ? endpointText({ endpoint: { type: "time", seconds: session.durationMin * 60 } }, es ? "es" : "en") : es ? "duración desconocida" : "duration unknown";
    return `• ${title || session.sport}: ${duration}${session.completed ? (es ? " (marcada como completada)" : " (marked completed)") : ""}`;
  });
  const checkin = context.checkin?.observedDate === context.localToday ? context.checkin : null;
  const missingCheckin = resolveCheckinSafety(checkin).status === "unknown";
  const answer = es
    ? `${lines.length ? `Estas son tus sesiones guardadas para hoy (${context.localToday}):\n${lines.join("\n")}\n\nSon duraciones planificadas, no minutos realizados ni autorización para entrenar.` : `No encuentro una sesión planificada guardada para hoy (${context.localToday}). Eso no significa que tu ciclo o historial se hayan borrado.`} ${missingCheckin ? "El check-in de seguridad de hoy está incompleto; las instrucciones ejecutables siguen en espera y el plan guardado se conserva. " : ""}Abre /training para ver el ciclo guardado y los detalles de cada sesión. Revisa /checkin y después /today para ver las instrucciones y restricciones actuales. No he cambiado tu plan.`
    : `${lines.length ? `Here are your saved sessions for today (${context.localToday}):\n${lines.join("\n")}\n\nThese are planned durations, not completed minutes or permission to train.` : `I don't see a saved planned session for today (${context.localToday}). That does not mean your cycle or history has been deleted.`} ${missingCheckin ? "Today's safety check-in is incomplete; executable instructions remain on hold and the saved plan is preserved. " : ""}Open /training to see your saved cycle and each session's details. Review /checkin, then /today for current instructions and restrictions. I have not changed your plan.`;
  return { answer, ruleId: "coach-conversation-v1:saved-training-navigation" };
}
