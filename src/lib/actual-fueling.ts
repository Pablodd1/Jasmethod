/** Optional athlete-reported intake totals. These observations never prescribe a dose. */
export interface ActualFueling {
  schemaVersion: 1;
  carbsG: number | null;
  fluidMl: number | null;
  giSymptoms: "none" | "mild" | "moderate" | "severe" | null;
}
export type ActualFuelingPatch = Partial<Omit<ActualFueling, "schemaVersion">>;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const symptoms = ["none", "mild", "moderate", "severe"];
export function parseActualFueling(value: unknown): ActualFuelingPatch | null {
  if (value === null) return null;
  if (!object(value) || Object.keys(value).some(key => !["carbsG", "fluidMl", "giSymptoms"].includes(key))) throw new Error("Choose only actual carbohydrate grams, fluid milliliters and gut symptoms");
  const result: ActualFuelingPatch = {};
  for (const [key, max] of [["carbsG", 1500], ["fluidMl", 30000]] as const) {
    if (!Object.hasOwn(value, key)) continue;
    const amount = value[key];
    if (amount !== null && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > max)) throw new Error(`${key} must be a reported total from 0 to ${max}, or unknown`);
    result[key] = amount as number | null;
  }
  if (Object.hasOwn(value, "giSymptoms")) {
    if (value.giSymptoms !== null && (typeof value.giSymptoms !== "string" || !symptoms.includes(value.giSymptoms))) throw new Error("Choose unknown, none, mild, moderate or severe gut symptoms");
    result.giSymptoms = value.giSymptoms as ActualFueling["giSymptoms"];
  }
  return result;
}
export function readActualFueling(raw: unknown): ActualFueling | null {
  try {
    const details = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!object(details) || details.schemaVersion !== 1 || !object(details.fueling) || details.fueling.schemaVersion !== 1) return null;
    const { schemaVersion: _version, ...fields } = details.fueling;
    const parsed = parseActualFueling(fields);
    return parsed ? { schemaVersion: 1, carbsG: parsed.carbsG ?? null, fluidMl: parsed.fluidMl ?? null, giSymptoms: parsed.giSymptoms ?? null } : null;
  } catch { return null; }
}
export function actualFuelingRates(fueling: ActualFueling | null, actualDurationMin: unknown) {
  const durationMin = typeof actualDurationMin === "number" && Number.isInteger(actualDurationMin) && actualDurationMin > 0 && actualDurationMin <= 1440 ? actualDurationMin : null;
  return { durationMin, carbsGPerHour: fueling?.carbsG != null && durationMin != null ? fueling.carbsG * 60 / durationMin : null,
    fluidMlPerHour: fueling?.fluidMl != null && durationMin != null ? fueling.fluidMl * 60 / durationMin : null };
}
/** Shared native form adapter: a blank means explicitly unknown, never zero. */
export function actualFuelingFromForm(form: FormData): ActualFuelingPatch {
  const amount = (name: string) => { const raw = form.get(name); return raw === null || raw === "" ? null : Number(raw); };
  return parseActualFueling({ carbsG: amount("actualCarbsG"), fluidMl: amount("actualFluidMl"), giSymptoms: form.get("actualGiSymptoms") || null })!;
}
