import { createHash } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { dateKey, localDate } from "./dates";
import type { CanonicalSession } from "./canonical-session";

export const MANUAL_EMAIL_CONSENT = "manual-garmin-workout-email-v1";
export function manualEmailConfigured(env: NodeJS.ProcessEnv = process.env) {
  return env.ENABLE_MANUAL_WORKOUT_EMAIL === "true" && !!env.SMTP_HOST && !!env.SMTP_FROM && !!env.MANUAL_WORKOUT_EMAIL_ORIGIN;
}
export function manualEmailOrigin(env: NodeJS.ProcessEnv = process.env) {
  const url = new URL(env.MANUAL_WORKOUT_EMAIL_ORIGIN || "");
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw Error("Configure an HTTPS app origin");
  return url.origin;
}
export function manualEmailKey(userId: string, sessionId: string, revision: string, kind: string) {
  return createHash("sha256").update(JSON.stringify([MANUAL_EMAIL_CONSENT, userId, sessionId, revision, kind])).digest("hex");
}
export function parseManualEmailSettings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid preferences");
  const b = value as Record<string, unknown>;
  if (Object.keys(b).some(k => !["enabled", "daily", "revisions", "timezone", "minuteOfDay", "leadMinutes", "consentVersion", "calendarGuidance"].includes(k))) throw Error("Unknown preference");
  for (const k of ["enabled", "daily", "revisions"]) if (typeof b[k] !== "boolean") throw Error(`Choose ${k}`);
  if (b.calendarGuidance !== undefined && typeof b.calendarGuidance !== "boolean") throw Error("Choose calendar guidance");
  if (b.enabled && (!b.daily && !b.revisions)) throw Error("Choose an email purpose");
  if (b.enabled && b.consentVersion !== MANUAL_EMAIL_CONSENT) throw Error("Review and accept workout email contents");
  if (typeof b.timezone !== "string" || b.timezone.length > 100) throw Error("Choose an IANA timezone");
  try { new Intl.DateTimeFormat("en", { timeZone: b.timezone }).format(); } catch { throw Error("Choose an IANA timezone"); }
  if (!Number.isInteger(b.minuteOfDay) || Number(b.minuteOfDay) < 0 || Number(b.minuteOfDay) > 1439) throw Error("Choose a local send time");
  if (!Number.isInteger(b.leadMinutes) || Number(b.leadMinutes) < 30 || Number(b.leadMinutes) > 720) throw Error("Lead time must be 30–720 minutes");
  return { calendarGuidance: b.calendarGuidance === true, enabled: b.enabled as boolean, daily: b.daily as boolean, revisions: b.revisions as boolean, timezone: b.timezone, minuteOfDay: b.minuteOfDay as number, leadMinutes: b.leadMinutes as number };
}
export function eligibleManualEmail(pref: { enabled: boolean; recipient: string | null; verifiedAt: Date | null; consentVersion: string | null; consentAt: Date | null }, email: string) {
  return pref.enabled && pref.recipient === email && !!pref.verifiedAt && !!pref.consentAt && pref.consentVersion === MANUAL_EMAIL_CONSENT;
}
/** A daily message is sent at the earlier of preferred time and start minus lead.
 * Without a start time we cannot promise arrival before training. DST wall-clock
 * gaps are skipped rather than guessed; repeated times share one outbox key. */
export function manualEmailDue(input: { dateLocal: string; timezone: string; startTime: string | null; minuteOfDay: number; leadMinutes: number }, now = new Date()) {
  if (dateKey(now, input.timezone) !== input.dateLocal) return false;
  const hhmm = `${String(Math.floor(input.minuteOfDay / 60)).padStart(2, "0")}:${String(input.minuteOfDay % 60).padStart(2, "0")}`;
  const preferred = localDate(input.dateLocal, input.timezone, hhmm);
  if (formatInTimeZone(preferred, input.timezone, "HH:mm") !== hhmm) return false;
  if (!input.startTime) return now >= preferred;
  const start = localDate(input.dateLocal, input.timezone, input.startTime);
  if (formatInTimeZone(start, input.timezone, "HH:mm") !== input.startTime || now >= start) return false;
  return now.getTime() >= Math.min(preferred.getTime(), start.getTime() - input.leadMinutes * 60_000);
}
export function manualEmailActionable(session: CanonicalSession, workout: { approved: boolean; planned: boolean; completed: boolean; feedbackStatus?: string | null }, confirmedRevision: string | null) {
  return workout.approved && workout.planned && !workout.completed && !workout.feedbackStatus && confirmedRevision === session.revision && session.verdict === "ready" && session.capability.available && session.capability.downloadFormat !== "zip";
}

export function manualEmailChanged(previous: { revision: string; kind: string } | undefined, current: { revision: string; kind: string }) {
  return !!previous && (previous.revision !== current.revision || (previous.kind === "revised" ? "ready" : previous.kind) !== current.kind);
}
