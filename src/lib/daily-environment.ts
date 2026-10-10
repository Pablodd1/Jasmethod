/** Session-day venue evidence, separate from phone location and race scenarios. */
import { formatInTimeZone } from "date-fns-tz";
import { dateKey, localDate } from "./dates";
import type { RaceWeatherResult } from "./race-weather";

export const DAILY_ENVIRONMENT_VERSION = "daily-environment-v1";
// Product freshness/coverage limits, not physiological or weather safety thresholds.
export const DAILY_FORECAST_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const DAILY_FORECAST_MAX_SAMPLE_GAP_MS = 60 * 60 * 1000;
export interface DailyEnvironmentInput {
  setting: "unknown" | "indoor" | "outdoor";
  venueName: string | null;
  latitude: number | null;
  longitude: number | null;
  plannedLocal: string | null;
  timeZone: string | null;
  venueConfirmed: boolean;
  requestForecast: boolean;
}
export interface DailyForecastSnapshot {
  status: "fresh" | "stale" | "outside_horizon" | "provider_unavailable" | "not_requested";
  requestedAt: string | null;
  fetchedAt: string | null;
  sourceUpdatedAt: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  validAt: string | null;
  temperatureC: number | null;
  humidityPct: number | null;
  windMs: number | null;
}
export interface DailyEnvironmentRecord extends DailyEnvironmentInput {
  version: typeof DAILY_ENVIRONMENT_VERSION;
  athleteId: string;
  sessionId: string;
  observedOn: string;
  scheduleTime: string | null;
  scheduleTimezone: string;
  confirmedAt: string;
  source: "athlete_reported" | "coach_set";
  plannedAt: string | null;
  forecast: DailyForecastSnapshot;
}
export type EnvironmentReason = "offline" | "missing" | "invalid" | "unconfirmed" | "schedule_changed" | "time_missing" | "coordinates_missing" | "not_requested" | "provider_unavailable" | "stale" | "outside_horizon" | "incomplete" | "indoor" | "forecast";
export interface DailyEnvironmentAssessment {
  status: "unknown" | "indoor" | "forecast";
  reason: EnvironmentReason;
  revision: string | null;
  context: DailyEnvironmentRecord | null;
  fetchedAt: string | null;
  forecastAgeMinutes: number | null;
  freshUntil: string | null;
  validAt: string | null;
  // Unknown/stale/failed forecasts never expose values as current conditions.
  conditions: { temperatureC: number; humidityPct: number; windMs: number } | null;
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const optionalText = (v: unknown, label: string, max: number): string | null => {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || v.length > max || /[\u0000-\u001f\u007f]/.test(v)) throw new Error(`Invalid ${label}.`);
  return v.trim() || null;
};
const number = (value: unknown, low: number, high: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
const stamp = (value: unknown): number => typeof value === "string" && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;

/** No default time, home location, GPS or false=outdoor inference is allowed. */
export function parseDailyEnvironmentInput(value: unknown): DailyEnvironmentInput {
  if (!object(value)) throw new Error("Expected workout environment details.");
  const allowed = ["setting", "venueName", "latitude", "longitude", "plannedLocal", "timeZone", "venueConfirmed", "requestForecast"];
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error("Unsupported environment field. Forecasts are retrieved by the server.");
  if (!["unknown", "indoor", "outdoor"].includes(String(value.setting))) throw new Error("Choose indoor, outdoor or unknown.");
  if (typeof value.venueConfirmed !== "boolean" || typeof value.requestForecast !== "boolean") throw new Error("Confirm the actual workout venue and forecast choice explicitly.");
  const latitude = value.latitude == null || value.latitude === "" ? null : number(value.latitude, -90, 90) ? value.latitude : (() => { throw new Error("Invalid venue latitude."); })();
  const longitude = value.longitude == null || value.longitude === "" ? null : number(value.longitude, -180, 180) ? value.longitude : (() => { throw new Error("Invalid venue longitude."); })();
  if ((latitude === null) !== (longitude === null)) throw new Error("Enter both venue coordinates or leave both unknown.");
  const input: DailyEnvironmentInput = { setting: value.setting as DailyEnvironmentInput["setting"], venueName: optionalText(value.venueName, "venue", 160), latitude, longitude,
    plannedLocal: optionalText(value.plannedLocal, "planned local time", 16), timeZone: optionalText(value.timeZone, "timezone", 100), venueConfirmed: value.venueConfirmed, requestForecast: value.requestForecast };
  if (input.timeZone) { try { new Intl.DateTimeFormat("en", { timeZone: input.timeZone }).format(); } catch { throw new Error("Invalid venue timezone."); } }
  if (input.plannedLocal && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.plannedLocal)) throw new Error("Use a complete workout date and local time.");
  if (input.plannedLocal && input.timeZone) plannedEnvironmentInstant(input);
  if (input.venueConfirmed && (!input.venueName || input.setting === "unknown")) throw new Error("A named indoor or outdoor venue is required to confirm it.");
  if (input.requestForecast && (!input.venueConfirmed || input.setting !== "outdoor" || latitude === null || !input.plannedLocal || !input.timeZone)) throw new Error("Confirm an outdoor workout venue, its coordinates, planned time and timezone before fetching its forecast.");
  return input;
}
export function plannedEnvironmentInstant(input: Pick<DailyEnvironmentInput, "plannedLocal" | "timeZone">): string | null {
  if (!input.plannedLocal || !input.timeZone) return null;
  const instant = localDate(input.plannedLocal.slice(0, 10), input.timeZone, input.plannedLocal.slice(11));
  const local = (d: Date) => formatInTimeZone(d, input.timeZone!, "yyyy-MM-dd'T'HH:mm");
  if (local(instant) !== input.plannedLocal) throw new Error("This local time does not exist because the clocks change. Choose another time.");
  // Ambiguous clock-change times require a different explicit time, never an arbitrary offset.
  if ([-3600000, -1800000, 1800000, 3600000].some(offset => local(new Date(instant.getTime() + offset)) === input.plannedLocal)) throw new Error("This local time occurs twice because the clocks change. Choose an unambiguous time.");
  return instant.toISOString();
}
export function dailyForecastSnapshot(result?: RaceWeatherResult | null): DailyForecastSnapshot {
  return { status: result?.status ?? "not_requested", requestedAt: result?.requestedAt ?? null, fetchedAt: result?.fetchedAt ?? null, sourceUpdatedAt: result?.sourceUpdatedAt ?? null,
    coverageStart: result?.coverageStart ?? null, coverageEnd: result?.coverageEnd ?? null, validAt: result?.point?.at ?? null,
    temperatureC: result?.point?.temperatureC ?? null, humidityPct: result?.point?.humidityPct ?? null, windMs: result?.point?.windMs ?? null };
}
/** Validate persisted context too. A record from another athlete/session is unusable. */
export function readDailyEnvironmentRecord(value: unknown, athleteId: string, sessionId: string): DailyEnvironmentRecord | null {
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    if (!object(raw) || raw.version !== DAILY_ENVIRONMENT_VERSION || raw.athleteId !== athleteId || raw.sessionId !== sessionId || !["athlete_reported", "coach_set"].includes(String(raw.source)) || !Number.isFinite(stamp(raw.confirmedAt))) return null;
    const input = parseDailyEnvironmentInput(Object.fromEntries(["setting", "venueName", "latitude", "longitude", "plannedLocal", "timeZone", "venueConfirmed", "requestForecast"].map(k => [k, raw[k]])));
    if (plannedEnvironmentInstant(input) !== raw.plannedAt || typeof raw.observedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.observedOn) || typeof raw.scheduleTimezone !== "string" || (raw.scheduleTime !== null && (typeof raw.scheduleTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.scheduleTime)))) return null;
    new Intl.DateTimeFormat("en", { timeZone: raw.scheduleTimezone }).format();
    const f = raw.forecast;
    if (!object(f) || !["fresh", "stale", "outside_horizon", "provider_unavailable", "not_requested"].includes(String(f.status))) return null;
    for (const key of ["requestedAt", "fetchedAt", "sourceUpdatedAt", "coverageStart", "coverageEnd", "validAt"]) if (f[key] !== null && !Number.isFinite(stamp(f[key]))) return null;
    for (const [key, min, max] of [["temperatureC", -100, 70], ["humidityPct", 0, 100], ["windMs", 0, 150]] as const) if (f[key] !== null && !number(f[key], min, max)) return null;
    return { ...raw, ...input } as unknown as DailyEnvironmentRecord;
  } catch { return null; }
}
export function assessDailyEnvironment(input: { record: unknown; revision?: string | null; athleteId: string; sessionId: string; dateLocal: string; timezone: string; startTime?: string | null; now?: Date }): DailyEnvironmentAssessment {
  const now = (input.now ?? new Date()).getTime();
  const context = readDailyEnvironmentRecord(input.record, input.athleteId, input.sessionId);
  const forecast = context?.forecast;
  const fetched = stamp(forecast?.fetchedAt);
  const age = Number.isFinite(fetched) && fetched <= now ? Math.floor((now - fetched) / 60000) : null;
  const assessment: DailyEnvironmentAssessment = { status: "unknown", reason: input.record == null ? "missing" : "invalid", revision: input.revision ?? null, context, fetchedAt: forecast?.fetchedAt ?? null,
    forecastAgeMinutes: age, freshUntil: Number.isFinite(fetched) ? new Date(fetched + DAILY_FORECAST_MAX_AGE_MS).toISOString() : null, validAt: forecast?.validAt ?? null, conditions: null };
  const unknown = (reason: EnvironmentReason) => ({ ...assessment, reason });
  if (!context || stamp(context.confirmedAt) > now) return assessment;
  if (context.observedOn !== input.dateLocal || context.scheduleTimezone !== input.timezone || context.scheduleTime !== (input.startTime ?? null)) return unknown("schedule_changed");
  if (!context.venueConfirmed || context.setting === "unknown") return unknown("unconfirmed");
  if (!context.plannedAt || !context.timeZone) return unknown("time_missing");
  if (dateKey(new Date(context.plannedAt), input.timezone) !== input.dateLocal || dateKey(new Date(now), input.timezone) !== input.dateLocal) return unknown("schedule_changed");
  if (context.setting === "indoor") return { ...assessment, status: "indoor", reason: "indoor", fetchedAt: null, forecastAgeMinutes: null, freshUntil: null, validAt: null };
  if (context.latitude === null || context.longitude === null) return unknown("coordinates_missing");
  // Revalidate before using a stored provider result as session-specific evidence.
  if (forecast!.status === "not_requested") return unknown("not_requested");
  if (forecast!.status === "provider_unavailable") return unknown("provider_unavailable");
  if (forecast!.status === "stale" || age === null || now - fetched >= DAILY_FORECAST_MAX_AGE_MS) return unknown("stale");
  const target = stamp(context.plannedAt), valid = stamp(forecast!.validAt), start = stamp(forecast!.coverageStart), end = stamp(forecast!.coverageEnd);
  if (forecast!.status === "outside_horizon" || forecast!.requestedAt !== context.plannedAt || ![target, valid, start, end].every(Number.isFinite) || target < start || target > end || Math.abs(valid - target) > DAILY_FORECAST_MAX_SAMPLE_GAP_MS) return unknown("outside_horizon");
  if (forecast!.temperatureC === null || forecast!.humidityPct === null || forecast!.windMs === null) return unknown("incomplete");
  return { ...assessment, status: "forecast", reason: "forecast", conditions: { temperatureC: forecast!.temperatureC, humidityPct: forecast!.humidityPct, windMs: forecast!.windMs } };
}
/** Age is display-only; crossing a status boundary or changing evidence changes revision. */
export function environmentRevisionContext(assessment: DailyEnvironmentAssessment) {
  const { forecastAgeMinutes: _age, ...stable } = assessment;
  return stable;
}
export function dailyEnvironmentGuidance(environment: DailyEnvironmentAssessment, lang = "en"): string {
  const es = lang === "es";
  if (environment.status === "indoor") return es ? "Interior confirmado. La temperatura, ventilación y refrigeración del lugar no están medidas; ajusta por esfuerzo y comodidad. El pronóstico exterior no describe el interior." : "Indoor venue confirmed. Indoor temperature, ventilation and cooling are unmeasured; adjust by effort and comfort. Outdoor forecasts do not describe indoor conditions.";
  if (environment.status === "forecast" && environment.conditions) {
    const c = environment.conditions;
    return es ? `Pronóstico, no medición: ${c.temperatureC} °C, humedad ${c.humidityPct}%, viento ${c.windMs} m/s. Guíate por esfuerzo; si las condiciones son incómodas, elige una hora más fresca o un lugar más seguro y vuelve a confirmar. Revisa las alertas locales; el pronóstico no confirma seguridad.` : `Forecast, not a measurement: ${c.temperatureC} °C, humidity ${c.humidityPct}%, wind ${c.windMs} m/s. Follow effort; if conditions are uncomfortable, choose a cooler time or safer venue and confirm again. Check local alerts; a forecast does not establish safety.`;
  }
  const reasons: Record<EnvironmentReason, [string, string]> = {
    offline: ["This is an offline snapshot; current venue conditions cannot be verified.", "Esta es una copia sin conexión; no se pueden verificar las condiciones actuales del lugar."],
    missing: ["Workout venue and conditions are unknown.", "El lugar y las condiciones del entrenamiento son desconocidos."],
    invalid: ["Saved venue evidence cannot be verified.", "No se puede verificar la información guardada del lugar."],
    unconfirmed: ["The actual workout venue is not confirmed.", "El lugar real del entrenamiento no está confirmado."],
    schedule_changed: ["The workout date or time changed, or this is not today's venue confirmation.", "Cambió la fecha u hora, o la confirmación del lugar no es de hoy."],
    time_missing: ["Planned workout time or venue timezone is unknown.", "La hora prevista o la zona horaria del lugar son desconocidas."],
    coordinates_missing: ["Outdoor venue coordinates are unknown.", "Las coordenadas del lugar exterior son desconocidas."],
    not_requested: ["No forecast was requested for this confirmed venue.", "No se ha solicitado un pronóstico para este lugar confirmado."],
    provider_unavailable: ["The venue forecast could not be retrieved.", "No se pudo obtener el pronóstico del lugar."],
    stale: ["The venue forecast is stale or its retrieval time cannot be verified.", "El pronóstico está desactualizado o no se puede verificar cuándo se obtuvo."],
    outside_horizon: ["The forecast does not cover the planned workout time closely enough.", "El pronóstico no cubre suficientemente la hora prevista del entrenamiento."],
    incomplete: ["The venue forecast is incomplete; conditions remain unknown.", "El pronóstico del lugar está incompleto; las condiciones siguen siendo desconocidas."],
    indoor: ["Indoor venue confirmed.", "Lugar interior confirmado."], forecast: ["Forecast available.", "Pronóstico disponible."],
  };
  return `${reasons[environment.reason][es ? 1 : 0]} ${es ? "Confirma el lugar y la hora; revisa las condiciones locales antes de empezar. No se asumen condiciones favorables." : "Confirm venue and time; check local conditions before starting. Favorable conditions are not assumed."}`;
}
/** Safe channel summary deliberately excludes precise location and saved free text. */
export function dailyEnvironmentSummary(environment: DailyEnvironmentAssessment, lang = "en"): string {
  const es = lang === "es";
  const timing = environment.fetchedAt ? `${es ? "Obtenido" : "Retrieved"}: ${environment.fetchedAt}; ${es ? "válido para" : "valid at"}: ${environment.validAt ?? "—"}.` : "";
  return [dailyEnvironmentGuidance(environment, lang), timing].filter(Boolean).join(" ");
}

/** Runtime response guard: malformed server/cache payloads never become evidence. */
export function isDailyEnvironmentAssessment(value: unknown): value is DailyEnvironmentAssessment {
  if (!object(value) || !["unknown", "indoor", "forecast"].includes(String(value.status)) || !["offline", "missing", "invalid", "unconfirmed", "schedule_changed", "time_missing", "coordinates_missing", "not_requested", "provider_unavailable", "stale", "outside_horizon", "incomplete", "indoor", "forecast"].includes(String(value.reason))) return false;
  if (value.revision !== null && (typeof value.revision !== "string" || !value.revision)) return false;
  if (value.forecastAgeMinutes !== null && (!Number.isInteger(value.forecastAgeMinutes) || (value.forecastAgeMinutes as number) < 0)) return false;
  for (const field of ["fetchedAt", "freshUntil", "validAt"]) if (value[field] !== null && !Number.isFinite(stamp(value[field]))) return false;
  if (value.context !== null && (!object(value.context) || typeof value.context.athleteId !== "string" || typeof value.context.sessionId !== "string" || !readDailyEnvironmentRecord(value.context, value.context.athleteId, value.context.sessionId))) return false;
  if (value.status === "forecast") return value.reason === "forecast" && object(value.context) && value.context.setting === "outdoor" && object(value.conditions) && number(value.conditions.temperatureC, -100, 70) && number(value.conditions.humidityPct, 0, 100) && number(value.conditions.windMs, 0, 150) && value.fetchedAt !== null && value.validAt !== null;
  if (value.conditions !== null) return false;
  return value.status === "indoor" ? value.reason === "indoor" && object(value.context) && value.context.setting === "indoor" : !["indoor", "forecast"].includes(String(value.reason));
}
