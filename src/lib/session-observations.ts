/** Optional reported results. They never supply targets, calorie needs or readiness. */
export const OBSERVATION_LIMITS = {
  avgHr: [20, 240], avgPower: [0, 2500], calories: [0, 20000],
  preWeightKg: [20, 350], postWeightKg: [20, 350],
} as const;
export type SessionObservations = Partial<Record<keyof typeof OBSERVATION_LIMITS, number | null>>;
export function parseSessionObservations(value: unknown): SessionObservations {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid session measurements');
  const result: SessionObservations = {};
  for (const [key, amount] of Object.entries(value)) {
    if (!Object.hasOwn(OBSERVATION_LIMITS, key)) throw Error('Unknown session measurement');
    const name = key as keyof SessionObservations, [min, max] = OBSERVATION_LIMITS[name];
    if (amount !== null && (typeof amount !== 'number' || !Number.isFinite(amount) || amount < min || amount > max || (['avgHr', 'calories'].includes(key) && !Number.isInteger(amount)))) throw Error(`Invalid ${key}`);
    result[name] = amount as number | null;
  }
  return result;
}
export function observationsFromForm(form: FormData): SessionObservations {
  const values: Record<string, number | null> = {};
  for (const name of Object.keys(OBSERVATION_LIMITS)) {
    if (!form.has(name)) continue;
    const raw = form.get(name);
    values[name] = raw === '' ? null : Number(raw);
  }
  return parseSessionObservations(values);
}
export function readSessionObservations(value: Record<string, unknown>): SessionObservations {
  const result: SessionObservations = {};
  for (const [key,[min,max]] of Object.entries(OBSERVATION_LIMITS)) {
    const n = value[key];
    result[key as keyof SessionObservations] = typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max && (!['avgHr','calories'].includes(key) || Number.isInteger(n)) ? n : null;
  }
  return result;
}
/** Weight change is net mass change, not sweat loss, fat loss or calories. */
export function weightChange(pre: unknown, post: unknown) {
  if (typeof pre !== 'number' || typeof post !== 'number' || !Number.isFinite(pre) || !Number.isFinite(post) || pre < 20 || pre > 350 || post < 20 || post > 350) return null;
  return { lostKg: Number((pre - post).toFixed(2)), percent: Number(((pre - post) / pre * 100).toFixed(2)) };
}
/** Never derive a sweat rate without explicit fluid AND urine observations. */
export function observedSweatRate(pre: unknown, post: unknown, fluidMl: unknown, urineMl: unknown, actualMinutes: unknown) {
  const change = weightChange(pre, post);
  if (!change || typeof fluidMl !== 'number' || !Number.isFinite(fluidMl) || fluidMl < 0 || fluidMl > 30000 || typeof urineMl !== 'number' || !Number.isFinite(urineMl) || urineMl < 0 || urineMl > 10000 || typeof actualMinutes !== 'number' || !Number.isFinite(actualMinutes) || actualMinutes <= 0 || actualMinutes > 1440) return null;
  const liters = Number(pre) - Number(post) + fluidMl / 1000 - urineMl / 1000;
  return liters < 0 ? null : { litersPerHour: Number((liters * 60 / actualMinutes).toFixed(2)), method: 'reported_mass_balance_estimate' as const };
}
