/** Authored email languages only. Never silently fall back from a saved locale. */
export type ManualWorkoutEmailLanguage = "en" | "es";

export function manualEmailLanguage(value: unknown): ManualWorkoutEmailLanguage | null {
  return value === "en" || value === "es" ? value : null;
}
