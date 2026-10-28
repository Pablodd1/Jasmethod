/** Translate admission explanations; never alter admission itself. */
export function planningReasonText(reason:string,es:boolean) {
  if(!es)return reason;
  return ({
    "Update training history from the last four weeks":"Actualiza el historial de entrenamiento de las últimas cuatro semanas.",
    "Current symptoms or restrictions need qualified review before an automated plan":"Hay restricciones o síntomas guardados. Revísalos con un profesional cualificado antes de un plan automático; corrige la respuesta si no refleja tu situación actual.",
    "Report recent tolerated weekly training and its observation date":"Indica el entrenamiento semanal reciente que toleraste y la fecha de observación. Puedes revisar tus registros importados sin inventar una referencia.",
    "Reconfirm current restrictions and availability before replacing a plan":"Vuelve a confirmar tus restricciones y disponibilidad actuales antes de sustituir un plan.",
    "Confirm current symptoms, injuries and restrictions":"Confirma los síntomas, lesiones y restricciones actuales.",
    "Confirm recent training interruptions":"Confirma si hubo interrupciones recientes del entrenamiento.",
    "Return after an interruption needs a reviewed starting load":"La vuelta tras una interrupción necesita una carga inicial revisada.",
    "Confirm adult pilot eligibility":"Confirma la elegibilidad para el programa de adultos.",
    "Confirm training experience":"Confirma tu experiencia de entrenamiento.",
    "Explicitly confirm training experience":"Confirma explícitamente tu experiencia de entrenamiento.",
    "Choose a supported training goal":"Elige un deporte u objetivo de entrenamiento compatible.",
    "Describe your goal (fitness, completion or performance)":"Describe tu objetivo: bienestar físico, terminar una prueba o rendimiento.",
    "Choose available training days":"Elige los días disponibles para entrenar.",
    "Confirm the maximum time per training day":"Confirma el tiempo máximo por día de entrenamiento.",
    "Describe equipment and venue access":"Describe el material y los lugares a los que tienes acceso.",
    "Choose a planning horizon":"Elige la duración del ciclo.",
    "Confirm whether medical, pregnancy/postpartum or other circumstances need qualified review":"Confirma si alguna circunstancia médica, de embarazo/posparto u otra necesita revisión cualificada.",
    "This circumstance is outside the automated adult pilot; ask a qualified professional for an individualized plan":"Esta circunstancia necesita un plan individual con un profesional cualificado.",
  } as Record<string,string>)[reason] ?? reason;
}
