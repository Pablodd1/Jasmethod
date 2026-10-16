export type EducationalLanguage = "en" | "es";
export type ApprovedParagraph = { id: string; en: string; es: string };
// Trusted bilingual definitions for local answers and the optional DeepSeek
// context. Provider prose remains advisory and cannot overwrite this catalog.
export const educationalCatalog = {
  jmetrics: [
    {
      id: "jmetrics_definition",
      en: "JStress is completed session minutes multiplied by athlete-reported session RPE on a 0–10 scale, in arbitrary units. It uses the published session-RPE method. Missing duration or RPE means unknown, not zero. Imported legacy load scores cannot be substituted.",
      es: "JStress es minutos completados multiplicados por el RPE de sesión reportado por el atleta en una escala de 0–10, en unidades arbitrarias. Usa el método publicado de sesión-RPE. Sin duración o RPE, el valor es desconocido, no cero. No se sustituyen por cargas históricas importadas.",
    },
    {
      id: "jmetrics_limits",
      en: "J Recent and J Base summarize the same JStress scale with 7-day and 42-day exponential averages; they require 7 and 42 consecutive known days respectively. Gaps restart the series. J Balance is J Base minus J Recent. Check coverage and confirmed rest; these estimates do not diagnose recovery, injury risk or race readiness.",
      es: "J Recent y J Base resumen JStress con promedios exponenciales de 7 y 42 días; requieren 7 y 42 días conocidos consecutivos, respectivamente. Los vacíos reinician la serie. J Balance es J Base menos J Recent. Revisa cobertura y descanso confirmado; no diagnostican recuperación, riesgo de lesión ni preparación competitiva.",
    },
  ],
  rpe: [
    {
      id: "rpe_definition",
      en: "RPE means rating of perceived exertion: a subjective description of how demanding an effort feels.",
      es: "RPE significa valoración del esfuerzo percibido: una descripción subjetiva de lo exigente que se siente un esfuerzo.",
    },
    {
      id: "rpe_context",
      en: "Perceived exertion reflects an overall impression of effort. It is different from a direct measurement of speed, power or heart rate.",
      es: "El esfuerzo percibido refleja una impresión global del esfuerzo. Es distinto de una medición directa de velocidad, potencia o frecuencia cardíaca.",
    },
  ],
  endurance: [
    {
      id: "endurance_definition",
      en: "Endurance is the capacity to sustain an effort over time. Aerobic energy production uses oxygen and contributes to sustained activity.",
      es: "La resistencia es la capacidad de sostener un esfuerzo a lo largo del tiempo. La producción de energía aeróbica utiliza oxígeno y contribuye a la actividad sostenida.",
    },
    {
      id: "endurance_context",
      en: "Easy endurance describes lower-intensity aerobic activity. The word easy describes relative effort, rather than a single speed or workload that is identical for everyone.",
      es: "La resistencia a baja intensidad describe actividad aeróbica de menor intensidad. La palabra suave describe un esfuerzo relativo, no una velocidad o carga idéntica para todas las personas.",
    },
  ],
  polarized: [
    {
      id: "polarized_definition",
      en: "Polarized training describes an intensity distribution that emphasizes lower-intensity work, includes a smaller amount of higher-intensity work and limits work between those ends.",
      es: "El entrenamiento polarizado describe una distribución de intensidad que da mayor peso al trabajo de baja intensidad, incluye una parte menor de alta intensidad y limita el trabajo entre ambos extremos.",
    },
    {
      id: "polarized_context",
      en: "Polarization describes a pattern across a training program. The label alone does not specify an individual session or establish that a plan suits a particular athlete.",
      es: "La polarización describe un patrón dentro de un programa de entrenamiento. La etiqueta por sí sola no define una sesión individual ni establece que un plan sea adecuado para un atleta concreto.",
    },
  ],
  periodization: [
    {
      id: "periodization_definition",
      en: "Periodization is the planned variation of training focus and load across phases. It organizes how parts of a program relate over time.",
      es: "La periodización es la variación planificada del enfoque y la carga de entrenamiento entre fases. Organiza la relación entre las partes de un programa a lo largo del tiempo.",
    },
    {
      id: "periodization_context",
      en: "Different periodization models arrange training phases in different ways. A model is an organizational framework, not a prediction of an individual result.",
      es: "Los distintos modelos de periodización organizan las fases de entrenamiento de diferentes maneras. Un modelo es una estructura de organización, no una predicción de un resultado individual.",
    },
  ],
  recovery: [
    {
      id: "recovery_definition",
      en: "Recovery describes processes following physical effort through which the body restores function and responds to training load. It is part of the broader training process.",
      es: "La recuperación describe los procesos posteriores al esfuerzo físico mediante los que el cuerpo restablece funciones y responde a la carga de entrenamiento. Forma parte del proceso general de entrenamiento.",
    },
    {
      id: "recovery_context",
      en: "Sleep, nutrition, rest and non-training demands are relevant to discussions of recovery. A general description of recovery cannot establish an individual athlete's readiness.",
      es: "El sueño, la alimentación, el descanso y las exigencias ajenas al entrenamiento son relevantes al hablar de recuperación. Una descripción general de la recuperación no determina la disposición de un atleta concreto para entrenar.",
    },
  ],
  warmup: [
    {
      id: "warmup_definition",
      en: "A warm-up is the preparatory phase before a main activity. It typically involves a gradual transition from rest toward the demands of that activity.",
      es: "El calentamiento es la fase preparatoria antes de una actividad principal. Suele incluir una transición gradual desde el reposo hacia las exigencias de esa actividad.",
    },
    {
      id: "warmup_context",
      en: "Warm-ups can include general movement and activity-specific preparation. Their structure varies with the activity and context; the term does not define a universal routine.",
      es: "Los calentamientos pueden incluir movimiento general y preparación específica para la actividad. Su estructura varía según la actividad y el contexto; el término no define una rutina universal.",
    },
  ],
  technique: [
    {
      id: "technique_definition",
      en: "Technique describes how movements are coordinated to perform a skill. It includes elements such as timing, positioning and the sequence of movements.",
      es: "La técnica describe cómo se coordinan los movimientos para realizar una habilidad. Incluye elementos como la sincronización, la posición y la secuencia de movimientos.",
    },
    {
      id: "technique_context",
      en: "Technique is specific to the task and its context. A general explanation cannot evaluate a particular athlete's movement or replace direct observation.",
      es: "La técnica depende de la tarea y de su contexto. Una explicación general no permite evaluar el movimiento de un atleta concreto ni sustituir la observación directa.",
    },
  ],
} as const satisfies Record<string, readonly ApprovedParagraph[]>;
export type EducationalTopic = keyof typeof educationalCatalog;
export type EducationalSelection = { topic: EducationalTopic; paragraphIds: string[] } | { topic: "unsupported"; paragraphIds: [] };

const normalizeQuestion = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const topicPatterns: Array<[EducationalTopic, RegExp]> = [
  ["jmetrics", /\b(?:j ?metrics|jstress|j ?base|j ?recent|j ?balance)\b/],
  ["rpe", /\b(?:rpe|perceived exertion|esfuerzo percibido)\b/],
  ["polarized", /\b(?:polari[sz]ed|polarizado)\b/],
  ["periodization", /\b(?:periodi[sz]ation|periodizacion)\b/],
  ["warmup", /\b(?:warm[ -]?up|calentamiento)\b/],
  ["technique", /\b(?:technique|tecnica)\b/],
  ["endurance", /\b(?:endurance|aerobic|resistencia|aerobic[oa])\b/],
  ["recovery", /\b(?:recovery|recuperacion)\b/],
];

export function wantsCoachDetail(message: string): boolean {
  return /\b(?:more (?:detail|depth)|in (?:more )?detail|elaborate|expand|tell me more|explain more|mas (?:detalle|profundidad)|explica mas|amplia|profundiza)\b/.test(normalizeQuestion(message));
}

/** A definition is not a training-start or dose decision. Mixed requests stay
 * with the normal safety flow even when they also name an educational topic. */
export function isGeneralCoachEducationQuestion(message: string, detail = false): boolean {
  const text = normalizeQuestion(message);
  if (!/\b(?:what|why|how|explain|define|meaning|que|por que|como|explica|significa)\b/.test(text) && !detail) return false;
  if (/\b(?:i|my|mine|today|tonight|yo|mi|mis|hoy|esta noche|save|record|log|guarda|registra)\b/.test(text)) return false;
  if (/\b(?:how (?:many|much|long)|cuant[oa]s?|for me|debo|puedo|para mi|give|prescribe|suggest|recommend|start|resume|begin|design|build|dame|recomienda|empezar|comenzar|reanudar)\b/.test(text)) return false;
  return true;
}

/** Fixed, bilingual explanations are available without a provider round-trip.
 * This answers concepts only; current symptoms and saved-data questions are
 * handled by the reply engine before this helper is called. */
export function localCoachEducation(message: string, language: string, detail = false): { answer: string; topic: EducationalTopic } | null {
  const text = normalizeQuestion(message);
  if (!isGeneralCoachEducationQuestion(message, detail)) return null;
  const found = topicPatterns.filter(([, pattern]) => pattern.test(text));
  if (found.length !== 1) return null;
  const topic = found[0][0];
  const paragraphs = educationalCatalog[topic];
  const selected = detail || /\b(?:why|how|por que|como)\b/.test(text) ? paragraphs : paragraphs.slice(0, 1);
  return { answer: selected.map(paragraph => paragraph[language === "es" ? "es" : "en"]).join("\n\n"), topic };
}
