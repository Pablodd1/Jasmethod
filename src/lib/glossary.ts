// JasMiamiMethod — plain-language glossary.
// Legacy field keys remain compatible with stored records; display labels distinguish
// them from JMetrics. Historical references (not a current verification claim):
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
    abbr: "Legacy load",
    plain: {
      en: "Historical training-load value retained for continuity. Its source and estimation method may vary; it is not JStress or a measurement of biological stress.",
      es: "Carga histórica conservada para continuidad. Su fuente y método pueden variar; no es JStress ni una medición del estrés biológico.",
    },
  },
  ctl: {
    abbr: "Long-term load",
    plain: {
      en: "42-day exponentially weighted legacy load estimate. It describes recorded training, not measured fitness, and cannot be compared numerically with J Base.",
      es: "Estimación de carga histórica con ponderación exponencial de 42 días. Describe el entrenamiento registrado, no la condición física medida; no equivale a J Base.",
    },
  },
  atl: {
    abbr: "Recent load",
    plain: {
      en: "7-day exponentially weighted legacy load estimate. It describes recorded training, not measured fatigue, and is not J Recent.",
      es: "Estimación de carga histórica con ponderación exponencial de 7 días. Describe el entrenamiento registrado, no la fatiga medida; no es J Recent.",
    },
  },
  tsb: {
    abbr: "Load balance",
    plain: {
      en: "Long-term minus recent legacy load. A positive value does not establish recovery or race readiness; this is not J Balance.",
      es: "Carga histórica a largo plazo menos carga reciente. Un valor positivo no demuestra recuperación ni preparación para competir; no es J Balance.",
    },
  },
  pmc: {
    abbr: "Legacy load trends",
    plain: {
      en: "Long-term load, recent load and their difference over time, using historical data and estimates. Missing sessions limit interpretation.",
      es: "Carga a largo plazo, carga reciente y su diferencia, usando datos históricos y estimaciones. Las sesiones faltantes limitan su interpretación.",
    },
  },
  if: {
    abbr: "Legacy intensity estimate",
    plain: {
      en: "Historical threshold-relative intensity estimate. Check its source and threshold date; it is not reported session RPE.",
      es: "Estimación histórica de intensidad relativa al umbral. Revisa la fuente y fecha del umbral; no es el RPE reportado de la sesión.",
    },
  },
  np: {
    abbr: "Provider power metric",
    plain: {
      en: "Imported or legacy processed power value, in watts. Consult the source provider for its method; it is not JMM-original or JStress.",
      es: "Valor de potencia procesado, importado o histórico, en vatios. Consulta el método del proveedor; no es una métrica original de JMM ni JStress.",
    },
  },
  jstress: {
    abbr: "JStress",
    plain: {
      en: "Completed minutes × reported session RPE (0–10), in arbitrary units. Missing duration or RPE means unknown, not zero. This session-RPE method is not a new JMM scientific discovery.",
      es: "Minutos completados × RPE reportado de la sesión (0–10), en unidades arbitrarias. Sin duración o RPE, el valor es desconocido, no cero. El método sesión-RPE no es un nuevo descubrimiento de JMM.",
    },
  },
  jrecent: {
    abbr: "J Recent",
    plain: {
      en: "7-day exponential average of daily JStress, available after 7 consecutive known days. Gaps restart the series; unknown days are not rest. This is not a fatigue measurement.",
      es: "Promedio exponencial de JStress diario de 7 días, disponible tras 7 días conocidos consecutivos. Los vacíos reinician la serie; un día desconocido no es descanso. No mide fatiga.",
    },
  },
  jbase: {
    abbr: "J Base",
    plain: {
      en: "42-day exponential average of daily JStress, available after 42 consecutive known days. Check coverage and source; this describes recorded load, not measured fitness.",
      es: "Promedio exponencial de JStress diario de 42 días, disponible tras 42 días conocidos consecutivos. Revisa cobertura y fuente; describe carga registrada, no condición física medida.",
    },
  },
  jbalance: {
    abbr: "J Balance",
    plain: {
      en: "J Base minus J Recent, available only when both are known on the same JStress scale. Positive or negative values do not establish recovery, safety or race readiness.",
      es: "J Base menos J Recent, disponible solo si ambos son conocidos en la misma escala de JStress. Un valor positivo o negativo no demuestra recuperación, seguridad ni preparación competitiva.",
    },
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
      en: "HRV — variation between heartbeats. Compare the same measurement method with your own baseline alongside symptoms, sleep and training; it does not diagnose recovery or autonomic health.",
      es: "HRV — variación entre latidos. Compara el mismo método con tu referencia personal junto con síntomas, sueño y entrenamiento; no diagnostica recuperación ni salud autonómica.",
    },
  },
  rmssd: {
    abbr: "RMSSD",
    plain: {
      en: "RMSSD — one HRV measurement, in milliseconds. Devices can use different measures and sampling periods; do not treat SDNN and RMSSD as interchangeable.",
      es: "RMSSD — una medida de HRV, en milisegundos. Los dispositivos pueden usar medidas y períodos distintos; SDNN y RMSSD no son intercambiables.",
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
      en: "RPE — how hard something FEELS, from 0 (rest) to 10 (maximal effort). Your brain's effort gauge.",
      es: "RPE — qué tan duro SE SIENTE el esfuerzo, de 0 (reposo) a 10 (esfuerzo máximo). El medidor de esfuerzo de tu cerebro.",
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
      en: "CMJ — countermovement jump: a repeatable jump test for performance trends. Changes can reflect fatigue, technique or measurement variation; they do not diagnose nervous-system status.",
      es: "CMJ — salto con contramovimiento: prueba repetible para observar tendencias. Los cambios pueden reflejar fatiga, técnica o variación de medición; no diagnostican el estado del sistema nervioso.",
    },
  },
  sd: {
    abbr: "1 SD",
    plain: {
      en: "1 SD — one standard deviation, a measure of variation in your readings. Exceeding it alone does not prove a meaningful physiological change.",
      es: "1 SD — una desviación estándar, una medida de variación en tus lecturas. Superarla por sí sola no demuestra un cambio fisiológico relevante.",
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
    abbr: "AdvanzedRacing",
    plain: {
      en: "AdvanzedRacing — JasMiamiMethod's race-day prediction engine (a model estimate, not a guaranteed result): your current fitness + the course + the weather, in one number.",
      es: "AdvanzedRacing — el motor de predicción de carrera de JasMiamiMethod (una estimación del modelo, no un resultado garantizado): tu condición actual + el recorrido + el clima, en un solo número.",
    },
    source: "JasMiamiMethod",
  },
};

export function gloss(key: string, lang?: string): string {
  const g = GLOSSARY[key];
  if (!g) return key;
  const l = (lang || "en") as GlossLang;
  return g.plain[l] || g.plain.en || g.abbr;
}
