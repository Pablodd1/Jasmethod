/** Presentation routing only. Never authorizes data access, mutations or AI disclosure. */
export function opensTodayWorkout(message: string): boolean {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(?:yesterday|tomorrow|last week|next week|ayer|manana|semana pasada|proxima semana)\b/.test(text)) return false;
  return /\b(?:today|hoy)\b/.test(text) && /\b(?:workout|session|training|fuel|fueling|nutrition|eat|drink|entrenamiento|entrenar|sesion|nutricion|comer|beber|alimentacion|hidratacion)\b/.test(text);
}
