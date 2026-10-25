// Personal briefings are local only. External education uses coach-text-provider.
interface Briefing {
  mode: "gemini" | "fallback";
  headline: string;
  briefing: string;
  adaptation: string;
  sources: string[];
}

export interface CoachContext {
  name: string;
  profile: any;
  zones: any;
  readiness: { score: number; advice: string } | null;
  latestMetric: any;
  todaySession: any | null;
  planName: string | null;
  bloodFlags: string[];
  dnaHighlights: string[];
  language?: string; // en | es | ht | fr | ru
  externalAiEligible?: boolean; // legacy compatibility only; never grants external processing
  historyDigest?: string; // long-term memory: check-in trend, weekly load, adherence, benchmarks
}

// Localized rule-based fallback briefings (used when Gemini is unavailable).
// "{title}" is replaced with the session title. Languages fall back to English.
const FALLBACK: Record<string, { green: string; amber: string; red: string; swap: string; trim: string; full: string; none: string }> = {
  en: {
    green: "Recovery markers look strong today. This is a day to take the planned key session by the horns — quality work compounds when you're fresh.",
    amber: "You're in the middle of the band — recovered enough to train, but not at full surplus. Keep the session's intent, trim the last rep or two if it bites.",
    red: "Readiness is suppressed. Today is about protecting the block: Z1 flush, mobility, and sleep. The hard work keeps for tomorrow.",
    swap: 'Swap "{title}" for a 30-min Z1 spin + 15-min mobility flow.',
    trim: 'Run "{title}" but extend the warm-up 10 min and drop the final interval set if RPE climbs early.',
    full: 'Full plan for "{title}" — chase the quality.',
    none: "No session is prescribed for today. Review your plan with your coach before adding training; keep any planned rest day.",
  },
  es: {
    green: "Tus marcadores de recuperación se ven fuertes hoy. Es día de tomar la sesión clave con ganas — el trabajo de calidad se acumula cuando estás fresco.",
    amber: "Estás en el punto medio — recuperado para entrenar, pero sin excedente. Mantén la intención de la sesión y quita la última repetición si cuesta.",
    red: "La lectura está baja. Hoy toca proteger el bloque: trote Z1, movilidad y sueño. El trabajo duro espera hasta mañana.",
    swap: 'Cambia "{title}" por 30 min de Z1 + 15 min de movilidad.',
    trim: 'Haz "{title}" pero alarga el calentamiento 10 min y quita la última serie si el esfuerzo sube pronto.',
    full: 'Plan completo para "{title}" — busca la calidad.',
    none: "Hoy no hay una sesión prescrita. Revisa el plan con tu entrenador antes de añadir entrenamiento; respeta cualquier día de descanso planificado.",
  },
  ht: {
    green: "Marco rekiperasyon yo byen jodi a. Se yon jou pou pran séans kle a tout kouraj — travay kalite a kwanze lè ou fre.",
    amber: "Ou nan mitan an — ou ka antrene, men san sipli. Kenbe entansyon séans lan, retire dènye repete a si li twò di.",
    red: "Nivo a ba. Jodi a se pou pwoteje blòk la: Z1, mobilite ak dòmi. Travay di a tann demen.",
    swap: 'Chanje "{title}" pou 30 minit Z1 + 15 minit mobilite.',
    trim: 'Fè "{title}" men alonge chofa a 10 minit epi retire dènye seri a si efò a monte twò vit.',
    full: 'Plan konplè pou "{title}" — chache kalite a.',
    none: "Pa gen séans preskri pou jodi a. Revize plan an ak antrenè ou anvan ou ajoute antrennman; respekte nenpòt jou repo ki planifye.",
  },
  fr: {
    green: "Tes marqueurs de récupération sont forts aujourd'hui. C'est le jour d'attaquer la séance clé — le travail de qualité se cumule quand tu es frais.",
    amber: "Tu es dans la zone médiane — assez récupéré pour t'entraîner, sans surplus. Garde l'intention de la séance, retire la dernière répétition si ça mord.",
    red: "Ton niveau est bas. Aujourd'hui, on protège le bloc : Z1, mobilité et sommeil. Le travail dur attend demain.",
    swap: 'Remplace "{title}" par 30 min de Z1 + 15 min de mobilité.',
    trim: "Fais \"{title}\" mais allonge l'échauffement de 10 min et retire la dernière série si l'effort monte trop tôt.",
    full: 'Plan complet pour "{title}" — va chercher la qualité.',
    none: "Aucune séance n’est prescrite aujourd’hui. Vérifie le plan avec ton entraîneur avant d’ajouter un entraînement ; respecte tout jour de repos prévu.",
  },
  ru: {
    green: "Показатели восстановления сегодня сильные. День, чтобы взять ключевую тренировку с полной отдачей — качественная работа накапливается, когда вы свежи.",
    amber: "Вы в середине диапазона — восстановились достаточно для тренировки, но без запаса. Сохраните замысел тренировки, уберите последний повтор, если тяжело.",
    red: "Показатели снижены. Сегодня важнее сохранить блок: Z1, мобильность и сон. Тяжёлая работа подождёт до завтра.",
    swap: "Замените «{title}» на 30 мин Z1 + 15 мин мобильности.",
    trim: "Выполните «{title}», но удлините разминку на 10 мин и уберите последний интервал, если нагрузка растёт слишком рано.",
    full: "Полный план на «{title}» — работайте над качеством.",
    none: "На сегодня тренировка не назначена. Обсудите план с тренером, прежде чем добавлять нагрузку; соблюдайте запланированный день отдыха.",
  },
};

export function fallbackBriefing(c: CoachContext): Briefing {
  if (c.profile?.injured) return { mode: "fallback", headline: "RECOVERY REVIEW", briefing: "The injury flag is active. Training is paused pending a recovery review.", adaptation: "Use the current rest prescription and review symptoms with your clinician or coach.", sources: [] };
  const assigned = c.todaySession?.prescription;
  if (assigned) {
    try {
      const p = typeof assigned === "string" ? JSON.parse(assigned) : assigned;
      return { mode: "fallback", headline: `${String(p.verdict || "planned").toUpperCase()} · ${p.title}`, briefing: "Your saved prescription is the current training instruction. Complete today's check-in before starting.", adaptation: p.detail?.main || "Review the session in Today.", sources: p.sources || [] };
    } catch {}
  }
  // Readiness alone must never create a session on an unprescribed day.
  if (!c.todaySession) {
    const message = (FALLBACK[c.language || "en"] || FALLBACK.en).none;
    return { mode: "fallback", headline: "CHECK PLAN", briefing: message, adaptation: message, sources: [] };
  }
  if (!c.readiness) return { mode: "fallback", headline: "CHECK IN", briefing: "Current recovery data is insufficient for a readiness judgment.", adaptation: c.todaySession ? `Review “${c.todaySession.title}” and complete today's check-in; the plan has not been increased.` : "No session is prescribed. Review your plan or take the planned rest day.", sources: [] };
  const L = FALLBACK[c.language || "en"] || FALLBACK.en;
  const r = c.readiness?.score ?? 60;
  const state = r >= 75 ? "GREEN" : r >= 55 ? "AMBER" : "RED";
  const headline = `${state} DAY`;
  const briefing = state === "GREEN" ? L.green : state === "AMBER" ? L.amber : L.red;

  let adaptation: string;
  if (c.todaySession) {
    const t = c.todaySession.title;
    adaptation = state === "RED" ? L.swap.replace("{title}", t) : state === "AMBER" ? L.trim.replace("{title}", t) : L.full.replace("{title}", t);
  } else {
    adaptation = L.none;
  }
  return { mode: "fallback", headline, briefing, adaptation, sources: ["HRV: Buchheit 2014", "Polarized: Seiler 2009"] };
}

/** The legacy eligibility flag cannot authorize mixed-source personal context.
 * No external dispatch or legacy briefing cache exists at this boundary. */
export function getCoachBriefing(_userId: string, c: CoachContext): Briefing {
  return fallbackBriefing(c);
}
