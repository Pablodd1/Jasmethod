// JasMiamiMethod — Day-Off Protocol
//
// What a rest day IS on this platform (owner spec): rest is a training
// day for optional sleep/journaling, familiar food and hydration. No exercise
// or supplementation is prescribed by a rest verdict.
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
          ? "Come de forma regular con alimentos conocidos. Bebe según la sed y tus necesidades; no fuerces una cantidad fija de agua."
          : "Eat regular, familiar meals. Drink according to thirst and your needs; do not force a fixed water target.",
      },
      {
        icon: "💊",
        label: es ? "SUPLEMENTOS: SOLO SI ESTÁN ACORDADOS" : "SUPPLEMENTS: ONLY IF ALREADY AGREED",
        detail: es
          ? "No se recomiendan suplementos por defecto. Sigue solo un plan individual acordado con un profesional cuando corresponda."
          : "No supplements are recommended by default. Follow only an individualized plan already agreed with an appropriate professional.",
      },
      {
        icon: "🚶",
        label: es ? "Descanso; movimiento opcional" : "Rest; optional comfortable movement",
        detail: es
          ? "No hay ejercicio programado. Si te encuentras bien, el movimiento cómodo y la respiración relajada son opcionales; evita actividad dolorosa."
          : "No workout is prescribed. If you feel well, comfortable movement and relaxed breathing are optional; avoid painful activity.",
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
          { step: "5 · Recorre el evento", text: "Paso a paso, del inicio al final. Incluye los retos — fatiga o mal clima; imagina ajustar el plan y detenerte ante dolor o señales de alarma." },
          { step: "6 · Usa todos los sentidos", text: "Cuanto más real la escena, más efectiva la práctica." },
          { step: "7 · Siente el éxito", text: "Termina con la satisfacción del objetivo logrado: la sesión dura completada, el mejor personal." },
          { step: "8 · Practica regularmente", text: "Diario en semana de puesta a punto (taper). Refuerza las conexiones neuronales del rendimiento — es práctica con propósito, no soñar despierto." },
        ]
      : [
          { step: "1 · Choose your setting", text: "Training: the session ahead — route, pace, how you'll feel. Race: from waking to crossing the line." },
          { step: "2 · Find a quiet space", text: "Somewhere comfortable where you won't be disturbed." },
          { step: "3 · Close your eyes and breathe", text: "A few deep breaths to relax body and mind." },
          { step: "4 · Create a vivid image", text: "Visual (environment, weather, terrain) · Auditory (cheering, breathing, footsteps) · Kinesthetic (heart rate, muscles, sweat) · Emotional (confidence, excitement, joy)." },
          { step: "5 · Run through the event", text: "Step by step, start to finish. Include challenges — fatigue or bad weather; rehearse adjusting the plan and stopping for pain or warning symptoms." },
          { step: "6 · Use all senses", text: "The more real the scene, the more effective the practice." },
          { step: "7 · Feel the success", text: "End with the satisfaction of the goal achieved: the hard session completed, the personal best." },
          { step: "8 · Practice regularly", text: "Daily in taper week. It strengthens the neural connections of performance — purposeful practice, not daydreaming." },
        ],
    closing: es
      ? "El descanso puede ser descanso completo. No tienes que compensar una sesión perdida."
      : "Rest can mean complete rest. There is no need to make up a missed session.",
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
