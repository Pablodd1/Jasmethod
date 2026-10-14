/** Owner-provided JMM referrals. No prices, availability or credentials inferred. */
export const COACH_REFERRALS = {
  testing: {name:"Eric",phone:"7862317906",href:"tel:+17862317906"},
  coaching: {name:"Jasmel",phone:"7869708366",href:"tel:+17869708366"},
} as const;

// A referral replaces the in-app answer, so ambiguous requests must fall through.
// Quoted/reported instructions are context, not a request to contact someone.
function referralClauses(message: string): string[] {
  return message
    .replace(/^\s*>.*$/gm, ";")
    .replace(/```[\s\S]*?(?:```|$)|`[^`]*(?:`|$)|"[^"]*(?:"|$)|“[^”]*(?:”|$)|«[^»]*(?:»|$)/g, ";")
    .replace(/(^|[\s([{])['‘][\s\S]*?(?:['’](?=$|[\s.,!?;:)\]}])|$)/g, "$1;")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[.!?;\n]+|\b(?:but|however|pero|sin embargo)\b/)
    .map(clause => clause.trim())
    .filter(clause => clause
      && !/\b(?:no|not|never|dont|don't|doesn't|didn't|can't|cannot|won't|wouldn't|shouldn't|without|avoid|stop|instead of|rather than|nunca|sin|evita|evitar|deja de)\b/.test(clause)
      && !/\b(?:said|says|told|tells|telling|suggested|suggests|recommended|recommends|quoted|translate|translation|example|meaning|mean|dijo|dice|dices|dijiste|diciendo|recomienda|recomendaste|sugiere|traduce|traduccion|ejemplo|significa|significado)\b/.test(clause)
      && !/\b(?:in[ -]app|(?:inside|in) (?:this |the )?app|in (?:this|the) chat|ai coach|j coach|coach j|en (?:la )?app|en (?:este|el) chat|coach virtual|entrenador virtual)\b/.test(clause));
}

const testingTopic = /\b(?:rmr|resting metabolic rate|metabolic test(?:ing)?|metabolismo en reposo|vo[2₂]\s*max)\b/;
const coachingTopic = /\b(?:coach|coaching|guidance|jasmel|trainer|entrenador(?:a)?|entrenamiento personal|orientacion|asesoria)\b/;
const contactQuestion = /\b(?:who (?:can|should|do) i (?:call|contact)|a quien (?:(?:puedo|debo) )?(?:llamar|contactar))\b/;
// Require an action, not nouns such as "a book about RMR" or "my schedule".
const bookingIntent = /(?:^|\b(?:please|to|(?:can|could|should|may) (?:i|we|you)|how do i|help me|quiero|necesito|puedo|podemos|como|por favor))\s*(?:book|schedule|reserve|arrange|reservar|reserva|agendar|agenda|programar|concertar)\b/;
const testingLocation = /\b(?:where (?:(?:can|could|should|do) (?:i|we)|to) (?:get|do|take|book|schedule|have|measure)|who (?:does|offers|provides|performs)|donde (?:(?:puedo|podemos|debo) )?(?:hacer(?:me)?|realizar(?:me)?|medir(?:me)?|reservar|agendar)|quien (?:hace|realiza|ofrece|mide))\b/;
const workoutTopic = /\b(?:workouts?|intervals?|entrenamientos?|intervalos?)\b/;
const savedResults = /\b(?:results?|readings?|scores?|estimates?|history|profile|resultados?|lecturas?|puntaje|estimacion|historial|perfil)\b/;

const coachTarget = "(?:jasmel|(?:(?:a|an|the|my|un|una|el|mi)\\s+)?(?:(?:human|personal|real|in[ -]person)\\s+)?(?:coach|trainer|entrenador(?:a)?)(?:\\s+(?:humano|personal|presencial))?)";
const directCoachContact = new RegExp(`\\b(?:call|phone|contact|text|email|hire|reach|llamar|llama|llamo|contactar|contacta|contratar)\\s+(?:(?:a|al|con|out to)\\s+)?${coachTarget}\\b`);
const humanConversation = /\b(?:(?:talk|speak) (?:to|with) (?:(?:a|the) )?(?:jasmel|(?:human|real|in[ -]person) (?:coach|trainer))|hablar con (?:(?:un|el) )?(?:jasmel|entrenador (?:humano|personal|presencial)))\b/;
const coachContactDetails = new RegExp(`\\b(?:${coachTarget}(?:'s)?\\s+(?:phone|telephone|number|contact details)|(?:phone(?: number)?|telephone(?: number)?|contact (?:details|info)|number|telefono|numero(?: de telefono)?)\\s+(?:(?:for|of|de|del)\\s+)?${coachTarget})\\b`);
const ericContact = /\b(?:(?:call|contact|phone|llamar a|contactar (?:a|con)) eric|eric(?:'s)? (?:phone|telephone|number|contact details)|(?:phone(?: number)?|contact details|number|telefono|numero(?: de telefono)?) (?:for |of |de )?eric)\b/;

export function coachReferral(message:string,language?:string) {
  const clauses = referralClauses(message);
  const hasTestingTopic = clauses.some(clause => testingTopic.test(clause));
  const hasCoachingTopic = clauses.some(clause => coachingTopic.test(clause));
  const es=language==="es";
  const testing = clauses.some(clause =>
    (testingTopic.test(clause) && !workoutTopic.test(clause)
      && (bookingIntent.test(clause) || (testingLocation.test(clause) && !savedResults.test(clause))))
    || (hasTestingTopic && contactQuestion.test(clause))
    || ericContact.test(clause));
  if(testing) return {ruleId:"coach-conversation-v1:testing-referral",answer:es
    ? "Llama a Eric al 7862317906 y dile que Jasmel te envió. Pregunta por una evaluación completa de RMR (metabolismo en reposo) y VO₂max: bicicleta, carrera o ambas. Confirma disponibilidad, precio y preparación directamente con Eric. Después puedes añadir tus resultados fechados y el protocolo en Perfil y pruebas de referencia."
    : "Call Eric at 7862317906 and say Jasmel sent you. Ask about a full RMR (resting metabolic rate) and VO₂max assessment: bike, run, or both. Confirm availability, price and preparation directly with Eric. Afterward, add your dated results and test protocol in Profile and baseline tests."};
  if (clauses.some(clause => directCoachContact.test(clause)
    || humanConversation.test(clause)
    || coachContactDetails.test(clause)
    || (hasCoachingTopic && contactQuestion.test(clause))
    || (coachingTopic.test(clause) && bookingIntent.test(clause)
      && /\b(?:call|appointment|consultation|coaching|personal training|llamada|cita|consulta|entrenamiento personal)\b/.test(clause))))
    return {ruleId:"coach-conversation-v1:coaching-referral",answer:es
      ? "Para orientación o entrenamiento personal, llama a Jasmel al 7869708366. Puedes conversar sobre tus objetivos, historial y las dudas que necesitas revisar. Confirma disponibilidad y servicios directamente con él."
      : "For guidance or personal coaching, call Jasmel at 7869708366. Discuss your goals, training history and the questions you need reviewed. Confirm availability and services directly with him."};
  return null;
}
