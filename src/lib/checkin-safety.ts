/** Deterministic safety hold, not diagnosis or return-to-play clearance.
 * Rule wording requires qualified clinical/coaching review before pilot release.
 */
export const CHECKIN_SAFETY_VERSION = "checkin-safety-v1";
export const SUBJECTIVE_FIELDS = ["sleep", "soreness", "motivation", "energy", "stress"] as const;
export const SAFETY_FIELDS = ["sick", "newPain", "urgentSymptoms"] as const;
export interface CheckinSafetyInput {
  sleep?: number; soreness?: number; motivation?: number; energy?: number; stress?: number;
  sick?: boolean; newPain?: boolean; urgentSymptoms?: boolean; painAffectsMovement?: boolean;
  painLocation?: string; availableMin?: number;
}
export interface CheckinSafety {
  status: "clear" | "unknown" | "hold" | "urgent";
  ruleId: string;
  message: string;
  missingFields: string[];
}
export function resolveCheckinSafety(input: CheckinSafetyInput | null | undefined): CheckinSafety {
  const c = input || {};
  if (c.urgentSymptoms === true) return {
    status: "urgent", ruleId: `${CHECKIN_SAFETY_VERSION}:urgent-symptoms`, missingFields: [],
    message: "Stop exercise. Current chest discomfort, fainting, severe unexplained breathlessness, confusion or collapse need urgent medical assessment. If symptoms are severe or ongoing, contact local emergency services now. No workout is prescribed; this is not a diagnosis or clearance to resume training.",
  };
  if (c.sick === true || c.newPain === true || c.painAffectsMovement === true) return {
    status: "hold", ruleId: `${CHECKIN_SAFETY_VERSION}:illness-or-pain`, missingFields: [],
    message: c.sick === true
      ? "Training is on hold because you reported illness symptoms. Rest and seek appropriate medical advice, especially if symptoms are new, worsening or persistent. This app cannot diagnose illness or clear return to training."
      : `Training is on hold for new or worsening focal pain${c.painLocation ? ` (${c.painLocation})` : ""}${c.painAffectsMovement ? " affecting movement" : ""}. Stop painful activity and seek appropriate professional assessment. This app cannot diagnose injury or clear return to training.`,
  };
  const missingFields: string[] = SUBJECTIVE_FIELDS.filter((key) => !Number.isInteger(c[key]) || c[key]! < 1 || c[key]! > 5);
  missingFields.push(...SAFETY_FIELDS.filter((key) => typeof c[key] !== "boolean"));
  if (!Number.isFinite(c.availableMin) || c.availableMin! < 0 || c.availableMin! > 1440) missingFields.push("availableMin");
  if (missingFields.length) return {
    status: "unknown", ruleId: `${CHECKIN_SAFETY_VERSION}:missing-input`, missingFields,
    message: `Training is on hold until today's safety, recovery and available-time answers are known. Missing: ${missingFields.join(", ")}. Unknown or skipped answers are not evidence of readiness. No device data is required.`,
  };
  return { status: "clear", ruleId: `${CHECKIN_SAFETY_VERSION}:reviewed-input`, missingFields: [], message: "Current self-reported safety questions answered; this is not medical clearance." };
}

/** Parse only scalar values; no booleans/arrays/object coercion into reported numbers. */
export function optionalCheckinNumber(value: unknown, key: string, min: number, max: number, integer = false): number | undefined {
  if (value == null || value === "" || value === "unknown" || value === "prefer-not") return undefined;
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim()))) throw new Error(`Invalid ${key}`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) throw new Error(`Invalid ${key}`);
  return parsed;
}
export function optionalCheckinBoolean(value: unknown, key: string): boolean | undefined {
  if (value == null || value === "" || value === "unknown" || value === "prefer-not") return undefined;
  if (typeof value !== "boolean") throw new Error(`Invalid ${key}; choose yes, no or unknown`);
  return value;
}

export interface FreshnessProvider { provider: string; status: string; lastSyncAt: Date | string | null }
export interface FreshnessResult { provider: string; ok: boolean; imported: number; error?: string }
/** Sync completion is evidence of provider contact, never proof of current measurements. */
export function checkinSyncFreshness(providers: FreshnessProvider[], results: FreshnessResult[] | null, attempted: boolean, now = Date.now()) {
  const statuses = providers.map((p) => {
    const result = results?.find((r) => r.provider === p.provider);
    const lastSync = p.lastSyncAt ? new Date(p.lastSyncAt).getTime() : NaN;
    const recent = p.status === "connected" && Number.isFinite(lastSync) && now - lastSync >= 0 && now - lastSync < 6 * 3600000;
    const state = result?.ok === false ? "failed" : result?.ok === true && recent ? "synced-now" : recent ? "fresh" : attempted && results === null ? "pending" : "stale";
    return { provider: p.provider, status: state, lastSyncAt: p.lastSyncAt, imported: result?.imported ?? null, error: result?.error };
  });
  const freshness = !statuses.length ? "not-connected" : statuses.every((p) => p.status === "synced-now") ? "synced-now" : statuses.every((p) => ["fresh", "synced-now"].includes(p.status)) ? "fresh" : statuses.some((p) => p.status === "failed") ? "failed" : statuses.some((p) => p.status === "pending") ? "pending" : "stale";
  return { freshness, providers: statuses, note: freshness === "not-connected" ? "No device providers connected. Your manual answers are used; device data is optional." : freshness === "synced-now" || freshness === "fresh" ? "Provider sync completed recently. Measurement dates still determine whether data is current." : "Some provider data is unavailable, stale or still refreshing. Your check-in is saved; no fresh-measurement claim is made." };
}
