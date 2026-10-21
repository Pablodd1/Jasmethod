/** Display-only labels. The original verdict, reason and safety fields stay unchanged. */
const fields: Record<string, { en: string; es: string }> = {
  sleep: { en: "sleep", es: "sueño" },
  soreness: { en: "muscle soreness", es: "molestias musculares" },
  motivation: { en: "motivation", es: "motivación" },
  energy: { en: "energy", es: "energía" },
  stress: { en: "stress", es: "estrés" },
  sick: { en: "illness symptoms", es: "síntomas de enfermedad" },
  newPain: { en: "new or worsening pain", es: "dolor nuevo o que empeora" },
  urgentSymptoms: { en: "urgent symptoms", es: "síntomas urgentes" },
  availableMin: { en: "available training time", es: "tiempo disponible para entrenar" },
};
/** Friendly name of a check-in question, or null when the key is not a known check-in question. */
export function readinessFieldLabel(key: string, es: boolean): string | null {
  return fields[key]?.[es ? "es" : "en"] ?? null;
}
const missingInputReason = /^Training is on hold until today's safety, recovery and available-time answers are known\. Missing: ([^.]+)\. Unknown or skipped answers are not evidence of readiness\. No device data is required\.$/;

export function readinessReasonText(reason: string, es: boolean): string {
  const missing = missingInputReason.exec(reason);
  if (!missing) return reason;
  const names = missing[1].split(", ").map(key => fields[key]?.[es ? "es" : "en"] ?? key).join(", ");
  return es
    ? `Entrenamiento en pausa hasta completar el check-in de hoy. Falta revisar: ${names}. Las respuestas desconocidas u omitidas no confirman que estés listo para entrenar. No necesitas datos de un dispositivo.`
    : `Training is on hold until today's check-in is complete. Review: ${names}. Unknown or skipped answers do not confirm readiness to train. No device data is required.`;
}
