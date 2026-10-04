// Shared recovery-day guidance. Optional practices are not a workout prescription.
// The 20-minute option is a JMM coaching choice, not a validated universal dose.
export interface DayOffProtocol {
  title: string;
  essentials: { key?: string; icon: string; label: string; detail: string }[];
  visualizationShort: string;
  visualizationFull: { step: string; text: string }[];
  closing: string;
  evidenceNote?: string;
  sources?: { title: string; url: string }[];
}
export interface DayOffOptions { allowMovement?: boolean }

export function dayOffProtocol(lang: "en" | "es" = "en", options: DayOffOptions = {}): DayOffProtocol {
  const es = lang === "es";
  return {
    title: es ? "☁️ DÍA DE RECUPERACIÓN — descansar tiene propósito" : "☁️ RECOVERY DAY — rest has a purpose",
    essentials: [
      {
        key: "movement", icon: "🚶", label: es ? "Descanso completo o movimiento opcional" : "Complete rest or optional movement",
        detail: options.allowMovement === true
          ? es
            ? "El descanso completo es válido. Si sigues encontrándote bien y no tienes restricciones, puedes elegir hasta 20 min muy suaves en Z1, en cualquier deporte familiar que sea seguro para ti. Debes poder conversar sin esfuerzo; sin intervalos ni metas de distancia. Puedes terminar antes o no hacerlo. Detente ante dolor, mareo, enfermedad o síntomas nuevos; las restricciones médicas tienen prioridad."
            : "Complete rest is valid. If you still feel well and have no restrictions, you may choose up to 20 min very easy Z1 in any familiar sport that is safe for you. Conversation should feel effortless; no intervals or distance target. Stop earlier or skip it entirely. Stop for pain, dizziness, illness or new symptoms; medical restrictions take priority."
          : es
            ? "No hay ejercicio programado. El descanso completo es válido. No se ofrece movimiento mientras falte un check-in de seguridad actual y claro o haya síntomas o restricciones. Revisa el check-in; no entrenes para mejorar una puntuación."
            : "No workout is prescribed. Complete rest is valid. Movement is not offered without a current clear safety check-in or when symptoms or restrictions apply. Review the check-in; do not exercise to improve a score.",
      },
      {
        icon: "🛌", label: es ? "Protege el sueño" : "Protect sleep",
        detail: es
          ? "Reserva suficiente tiempo para dormir según tus necesidades. Mantén horarios regulares y un dormitorio tranquilo, oscuro y cómodo. Deja tiempo para desconectar antes de acostarte; evita cafeína cerca de dormir si te afecta. Anota problemas persistentes y coméntalos con un profesional."
          : "Allow enough sleep opportunity for your own needs. Keep regular bed and wake times and a quiet, dark, comfortable bedroom. Leave time to wind down; avoid caffeine near bedtime if it affects you. Record persistent sleep problems and discuss them with an appropriate professional.",
      },
      {
        icon: "🍽️", label: es ? "Come e hidrátate" : "Eat and hydrate",
        detail: es
          ? "Mantén comidas regulares con alimentos conocidos, fuentes de proteína y carbohidratos adecuados a lo realizado y lo que viene. Descansar no significa saltarse comidas. Bebe según la sed y tus necesidades; no fuerces una cantidad fija de agua. Sigue tu plan individual de nutrición si lo tienes."
          : "Keep regular, familiar meals with protein sources and carbohydrate suited to recent and upcoming activity. Rest does not mean skipping meals. Drink according to thirst and your needs; do not force a fixed water target. Follow your individualized nutrition plan if you have one.",
      },
      {
        icon: "🧘", label: es ? "Meditación opcional" : "Optional meditation",
        detail: es
          ? "Si te resulta útil, dedica unos minutos cómodos a la meditación, atención al presente o respiración natural y relajada. Sin retenciones ni respiración forzada. Puedes mantener los ojos abiertos, cambiar de práctica o parar si te incomoda. No es una prueba de recuperación."
          : "If useful, take a few comfortable minutes for meditation, present-moment attention or natural relaxed breathing. No breath holds or forced breathing. Keep your eyes open, change the practice or stop if uncomfortable. This is not a recovery test.",
      },
      {
        icon: "🤝", label: es ? "La carga de la vida también cuenta" : "Life demands count too",
        detail: es
          ? "Revisa estrés laboral, familiar, emocional y de viajes. Elige una ayuda concreta: reducir una tarea opcional, pedir apoyo, pasar tiempo tranquilo con alguien o reservar un momento a solas. Comparte los cambios relevantes en el check-in para que el entrenador los tenga en cuenta."
          : "Check work, family, emotional and travel stress. Choose one practical support: reduce an optional task, ask for help, enjoy quiet time with someone or protect time alone. Report relevant changes in your check-in so your coach can consider them.",
      },
      {
        icon: "🥤", label: es ? "Evita alcohol y drogas recreativas" : "Avoid alcohol and recreational drugs",
        detail: es
          ? "No los uses como herramientas de recuperación o para dormir. Evitarlos es una opción prudente para el día de recuperación; no garantiza un valor de HRV ni una mejora deportiva. No suspendas medicación prescrita sin consultar con tu profesional."
          : "Do not use them as recovery or sleep aids. Avoiding them is a prudent recovery-day choice; it does not guarantee an HRV value or performance improvement. Do not stop prescribed medication without discussing it with your clinician.",
      },
      {
        icon: "💊", label: es ? "SUPLEMENTOS: SOLO SI ESTÁN ACORDADOS" : "SUPPLEMENTS: ONLY IF ALREADY AGREED",
        detail: es
          ? "No se recomiendan suplementos por defecto. Sigue solo un plan individual acordado con un profesional cuando corresponda."
          : "No supplements are recommended by default. Follow only an individualized plan already agreed with an appropriate professional.",
      },
    ],
    visualizationShort: es
      ? "🧠 VISUALIZACIÓN (2-5 min opcionales): ensaya mentalmente una carrera o sesión: preparación, ritmo controlado, avituallamiento y adaptación a imprevistos. Incluye detenerte ante dolor o señales de alarma. Puedes omitirla; no predice el resultado."
      : "🧠 VISUALIZATION (2-5 min optional): mentally rehearse a race or session: preparation, controlled pacing, fueling and adapting to surprises. Include stopping for pain or warning symptoms. You may skip it; it does not predict the result.",
    visualizationFull: es ? [
      { step: "1 · Elige una situación", text: "Una sesión o carrera que quieras preparar. Elige un aspecto bajo tu control." },
      { step: "2 · Ponte cómodo", text: "Busca un lugar tranquilo. Mantén los ojos abiertos o cerrados, como prefieras." },
      { step: "3 · Respira con naturalidad", text: "Sin forzar la respiración ni retener el aire. Puedes detener la práctica cuando quieras." },
      { step: "4 · Observa el entorno", text: "Imagina el recorrido, los sonidos y las sensaciones sin exigirte una imagen perfecta." },
      { step: "5 · Ensaya decisiones", text: "Practica mentalmente ritmo, técnica, alimentación y comunicación con el entrenador según el plan revisado." },
      { step: "6 · Incluye imprevistos", text: "Imagina adaptar el plan al tiempo o al recorrido, y parar ante dolor o síntomas de alarma." },
      { step: "7 · Valora el proceso", text: "Termina con una decisión concreta que quieras recordar; no necesitas imaginar una marca personal." },
      { step: "8 · Revisa su utilidad", text: "Si te ayuda, puedes repetirla otro día. Si aumenta tu preocupación, omítela o busca apoyo." },
    ] : [
      { step: "1 · Choose a situation", text: "A session or race you want to prepare for. Choose an aspect within your control." },
      { step: "2 · Get comfortable", text: "Find a quiet place. Keep your eyes open or closed, whichever you prefer." },
      { step: "3 · Breathe naturally", text: "No forced breathing or breath holding. You can stop the practice at any time." },
      { step: "4 · Notice the setting", text: "Imagine the course, sounds and sensations without needing a perfect picture." },
      { step: "5 · Rehearse decisions", text: "Practice pacing, technique, fueling and communication with your coach according to the reviewed plan." },
      { step: "6 · Include surprises", text: "Imagine adapting the plan to weather or course conditions, and stopping for pain or warning symptoms." },
      { step: "7 · Value the process", text: "Finish with one decision you want to remember; you do not need to picture a personal best." },
      { step: "8 · Review its usefulness", text: "If useful, repeat another day. If it increases worry, skip it or seek support." },
    ],
    closing: es
      ? "El descanso puede ser descanso completo. No tienes que compensar una sesión perdida. Estas prácticas no demuestran recuperación ni reinician el sistema nervioso autónomo."
      : "Rest can mean complete rest. There is no need to make up a missed session. These practices do not establish recovery or reset the autonomic nervous system.",
    evidenceNote: es
      ? "Los consensos apoyan individualizar sueño, recuperación y demandas de la vida. Los 20 minutos opcionales son una elección de entrenamiento de JMM, no una dosis universal validada. La meditación y visualización son opciones de práctica; no prometen mejorar HRV ni rendimiento."
      : "Consensus guidance supports individualizing sleep, recovery and life demands. The optional 20 minutes is a JMM coaching choice, not a validated universal dose. Meditation and visualization are practice options, without promises to improve HRV or performance.",
    sources: [
      { title: "Kellmann et al. 2018 — Recovery and Performance in Sport: Consensus Statement", url: "https://pubmed.ncbi.nlm.nih.gov/29345524/" },
      { title: "Walsh et al. 2021 — Sleep and the athlete: expert consensus recommendations", url: "https://pubmed.ncbi.nlm.nih.gov/33144349/" },
      { title: "Parr et al. 2014 — Human study of high-dose post-exercise alcohol and muscle protein synthesis", url: "https://pubmed.ncbi.nlm.nih.gov/24533082/" },
    ],
  };
}

/** Shared text for messages; movement stays off unless explicitly permitted. */
export function dayOffProtocolText(lang: "en" | "es" = "en", options: DayOffOptions = {}): string {
  const p = dayOffProtocol(lang, options);
  return [p.title, ...p.essentials.map(e => `${e.icon} ${e.label} — ${e.detail}`), p.visualizationShort, `— ${p.closing}`].join("\n");
}
