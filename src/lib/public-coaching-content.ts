export type Pair = { en: string; es: string };
export interface Insight {
  slug: string;
  title: Pair;
  intro: Pair;
  sections: { heading: Pair; body: Pair }[];
  references: { title: string; url: string }[];
}

export const COACH_FAQS: { q: Pair; a: Pair }[] = [
  {
    q: { en: "What makes daily coaching different from a fixed plan?", es: "¿En qué se diferencia el coaching diario de un plan fijo?" },
    a: { en: "A plan sets direction. A daily check-in adds today's available time, symptoms, soreness, sleep and life context. JMM can show a modified session or put training on hold rather than assume every planned day feels the same.", es: "El plan define el rumbo. El chequeo diario añade el tiempo disponible, síntomas, molestias, sueño y contexto. JMM puede mostrar una sesión ajustada o pausar el entrenamiento en lugar de asumir que todos los días son iguales." },
  },
  {
    q: { en: "Do I need a smartwatch or connected device?", es: "¿Necesito reloj inteligente o dispositivo conectado?" },
    a: { en: "No. Manual setup and a daily self-report are supported. Available device connections may add context after you authorize them; missing biometric measurements stay unknown.", es: "No. Puedes configurar tu perfil y realizar el chequeo manual. Los dispositivos compatibles pueden aportar contexto después de autorizar la conexión; las mediciones ausentes siguen siendo desconocidas." },
  },
  {
    q: { en: "Does HRV tell me whether it is safe to train?", es: "¿La variabilidad cardíaca (VFC) me dice si puedo entrenar con seguridad?" },
    a: { en: "No. HRV can be useful alongside your own baseline, symptoms, training history and context. It is not a medical clearance, standalone injury predictor or guarantee of readiness.", es: "No. La VFC puede aportar contexto junto con tus valores habituales, síntomas e historial. No equivale a autorización médica ni predice lesiones o recuperación por sí sola." },
  },
  {
    q: { en: "Will a coach automatically change my workouts or contact my watch?", es: "¿El coach cambia mis entrenamientos o los envía al reloj automáticamente?" },
    a: { en: "Supported proposals and revisions require review and approval. Manual FIT export is available for supported sessions; connection availability varies. An export or provider acknowledgement is not proof that a workout reached a watch.", es: "Las propuestas y modificaciones compatibles requieren revisión y aprobación. Existe exportación manual FIT para sesiones compatibles; las conexiones dependen del proveedor. Descargar o aceptar una solicitud no demuestra que llegó al reloj." },
  },
  {
    q: { en: "What sports does JMM address?", es: "¿Para qué deportes es JMM?" },
    a: { en: "Swimming, cycling, running, triathlon and HYROX, with supporting strength work. Available analyses and integrations differ by activity; not every metric applies to every sport.", es: "Natación, ciclismo, carrera, triatlón y HYROX, con fuerza complementaria. Los análisis y conexiones disponibles varían según la actividad; no todas las métricas aplican a todos los deportes." },
  },
  {
    q: { en: "Does JMM promise faster races or fewer injuries?", es: "¿JMM garantiza mejores tiempos o menos lesiones?" },
    a: { en: "No. Training responses differ between athletes. JMM presents coaching guidance and recorded data with limitations, not guaranteed results, diagnosis or medical treatment.", es: "No. La respuesta al entrenamiento varía entre atletas. JMM ofrece orientación y datos registrados con sus límites, no resultados garantizados, diagnósticos ni tratamientos." },
  },
  {
    q: { en: "Can I speak with a person before starting?", es: "¿Puedo conversar con una persona antes de comenzar?" },
    a: { en: "Yes. Use the contact form to request a discussion or, if the booking calendar has been configured, select an available time on the booking page. Requesting contact is not a confirmed appointment.", es: "Sí. Usa el formulario de contacto para solicitar una conversación o, si el calendario de reservas está configurado, selecciona un horario disponible. Solicitar contacto no confirma una cita." },
  },
];

export const INSIGHTS: Insight[] = [
  {
    slug: "why-a-daily-coach-needs-context",
    title: { en: "Why a daily coach needs context, not just a schedule", es: "Por qué un coach diario necesita contexto, no solo un horario" },
    intro: { en: "The benefit of a daily decision is not more numbers. It is the chance to question whether a planned training stimulus still fits today's circumstances.", es: "La ventaja de decidir cada día no es acumular números. Es revisar si la sesión prevista todavía encaja con las circunstancias actuales." },
    sections: [
      { heading: { en: "Training load has two sides", es: "La carga tiene dos caras" },
        body: { en: "An athlete can complete the same 60-minute ride on two different days and experience it differently. External work, such as minutes and watts, is not the same as internal response, such as effort, heart rate and symptoms. The IOC's consensus on load emphasizes monitoring both and considering non-sport stressors.", es: "Dos sesiones de bicicleta de 60 minutos pueden sentirse distintas. El trabajo externo, como minutos y vatios, no equivale a la respuesta interna, como esfuerzo, pulso y síntomas. El consenso del COI sobre carga aconseja seguir ambas y considerar también el estrés fuera del deporte." } },
      { heading: { en: "A check-in can change the question", es: "El chequeo cambia la pregunta" },
        body: { en: "Rather than ask only 'What did the calendar say?', ask 'How much time is available, what changed since yesterday, and is a hard session appropriate?' JMM includes those self-reported answers in the session review. If a required answer is missing or a safety concern is raised, the right output may be a hold—not an invented workout.", es: "En vez de preguntar solo «¿qué dice el calendario?», pregunta «¿cuánto tiempo tengo, qué cambió desde ayer y corresponde una sesión intensa?». JMM utiliza las respuestas del atleta para revisar la sesión. Si falta una respuesta necesaria o aparece un problema de seguridad, la salida correcta puede ser una pausa, no inventar un entrenamiento." } },
      { heading: { en: "Personal does not mean predictive certainty", es: "Personal no significa certeza predictiva" },
        body: { en: "There is no single load or wellness number that reliably predicts injury or adaptation for every athlete. A responsible daily coach shows missing inputs, explains its limits and lets the athlete review decisions. Its value is a repeatable decision process, not a guarantee of a faster finish.", es: "No existe un número único de carga o bienestar que prediga lesiones o adaptación de forma fiable para cada persona. Un coach responsable muestra datos ausentes, explica sus límites y permite revisar decisiones. Su valor está en un proceso repetible, no en garantizar mejores marcas." } },
    ],
    references: [{ title: "IOC consensus on training load and injury (BJSM, 2016)", url: "https://doi.org/10.1136/bjsports-2016-096581" }],
  },
  {
    slug: "how-to-read-hrv-and-recovery",
    title: { en: "HRV and recovery: a signal, not a green light", es: "VFC y recuperación: una señal, no una luz verde" },
    intro: { en: "Wearable biometrics can enrich a coaching discussion. They do not replace symptoms, history or clinical judgment.", es: "La biometría de los wearables puede enriquecer la conversación. No reemplaza síntomas, historial ni juicio clínico." },
    sections: [
      { heading: { en: "Look for a personal trend", es: "Busca una tendencia personal" },
        body: { en: "Heart-rate variability changes with measurement conditions, timing and individual physiology. A single value is difficult to interpret without a consistent method and a baseline. The same principle applies to resting heart rate and wearable recovery scores.", es: "La variabilidad cardíaca cambia con las condiciones de medición, el momento del día y la fisiología individual. Un valor aislado cuesta interpretarlo sin una medición consistente y valores habituales. Lo mismo aplica al pulso en reposo y a las puntuaciones de recuperación." } },
      { heading: { en: "What the evidence actually suggests", es: "Qué sugiere realmente la evidencia" },
        body: { en: "A systematic review of eight studies found that HRV-guided approaches improved some submaximal physiological measures, while average advantages for endurance performance and peak oxygen uptake were small and not statistically significant. The lesson is to use HRV as context, not sell it as an automatic performance optimizer.", es: "Una revisión sistemática de ocho estudios observó mejoras en algunas medidas fisiológicas submáximas, mientras que las ventajas medias para rendimiento de resistencia y consumo máximo de oxígeno fueron pequeñas y no estadísticamente significativas. Conviene usar la VFC como contexto, no venderla como optimizador automático." } },
      { heading: { en: "Combine signals and report uncertainty", es: "Combina señales y explica la incertidumbre" },
        body: { en: "Sleep, subjective fatigue, soreness, stress and the last training sessions may alter the interpretation. JMM should preserve unknown data as unknown. If concerning symptoms are reported, biometrics do not overrule a safety hold.", es: "Sueño, fatiga percibida, molestias, estrés y sesiones recientes pueden cambiar la interpretación. JMM debe mantener como desconocido lo que no está medido. Si se reportan síntomas preocupantes, la biometría no anula una pausa por seguridad." } },
    ],
    references: [
      { title: "HRV-guided training: systematic review and meta-analysis (2021)", url: "https://pubmed.ncbi.nlm.nih.gov/34489178/" },
      { title: "HRV-guided endurance performance: methodological review (2021)", url: "https://pubmed.ncbi.nlm.nih.gov/34639599/" },
    ],
  },
  {
    slug: "sleep-stress-and-personalized-training",
    title: { en: "Sleep, life stress and your next workout", es: "Sueño, estrés y tu próximo entrenamiento" },
    intro: { en: "Training happens in the same life as travel, work and imperfect sleep. A practical coach acknowledges that instead of treating a plan as immutable.", es: "El entrenamiento sucede entre trabajo, viajes y noches imperfectas. Un coach práctico reconoce esa realidad en lugar de tratar el plan como inmutable." },
    sections: [
      { heading: { en: "Why sleep belongs in the conversation", es: "Por qué importa hablar del sueño" },
        body: { en: "The 2021 expert consensus on sleep in athletes describes links between inadequate sleep, well-being and performance. It also cautions that evidence quality varies and one universal number of hours is not right for everyone.", es: "El consenso de expertos de 2021 sobre el sueño de los atletas describe vínculos entre el sueño insuficiente, bienestar y rendimiento. También advierte que la calidad de la evidencia varía y que un número universal de horas no sirve para todos." } },
      { heading: { en: "Use information you can actually collect", es: "Usa información que realmente puedes obtener" },
        body: { en: "A short self-report—sleep quality, soreness, illness symptoms, motivation, stress and available minutes—is often more actionable than waiting for perfect device coverage. Connected measurements may add context when supported and authorized, but a missing wearable reading is never filled in by guesswork.", es: "Un chequeo breve de calidad del sueño, molestias, síntomas, motivación, estrés y minutos disponibles suele ser más útil que esperar datos perfectos del reloj. Las mediciones conectadas pueden ayudar si están disponibles y autorizadas, pero no se deben inventar valores ausentes." } },
      { heading: { en: "The benefit: a conversation you can repeat", es: "El beneficio: una conversación repetible" },
        body: { en: "Track the plan, note what was actually done, review how it felt, and consider whether the next session should stay, shorten or be held. These are coaching choices to review, not medical decisions or guaranteed performance gains.", es: "Revisa el plan, registra lo realizado, explica cómo te sentiste y considera si corresponde mantener, acortar o pausar la próxima sesión. Son decisiones de coaching para revisar, no decisiones médicas ni mejoras garantizadas." } },
    ],
    references: [{ title: "Sleep and the athlete: 2021 expert consensus (BJSM)", url: "https://doi.org/10.1136/bjsports-2020-102025" }],
  },
];
