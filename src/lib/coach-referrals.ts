/** Owner-provided JMM referrals. No prices, availability or credentials inferred. */
export const COACH_REFERRALS = {
  testing: {name:"Eric",phone:"7862317906",href:"tel:+17862317906"},
  coaching: {name:"Jasmel",phone:"7869708366",href:"tel:+17869708366"},
} as const;
export function coachReferral(message:string,language?:string) {
  const text=message.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const es=language==="es";
  const testing=/\b(?:rmr|resting metabolic rate|metabolic test|metabolismo en reposo)\b|vo(?:2|₂)\s*max/.test(text)
    && /\b(?:where|who|book|contact|call|testing|test|lab|laboratory|donde|quien|prueba|medir|laboratorio|llamar|reservar)\b/.test(text);
  if(testing) return {ruleId:"coach-conversation-v1:testing-referral",answer:es
    ? "Llama a Eric al 7862317906 y dile que Jasmel te envió. Pregunta por una evaluación completa de RMR (metabolismo en reposo) y VO₂max: bicicleta, carrera o ambas. Confirma disponibilidad, precio y preparación directamente con Eric. Después puedes añadir tus resultados fechados y el protocolo en Perfil y pruebas de referencia."
    : "Call Eric at 7862317906 and say Jasmel sent you. Ask about a full RMR (resting metabolic rate) and VO₂max assessment: bike, run, or both. Confirm availability, price and preparation directly with Eric. Afterward, add your dated results and test protocol in Profile and baseline tests."};
  if(/\b(?:contact|call|speak to|talk to|hire|find|need|want|llamar|contactar|hablar con|necesito|busco|quiero)\b/.test(text)
    && /\b(?:coach|coaching|guidance|jasmel|entrenador|entrenamiento personal|orientacion|asesoria)\b/.test(text))
    return {ruleId:"coach-conversation-v1:coaching-referral",answer:es
      ? "Para orientación o entrenamiento personal, llama a Jasmel al 7869708366. Puedes conversar sobre tus objetivos, historial y las dudas que necesitas revisar. Confirma disponibilidad y servicios directamente con él."
      : "For guidance or personal coaching, call Jasmel at 7869708366. Discuss your goals, training history and the questions you need reviewed. Confirm availability and services directly with him."};
  return null;
}
