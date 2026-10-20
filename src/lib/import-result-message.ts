/** Athlete-facing summary of a /api/import response. States what was and was not stored; never "complete". */
type Lang = "en" | "es";
export interface ImportResponse {
  workoutsImported?: number; workoutsAlreadyStored?: number; metricsImported?: number; workoutsFound?: number;
  skipped?: Record<string, number>; unsupportedTypes?: Record<string, number>;
}
const SKIP_LABEL: Record<string, { en: string; es: string }> = {
  unsupported_activity_type: { en: "unsupported activity type", es: "tipo de actividad no compatible" },
  bad_date: { en: "unreadable date", es: "fecha ilegible" },
  bad_duration: { en: "missing or too-short duration", es: "duración ausente o demasiado corta" },
  noTrackpoints: { en: "no recorded points", es: "sin puntos registrados" },
  tooShort: { en: "shorter than 30 seconds", es: "menos de 30 segundos" },
  invalidTime: { en: "unreadable timestamps", es: "marcas de tiempo ilegibles" },
  tooLong: { en: "longer than 24 hours or too many points", es: "más de 24 horas o demasiados puntos" },
  sessionsSkipped: { en: "unusable session", es: "sesión no utilizable" },
  ambiguousNumbers: { en: "number(s) in an unrecognized format left blank", es: "número(s) en un formato no reconocido dejados en blanco" },
  implausibleValues: { en: "implausible value(s) left blank", es: "valor(es) inverosímiles dejados en blanco" },
};
export function importResultMessage(source: string, data: ImportResponse, lang: Lang): string {
  const es = lang === "es";
  const fresh = data.workoutsImported ?? 0, again = data.workoutsAlreadyStored ?? 0, days = data.metricsImported ?? 0;
  const parts: string[] = [];
  parts.push(es ? `${source}: ${fresh} actividades nuevas` : `${source}: ${fresh} new workouts`);
  if (again > 0) parts.push(es ? `${again} ya estaban guardadas y se actualizaron` : `${again} already stored and refreshed`);
  if (days > 0) parts.push(es ? `${days} días de métricas` : `${days} days of metrics`);
  let text = parts.join(", ") + ".";
  const notes: string[] = [];
  for (const [key, count] of Object.entries(data.skipped ?? {})) if (count > 0 && SKIP_LABEL[key]) notes.push(`${count} ${SKIP_LABEL[key][lang]}`);
  const types = Object.entries(data.unsupportedTypes ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, n]) => `${name} ×${n}`);
  if (notes.length) text += (es ? " No importado: " : " Not imported: ") + notes.join("; ") + (types.length ? ` (${types.join(", ")})` : "") + ".";
  text += es
    ? " Revisa los datos disponibles en la configuración; importar no completa los campos que faltan."
    : " Review available data in setup; importing does not fill missing fields.";
  return text;
}
