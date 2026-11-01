/** Presentation routing only. Never authorizes data access, mutations or AI disclosure. */
export function opensTodayWorkout(message: string): boolean {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:yesterday|tomorrow|last week|next week|ayer|manana|semana pasada|proxima semana)\b/.test(text)) return false;
  return /\b(?:today|hoy)\b/.test(text) && /\b(?:workout|session|training|fuel|fueling|nutrition|eat|drink|entrenamiento|entrenar|sesion|nutricion|comer|beber|alimentacion|hidratacion)\b/.test(text);
}

/** Only opens the existing owner-scoped review UI. It never supplies record
 * contents to a model, selects a workout, or authorizes a write. Ambiguous and
 * general educational questions remain normal conversation. */
export function coachReviewArea(message: string): "profile" | "plan" | "race" | "session" | "history" | null {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:do not|don't|dont|no quiero|no abras|no revises)\b/.test(text)) return null;
  const review = /\b(?:review|show|open|check|update|edit|change|build|create|generate|revise|replace|revisa|revisar|muestra|muestrame|abre|abrir|actualiza|cambia|cambiar|crea|genera|quiero|prepara)\b/.test(text);
  if (!review) return null;
  if (/\b(?:my (?:training )?history|my past workouts|my recent workouts|mi historial|mis (?:entrenamientos|sesiones) (?:anteriores|recientes))\b/.test(text)) return "history";
  // A personal record review is different from a question about training science.
  if (/\b(?:profile|my (?:availability|schedule|goals?)|perfil|mi (?:disponibilidad|horario|objetivo))\b/.test(text)) return "profile";
  if (/\b(?:race|venue|competition|carrera objetivo|competicion|sede|mi carrera)\b/.test(text)) return "race";
  if (/\b(?:my plan|my cycle|training plan|training cycle|mi plan|mi ciclo|plan de entrenamiento|ciclo de entrenamiento)\b/.test(text)
    || /\b(?:build|create|generate|revise|replace|crea|genera|prepara)\b/.test(text) && /\b(?:plan|cycle|ciclo)\b/.test(text)) return "plan";
  if (/\b(?:my workout|my session|this workout|this session|mi entrenamiento|mi sesion|esta sesion)\b/.test(text)) return "session";
  return null;
}
