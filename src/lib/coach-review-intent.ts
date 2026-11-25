export type TodayWorkoutRequest = { sport: "bike" | "run" | "swim" | "brick" | "hyrox" | "strength"; minutes: number | null };

/** Read-only review intent. A stated time is a ceiling, not a prescription or an edit. */
export function todayWorkoutRequest(message: string): TodayWorkoutRequest | null {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’‘]/g, "'").toLowerCase().trim();
  if (!/^(?:please\s+)?(?:i (?:need|want|would like)|(?:can|could|would) you (?:give|suggest)|give me|suggest|necesito|quiero|dame|sugiere|podrias (?:darme|sugerir))\b/.test(text)) return null;
  if (/[“”"«»]/.test(text) || /\b(?:not|don't|never|hypothetical|example|what if|if i|yesterday|tomorrow|next|last|ayer|manana|proxim[oa]|pasad[oa]|weekly|semana|edit|replace|change|save|log|completed|cambia|cambiar|guarda|registra)\b|\b\d{4}-\d{2}-\d{2}\b/.test(text)) return null;
  if (!/\b(?:workouts?|sessions?|entrenamiento|sesion|ride|brick|correr|nadar)\b/.test(text)) return null;
  const sports = ([
    ["bike", /\b(?:bike|biking|cycling|ride|bici|bicicleta|ciclismo|rodillo)\b/],
    ["run", /\b(?:run|running|correr|carrera|trote)\b/],
    ["swim", /\b(?:swim|swimming|nado|nadar|natacion)\b/],
    ["brick", /\b(?:brick|triathlon|triatlon)\b/],
    ["hyrox", /\bhyrox\b/],
    ["strength", /\b(?:strength|weights|pesas|fuerza)\b/],
  ] as const).filter(([, re]) => re.test(text));
  if (sports.length !== 1) return null;
  const numbers: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, un: 1, una: 1, dos: 2, half: .5, media: .5 };
  const durations = [...text.replace(/\bhalf an? (?=hour)/g, "half ").matchAll(/\b(\d+(?:[.,]\d+)?|one|two|an?|un|una|dos|half|media)\s*[- ]?\s*(minutes?|mins?|minutos?|min|hours?|hrs?|horas?|h)\b/g)]
    .map(([, n, unit]) => (numbers[n] ?? Number(n.replace(",", "."))) * (/^(?:hour|hr|hora|h$)/.test(unit) ? 60 : 1));
  const timeRange = /\b\d+(?:[.,]\d+)?\s*(?:or|and|to|o|y|a|[-–])\s*\d+(?:[.,]\d+)?\s*[- ]?\s*(?:minutes?|mins?|minutos?|min|hours?|hrs?|horas?|h)\b/.test(text);
  const minutes = !timeRange && durations.length === 1 && Number.isInteger(durations[0]) && durations[0] >= 1 && durations[0] <= 1440 ? durations[0] : null;
  return { sport: sports[0][0], minutes };
}

/** Presentation routing only. Never authorizes data access, mutations or AI disclosure. */
export function opensTodayWorkout(message: string): boolean {
  if (todayWorkoutRequest(message)) return true;
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:yesterday|tomorrow|last week|next week|ayer|manana|semana pasada|proxima semana)\b/.test(text)) return false;
  const daily = /\b(?:today|todays|hoy)\b|\btoday['’]s\b/.test(text);
  const sport = /\b(?:run|running|bike|cycling|swim|swimming|hyrox|correr|ciclismo|natacion)\b/.test(text);
  if (sport && daily && /\b(?:run|workout|session|plan|sesion|entrenamiento)\b/.test(text)) return true;
  if (sport && /\b(?:give me|suggest|dame|sugiere)\b.*\b(?:workout|session|entrenamiento|sesion)\b/.test(text)) return true;
  return daily && /\b(?:workout|session|training|fuel|fueling|nutrition|eat|drink|entrenamiento|entrenar|sesion|nutricion|comer|beber|alimentacion|hidratacion|few minutes|pocos minutos)\b/.test(text);
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

/** A private read, not a request to create or change a workout. */
export function opensRacePlan(message: string): boolean {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:do not|don.t|no quiero|no abras|no revises)\b/.test(text)) return false;
  if (/\b(?:my race (?:day )?(?:plan|strategy|prediction)|my race.day plan|mi plan de carrera|mi estrategia de carrera)\b/.test(text)) return true;
  return /\b(?:show|open|review|pull up|muestra|muestrame|abre|revisa)\b.*\b(?:race.day plan|race (?:plan|strategy)|plan de carrera|estrategia de carrera)\b/.test(text)
    || /\b(?:how should i (?:pace|race)|como (?:debo|puedo) (?:correr|dosificar))\b.*\b(?:my|next race|mi|carrera)\b/.test(text);
}
