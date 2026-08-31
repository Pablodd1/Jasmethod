// JasMiamiMethod — plain-language glossary.
// Terminology is aligned with what athletes already know from the industry
// standard platforms (verified against the official sources, Aug 2026):
//   • TrainingPeaks glossary: TSS, CTL (= Fitness, 42-day), ATL (= Fatigue, 7-day),
//     TSB (= Form, CTL−ATL), IF, NP — trainingpeaks.com/learn/articles/glossary-of-trainingpeaks-metrics
//   • TriDot: FitLogic (engine), TrainX (training execution score), RaceX (race prediction)
// `plain` is the one sentence anybody can understand — used by <Term/> tooltips
// and inline hint lines. Languages fall back to English (like i18n.ts).

export type GlossLang = "en" | "es" | "ht" | "fr" | "ru";

export interface GlossaryEntry {
  abbr: string; // what appears on screen
  plain: Partial<Record<GlossLang, string>>; // one plain sentence (falls back to en)
  source?: string; // where the standard term comes from
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  ftp: {
    abbr: "FTP",
    plain: {
      en: "FTP — Functional Threshold Power: the watts you could hold for about one hour. Your bike zones and targets are built from it.",
      es: "FTP — la potencia (vatios) que podrías sostener cerca de una hora. De ahí salen tus zonas y objetivos de ciclismo.",
    },
    source: "TrainingPeaks / Allen & Coggan",
  },
  tss: {
    abbr: "TSS",
    plain: {
      en: "TSS — Training Stress Score: one number for how hard a session was (duration × intensity). The industry standard from TrainingPeaks.",
      es: "TSS — puntuación de estrés de entrenamiento: un número que resume qué tan dura fue la sesión (tiempo × intensidad). El estándar de TrainingPeaks.",
    },
    source: "TrainingPeaks",
  },
  ctl: {
    abbr: "CTL",
    plain: {
      en: "CTL = Fitness — your average daily training load over the last ~6 weeks (42 days). It grows slowly and only with consistency.",
      es: "CTL = forma física — tu carga promedio de las últimas ~6 semanas (42 días). Crece despacio y solo con constancia.",
    },
    source: "TrainingPeaks",
  },
  atl: {
    abbr: "ATL",
    plain: {
      en: "ATL = Fatigue — your training load over the last 7 days. Rises fast after hard days; fades in a few easy ones.",
      es: "ATL = fatiga — tu carga de los últimos 7 días. Sube rápido con días duros y baja con días fáciles.",
    },
    source: "TrainingPeaks",
  },
  tsb: {
    abbr: "TSB",
    plain: {
      en: "TSB = Form — Fitness minus Fatigue. Positive = fresh (race-ready). Negative = normal tiredness mid-training; race week you want it near zero.",
      es: "TSB = forma del día — forma física menos fatiga. Positivo = fresco (listo para competir). Negativo = cansancio normal a mitad del bloque.",
    },
    source: "TrainingPeaks",
  },
  pmc: {
    abbr: "PMC",
    plain: {
      en: "PMC — Performance Management Chart: the Fitness / Fatigue / Form curve over time, the standard chart from TrainingPeaks.",
      es: "PMC — gráfico de gestión del rendimiento: la curva de forma física / fatiga / forma del día a lo largo del tiempo (estándar de TrainingPeaks).",
    },
    source: "TrainingPeaks",
  },
  if: {
    abbr: "IF",
    plain: {
      en: "IF — Intensity Factor: how hard a session was relative to your threshold (1.0 = a full hour at threshold effort).",
      es: "IF — factor de intensidad: qué tan dura fue la sesión frente a tu umbral (1.0 = una hora completa a esfuerzo de umbral).",
    },
    source: "TrainingPeaks",
  },
  np: {
    abbr: "NP",
    plain: {
      en: "NP — Normalized Power: the power your body felt like it produced, weighting hard surges more than easy coasting.",
      es: "NP — potencia normalizada: la potencia que tu cuerpo percibió, dando más peso a los arranques duros que al pedaleo suave.",
    },
    source: "TrainingPeaks",
  },
  lthr: {
    abbr: "LTHR",
    plain: {
      en: "LTHR — the heart rate you could hold for a hard one-hour effort. Your run and bike HR zones are anchored to it.",
      es: "LTHR — la frecuencia cardíaca que podrías sostener en un esfuerzo duro de una hora. De ahí se anclan tus zonas de carrera y bici.",
    },
  },
  hrv: {
    abbr: "HRV",
    plain: {
      en: "HRV — heart-rate variability: the tiny beat-to-beat variation your watch measures each morning. Above your baseline = recovered; clearly below = back off.",
      es: "HRV — variabilidad de la frecuencia cardíaca: la pequeña variación entre latidos que tu reloj mide cada mañana. Sobre tu promedio = recuperado; muy por debajo = mejor suave.",
    },
  },
  rmssd: {
    abbr: "RMSSD",
    plain: {
      en: "RMSSD — the standard morning HRV number (in milliseconds) reported by Whoop, Oura, Garmin and Apple Watch.",
      es: "RMSSD — el número estándar de HRV matutina (en milisegundos) que reportan Whoop, Oura, Garmin y Apple Watch.",
    },
  },
  vo2max: {
    abbr: "VO2max",
    plain: {
      en: "VO2max — how much oxygen your body can use per minute per kilo — the size of your aerobic engine.",
      es: "VO2max — cuánto oxígeno puede usar tu cuerpo por minuto y por kilo — el tamaño de tu motor aeróbico.",
    },
  },
  vdot: {
    abbr: "VDOT",
    plain: {
      en: "VDOT — your running fitness score, calculated from any recent race time; it sets your easy / threshold / interval paces.",
      es: "VDOT — tu puntaje de condición de carrera, calculado desde cualquier tiempo reciente de competencia; define tus ritmos fácil / umbral / intervalos.",
    },
  },
  css: {
    abbr: "CSS",
    plain: {
      en: "CSS — Critical Swim Speed: your swim threshold pace, from a 400 m + 200 m time test. Roughly your 1,500 m race pace.",
      es: "CSS — velocidad crítica de nado: tu ritmo umbral en natación, con una prueba de 400 m + 200 m. Casi tu ritmo de 1,500 m.",
    },
  },
  rpe: {
    abbr: "RPE",
    plain: {
      en: "RPE — how hard something FEELS, from 1 (couch) to 10 (all-out). Your brain's effort gauge.",
      es: "RPE — qué tan duro SE SIENTE el esfuerzo, de 1 (sofá) a 10 (al máximo). El medidor de esfuerzo de tu cerebro.",
    },
  },
  tpace: {
    abbr: "T-pace",
    plain: {
      en: "T-pace — your threshold pace: roughly the pace you could race for one hour.",
      es: "T-pace — tu ritmo umbral: aproximadamente el ritmo que podrías competir durante una hora.",
    },
  },
  tt30: {
    abbr: "30′ TT",
    plain: {
      en: "30′ TT — a 30-minute all-out time trial. The average heart rate of the last 20 minutes is your LTHR.",
      es: "30′ TT — una contrarreloj de 30 minutos al máximo. El ritmo cardíaco promedio de los últimos 20 minutos es tu LTHR.",
    },
  },
  zones: {
    abbr: "Z1–Z7",
    plain: {
      en: "Zones — effort levels built from YOUR tests: Z1 recovery, Z2 all-day pace, Z3 comfortably hard, Z4 threshold, Z5 VO2max, Z6–Z7 sprints.",
      es: "Zonas — niveles de esfuerzo basados en TUS pruebas: Z1 recuperación, Z2 ritmo de todo el día, Z3 cómodamente duro, Z4 umbral, Z5 VO2max, Z6–Z7 sprints.",
    },
  },
  en2en3: {
    abbr: "EN2/EN3",
    plain: {
      en: "EN2 / EN3 — swim endurance paces: EN2 = easy endurance swimming, EN3 = steady threshold swimming.",
      es: "EN2 / EN3 — ritmos de nado de resistencia: EN2 = nado fácil de resistencia, EN3 = nado firme al umbral.",
    },
  },
  cmj: {
    abbr: "CMJ",
    plain: {
      en: "CMJ — countermovement jump: a morning vertical-jump test that flags neuromuscular fatigue (a tired jump = a tired nervous system).",
      es: "CMJ — salto con contramovimiento: una prueba matutina de salto vertical que detecta fatiga neuromuscular (salto bajo = sistema nervioso cansado).",
    },
  },
  sd: {
    abbr: "1 SD",
    plain: {
      en: "1 SD — one 'normal day-to-day swing' in your own readings. Beyond that, it's a real signal, not noise.",
      es: "1 SD — una 'variación normal del día a día' en tus propias mediciones. Más que eso es señal real, no ruido.",
    },
  },
  trainx: {
    abbr: "TrainX",
    plain: {
      en: "TrainX (TriDot) — a score for how well you executed the training that was prescribed.",
      es: "TrainX (TriDot) — un puntaje de qué tan bien ejecutaste el entrenamiento recetado.",
    },
    source: "TriDot",
  },
  racex: {
    abbr: "RaceX",
    plain: {
      en: "RaceX (TriDot) — a race-day performance prediction from your current fitness and the course.",
      es: "RaceX (TriDot) — una predicción del día de carrera a partir de tu condición actual y el recorrido.",
    },
    source: "TriDot",
  },
};

export function gloss(key: string, lang?: string): string {
  const g = GLOSSARY[key];
  if (!g) return key;
  const l = (lang || "en") as GlossLang;
  return g.plain[l] || g.plain.en || g.abbr;
}
