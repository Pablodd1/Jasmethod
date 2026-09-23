// JasMiamiMethod — Day-Off Protocol
//
// What a rest day IS on this platform (owner spec): rest is a training
// session — sleep/journaling/pre-race routine, fueling & hydration,
// supplementation NOT skipped, and the daily visualization practice.
// Selected by the athlete or auto-selected by the plan (taper/test weeks).

export interface DayOffProtocol {
  title: string;
  essentials: { icon: string; label: string; detail: string }[];
  visualizationShort: string;
  visualizationFull: { step: string; text: string }[];
  closing: string;
}

export function dayOffProtocol(lang: "en" | "es" = "en"): DayOffProtocol {
  const es = lang === "es";
  return {
    title: es ? "☁️ DÍA LIBRE — el descanso ES entrenamiento" : "☁️ DAY OFF — rest IS training",
    essentials: [
      {
        icon: "🛌",
        label: es ? "Duerme bien" : "Sleep well",
        detail: es
          ? "8 horas — la adaptación ocurre dormida. Diario rápido antes de dormir: ¿cómo fue hoy? ¿qué mejoró?"
          : "8 hours — adaptation happens asleep. Quick journaling before bed: how was today? what improved?",
      },
      {
        icon: "🍽️",
        label: es ? "Come e hidrátate" : "Eat and hydrate",
        detail: es
          ? "Proteína al mando hoy (reparación), carbohidratos moderados, sal si sudaste mucho ayer. 2-3 L de agua."
          : "Protein leads today (repair), moderate carbs, salt if you sweated heavily yesterday. 2-3 L water.",
      },
      {
        icon: "💊",
        label: es ? "RECUERDA LA SUPLEMENTACIÓN" : "REMEMBER SUPPLEMENTATION",
        detail: es
          ? "Los descansos no son días sin suplementos: creatina diaria, vitamina D, omega-3 — igual que hoy entrenaras."
          : "Rest days are not supplement holidays: daily creatine, vitamin D, omega-3 — same as any training day.",
      },
      {
        icon: "🚶",
        label: es ? "20 min Z1 + respiración" : "20 min Z1 + breathing",
        detail: es
          ? "Caminar, girar suave o nadar ligero. 5 min de exhala extendida 2:1 al terminar."
          : "Walk, easy spin, or light swim. 5 min of 2:1 extended-exhale breathing to finish.",
      },
    ],
    visualizationShort: es
      ? "🧠 VISUALIZACIÓN (2-5 min, sin teléfono): cierra los ojos, respira, y recorre mentalmente la próxima sesión o carrera — el lugar, el ritmo, tu respiración en el esfuerzo, y tú superando la fatiga. Siéntela con todos los sentidos y termina sintiendo el éxito."
      : "🧠 VISUALIZATION (2-5 min, phone away): close your eyes, breathe, and mentally run the next session or race — the place, the pace, your breathing at effort, you pushing through fatigue. Engage every sense and finish feeling the success.",
    visualizationFull: es
      ? [
          { step: "1 · Elige tu escenario", text: "Entrenamiento: la sesión que tienes delante — ruta, ritmo, cómo te sentirás. Carrera: del despertar a cruzar la meta." },
          { step: "2 · Espacio tranquilo", text: "Un lugar silencioso donde nadie te interrumpa." },
          { step: "3 · Cierra los ojos y respira", text: "Algunas respiraciones profundas para relajar cuerpo y mente." },
          { step: "4 · Crea una imagen vívida", text: "Visual (entorno, clima, terreno) · Auditivo (ánimos, respiración, pasos) · Cinestésico (ritmo cardíaco, músculos, sudor) · Emocional (confianza, emoción, alegría)." },
          { step: "5 · Recorre el evento", text: "Paso a paso, del inicio al final. Incluye los retos — fatiga, dolor, mal clima — y visualízate superándolos con confianza." },
          { step: "6 · Usa todos los sentidos", text: "Cuanto más real la escena, más efectiva la práctica." },
          { step: "7 · Siente el éxito", text: "Termina con la satisfacción del objetivo logrado: la sesión dura completada, el mejor personal." },
          { step: "8 · Practica regularmente", text: "Diario en semana de puesta a punto (taper). Refuerza las conexiones neuronales del rendimiento — es práctica con propósito, no soñar despierto." },
        ]
      : [
          { step: "1 · Choose your setting", text: "Training: the session ahead — route, pace, how you'll feel. Race: from waking to crossing the line." },
          { step: "2 · Find a quiet space", text: "Somewhere comfortable where you won't be disturbed." },
          { step: "3 · Close your eyes and breathe", text: "A few deep breaths to relax body and mind." },
          { step: "4 · Create a vivid image", text: "Visual (environment, weather, terrain) · Auditory (cheering, breathing, footsteps) · Kinesthetic (heart rate, muscles, sweat) · Emotional (confidence, excitement, joy)." },
          { step: "5 · Run through the event", text: "Step by step, start to finish. Include challenges — fatigue, pain, bad weather — and see yourself overcoming them confidently." },
          { step: "6 · Use all senses", text: "The more real the scene, the more effective the practice." },
          { step: "7 · Feel the success", text: "End with the satisfaction of the goal achieved: the hard session completed, the personal best." },
          { step: "8 · Practice regularly", text: "Daily in taper week. It strengthens the neural connections of performance — purposeful practice, not daydreaming." },
        ],
    closing: es
      ? "Un día libre no es un día de cero — es donde se construye la próxima sesión."
      : "A day off is not a zero day — it's where the next session gets built.",
  };
}

/** Compact block for Telegram / daily plan text. */
export function dayOffProtocolText(lang: "en" | "es" = "en"): string {
  const p = dayOffProtocol(lang);
  return [
    p.title,
    ...p.essentials.map((e) => `${e.icon} ${e.label} — ${e.detail}`),
    p.visualizationShort,
    `— ${p.closing}`,
  ].join("\n");
}
