/** Explicit user-reported event distances, stored in Race.distance without a
 * schema migration. These are not verified measurements or race predictions. */
export interface CustomTriathlonDistance { swimM: number; bikeM: number; runM: number }
const PREFIX = "triathlon-custom:";
const LIMITS = [100_000, 2_000_000, 500_000] as const;
export function parseCustomTriathlonDistance(value: unknown): CustomTriathlonDistance | null {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return null;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3 || parts.some(p => !/^(?:\d+)(?:\.\d{1,3})?$/.test(p))) return null;
  const values = parts.map(Number);
  if (values.some((n, i) => !Number.isFinite(n) || n <= 0 || n > LIMITS[i])) return null;
  return { swimM: values[0], bikeM: values[1], runM: values[2] };
}
export function formatCustomTriathlonDistance(legs: CustomTriathlonDistance): string {
  const value = PREFIX + [legs.swimM, legs.bikeM, legs.runM].map(n => Number(n.toFixed(3))).join(":");
  if (!parseCustomTriathlonDistance(value)) throw Error("Enter positive swim, bike and run distances within supported limits.");
  return value;
}
export function customTriathlonFromInputs(values: { swim: string; bike: string; run: string }, units: { swim: string; bike: string; run: string }): string {
  const metres = (key: "swim" | "bike" | "run") => {
    if (!/^(?:\d+)(?:\.\d+)?$/.test(values[key].trim())) throw Error("Enter each leg distance as a positive number.");
    const factor = units[key] === "mi" ? 1609.344 : units[key] === "km" ? 1000 : units[key] === "m" ? 1 : null;
    if (factor === null) throw Error("Choose metres, kilometres or miles for each leg.");
    return Number(values[key]) * factor;
  };
  return formatCustomTriathlonDistance({swimM:metres("swim"),bikeM:metres("bike"),runM:metres("run")});
}
export function customTriathlonLabel(value: unknown, es = false): string | null {
  const legs = parseCustomTriathlonDistance(value);
  if (!legs) return null;
  return `${es ? "Triatlón personalizado" : "Custom triathlon"}: ${legs.swimM / 1000} km ${es ? "natación" : "swim"} · ${legs.bikeM / 1000} km ${es ? "bici" : "bike"} · ${legs.runM / 1000} km ${es ? "carrera" : "run"}`;
}

/** Coaching classification only: custom legs stay explicit, never silently
 * substituted with a standard race distance or a standard forecast model. */
export function triathlonCoachingDistance(value: unknown): "sprint" | "olympic" | "half" | "full" | "custom" | null {
  if (parseCustomTriathlonDistance(value)) return "custom";
  return value === "sprint" || value === "olympic" || value === "half" || value === "full" ? value : null;
}
