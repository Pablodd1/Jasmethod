/** Local navigation and explicit planning inputs only. Never authorizes a write. */
export type CommanderArea = "plan" | "profile" | "race" | "session";
export type CommanderDraft = { area: CommanderArea; weeks?: number; startDate?: string; questions: string[] };
export function commanderDraft(message: string): CommanderDraft | null {
  const text = message.trim();
  if (!text || text.length > 4000) return null;
  const requestsCycle = /\b(?:plan|cycle|ciclo)\b/i.test(text) && /\b(?:build|create|generate|revise|replace|change|want|make|crea|genera|cambia|quiero|prepara)\b/i.test(text);
  const area: CommanderArea | null = requestsCycle ? "plan" : /\b(?:race|venue|triathlon|carrera objetivo|competici[oó]n|sede)\b/i.test(text) ? "race"
    : /\b(?:plan|cycle|weeks?|ciclo|semanas?)\b/i.test(text) ? "plan"
    : /\b(?:schedule|weekday|rest day|days off|no day off|availability|horario|descanso|disponibilidad)\b/i.test(text) ? "profile"
    : /\b(?:interval|workout|session|intervalos|sesi[oó]n|entrenamiento)\b/i.test(text) ? "session" : null;
  if (!area) return null;
  const questions: string[] = [];
  const weeks = [...text.matchAll(/\b(\d+)\s*[- ]?\s*(?:weeks?|semanas?)\b/gi)].map(m => Number(m[1]));
  const dates = [...new Set(text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])];
  const validWeeks = weeks.length === 1 && Number.isInteger(weeks[0]) && weeks[0] >= 4 && weeks[0] <= 30;
  if (weeks.length && !validWeeks) questions.push("Review a single planning horizon of 4–30 weeks.");
  // A race date, historical date or conflicting dates must never become a start date.
  const start = /\b(?:start(?:ing)?|begin(?:ning)?|desde|empezando|inicio)\s+(\d{4}-\d{2}-\d{2})\b/i.exec(text)?.[1];
  const validStart = start && dates.length === 1 && Number.isFinite(Date.parse(start + "T12:00:00Z")) && new Date(start + "T12:00:00Z").toISOString().slice(0, 10) === start;
  if (start && !validStart) questions.push("Review one valid start date in YYYY-MM-DD format.");
  return { area, ...(area === "plan" && validWeeks ? { weeks: weeks[0] } : {}), ...(area === "plan" && validStart ? { startDate: start } : {}), questions };
}

export type CommanderReceipt = { id: string; planId: string; name: string; savedAt: string; previewToken: string; sourceMessageId: string | null; requestHash:string };
export function commanderReceipt(row: {id: string; entityId: string | null; after: string | null; createdAt: Date} | null): CommanderReceipt | null {
  if (!row?.entityId || !row.after) return null;
  try {
    const data = JSON.parse(row.after);
    if (data.commander?.origin !== "private_coach" || data.planId !== row.entityId || typeof data.name !== "string" || !/^[a-f0-9]{64}$/.test(data.previewToken) || !/^[a-f0-9]{64}$/.test(data.commander.requestHash)) return null;
    return { id: row.id, planId: row.entityId, name: data.name, savedAt: row.createdAt.toISOString(), previewToken: data.previewToken, sourceMessageId: typeof data.commander.sourceMessageId === "string" ? data.commander.sourceMessageId : null,requestHash:data.commander.requestHash };
  } catch { return null; }
}
