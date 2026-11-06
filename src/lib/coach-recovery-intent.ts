/** Route a current first-person recovery report to review. This only recognizes
 * the intent. It does not infer a check-in answer, a workout result, or readiness. */
export function isPostWorkoutRecoveryReport(message: string): boolean {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/["“”]|\b(?:hypothetical(?:ly)?|for example|what if|if i|if an athlete|my (?:friend|athlete|client|partner)|por ejemplo|si yo|si un atleta|mi (?:atleta|cliente|pareja|amig[oa]))\b/.test(text)) return false;
  if (/\b(?:did not|didn['’]t|never|no)\s+(?:finish|complete|do|train|ride|run|termine|complete|hice|entrene)\b/.test(text)) return false;

  const workout = /\b(?:brick|bike[ -]run|workout|training session|ride|long run|intervals|sesion|entrenamiento|carrera larga|intervalos|bici y carrera|bici y correr)\b/.test(text);
  const ownCompleted = /\b(?:i (?:finished|completed|did|rode|ran)|my (?:last|hard|long)|(?:hice|termine|complete)|mi (?:ultima|ultimo))\b/.test(text);
  const compactReport = /^(?:a )?(?:hard|long|tough)\s+(?:brick|bike[ -]run|ride|run|workout)\s+yesterday\b/.test(text);
  const recoveryText = text.replace(/\b(?:no|not|without|sin)\s+(?:any\s+)?(?:heavy legs|poor sleep|piernas pesadas|mal sueno)(?:\s+(?:or|and|ni|o)\s+(?:heavy legs|poor sleep|piernas pesadas|mal sueno))?/g, "");
  const currentRecovery = /\b(?:my legs feel heavy|heavy legs|i slept poorly|poor sleep|i barely slept|me pesan las piernas|piernas pesadas|dormi mal|mal sueno|dormi poco)\b/.test(recoveryText);
  const oldSymptoms = /\b(?:last (?:week|month|year)|used to|semana pasada|mes pasado|ano pasado|antes me)\b/.test(text);

  return workout && (ownCompleted || compactReport) && currentRecovery && !oldSymptoms;
}
