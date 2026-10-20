/** Localize explanations without sending recorded activity data to a translator/AI. */
const ES: Array<[string, string]> = [
  ["The stored series was reduced", "La serie se redujo para limitar el almacenamiento. Las métricas son aproximadas y no justifican por sí solas aumentar la carga."],
  ["Aerobic decoupling not computed: it needs a steady", "No se calcula el desacople: requiere un esfuerzo estable de al menos 40 minutos."],
  ["Aerobic decoupling not computed: it needs heart", "No se calcula el desacople: requiere FC y potencia o velocidad de carrera durante al menos el 90% de la actividad."],
  ["Aerobic decoupling not computed: the effort", "No se calcula el desacople: la potencia o velocidad varió más del 15%."],
  ["Aerobic decoupling not computed: one half", "No se calcula el desacople: faltan datos emparejados en una mitad de la sesión."],
  ["Aerobic decoupling splits", "El desacople divide toda la grabación en dos mitades; incluye calentamiento y vuelta a la calma."],
  ["Normalized power, IF and TSS not computed", "No se calculan las métricas avanzadas de potencia: requieren al menos 20 minutos de datos."],
  ["IF and TSS not computed", "No se calcula la carga relativa: falta una FTP vigente y validada para este deporte."],
  ["Power metrics not computed", "No se calculan métricas de potencia: hay datos en menos del 80% de la actividad."],
  ["No power data", "Esta actividad no contiene datos de potencia."],
  ["Heart-rate zones not computed", "No se calculan zonas de FC: falta un umbral cardíaco validado para este deporte."],
  ["Heart-rate metrics not computed", "No se calculan métricas de FC: hay datos en menos del 80% de la actividad."],
  ["No heart-rate data", "Esta actividad no contiene datos de frecuencia cardíaca."],
  ["Hard efforts not detected", "No se identifican esfuerzos intensos sin un umbral válido de potencia o FC. Su ausencia no confirma que no los hayas realizado."],
];
export function analysisNote(text: string, lang: "en" | "es") {
  if (lang === "en") return text;
  return ES.find(([prefix]) => text.startsWith(prefix))?.[1] ?? "La interpretación de esta métrica no está disponible. Consulta a tu coach.";
}
