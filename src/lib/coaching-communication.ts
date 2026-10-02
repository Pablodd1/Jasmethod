import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { dateKey, localDate, addDaysKey } from "./dates";

export const CONSENT_VERSION = "mock-coaching-v1";
export const TELEGRAM_CONSENT_VERSION = "telegram-coaching-v1";
export const REPLY_TTL_MS = 30 * 60_000;
export const PURPOSES = ["dailyPlan", "sessionFeedback", "missingData"] as const;
export type Purpose = typeof PURPOSES[number];
export const OPTIONAL_INPUTS = ["runBenchmark", "bikeBenchmark", "swimBenchmark", "distanceKm", "reps", "loadKg"] as const;
export interface CommunicationSettings {
  primaryChannel: "app" | "telegram" | "email"; paused: boolean;
  dailyPlan: boolean; sessionFeedback: boolean; missingData: boolean;
  timezone: string; minuteOfDay: number; quietStart: number; quietEnd: number;
  declinedOptional: string[];
}
export function mockCoachingEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ENABLE_MOCK_COACHING === "true" && env.COACHING_TRANSPORT === "mock" && env.VERCEL_ENV !== "production";
}
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Expected an object");
  return value as Record<string, unknown>;
}
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function parseCommunicationSettings(value: unknown): CommunicationSettings {
  const b = record(value);
  const allowed = ["primaryChannel", "paused", ...PURPOSES, "timezone", "minuteOfDay", "quietStart", "quietEnd", "declinedOptional", "consentVersion"];
  if (Object.keys(b).some(k => !allowed.includes(k))) throw Error("Unknown communication preference");
  if (typeof b.primaryChannel !== "string" || !["app", "telegram", "email"].includes(b.primaryChannel)) throw Error("Choose one primary channel");
  for (const k of ["paused", ...PURPOSES]) if (typeof b[k] !== "boolean") throw Error(`Choose an explicit value for ${k}`);
  if (typeof b.timezone !== "string" || b.timezone.length > 100) throw Error("Choose an IANA timezone");
  try { new Intl.DateTimeFormat("en", { timeZone: b.timezone }).format(); } catch { throw Error("Choose an IANA timezone"); }
  for (const k of ["minuteOfDay", "quietStart", "quietEnd"]) if (!Number.isInteger(b[k]) || Number(b[k]) < 0 || Number(b[k]) > 1439) throw Error(`Invalid ${k}`);
  if (b.quietStart === b.quietEnd) throw Error("Quiet hours must have different start and end times");
  if (!Array.isArray(b.declinedOptional) || b.declinedOptional.some(k => !OPTIONAL_INPUTS.includes(k)) || new Set(b.declinedOptional).size !== b.declinedOptional.length) throw Error("Invalid optional-input choices");
  if (PURPOSES.some(k => b[k]) && (typeof b.consentVersion !== "string" || ![CONSENT_VERSION, TELEGRAM_CONSENT_VERSION].includes(b.consentVersion))) throw Error("Review and accept the specific communication purposes");
  return { primaryChannel: b.primaryChannel, paused: b.paused, dailyPlan: b.dailyPlan, sessionFeedback: b.sessionFeedback,
    missingData: b.missingData, timezone: b.timezone, minuteOfDay: b.minuteOfDay, quietStart: b.quietStart,
    quietEnd: b.quietEnd, declinedOptional: b.declinedOptional } as CommunicationSettings;
}
export function localMinute(now: Date, timezone: string) {
  const [h, m] = formatInTimeZone(now, timezone, "HH:mm").split(":").map(Number); return h * 60 + m;
}
export function inQuietHours(minute: number, start: number, end: number) {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}
/** Earliest matching wall-clock minute; gaps move forward, repeated hours send once.
 * Quiet hours postpone (never send during them), retaining the original date key. */
export function scheduledInstant(day: string, settings: Pick<CommunicationSettings, "timezone" | "minuteOfDay" | "quietStart" | "quietEnd">) {
  if (!validDate(day)) throw Error("Invalid schedule date");
  const start = localDate(day, settings.timezone).getTime();
  let reached = false;
  for (let offset = 0; offset < 48 * 60; offset++) {
    const instant = new Date(start + offset * 60_000);
    const key = dateKey(instant, settings.timezone), minute = localMinute(instant, settings.timezone);
    if (key === day && minute >= settings.minuteOfDay) reached = true;
    if (reached && !inQuietHours(minute, settings.quietStart, settings.quietEnd)) return instant;
  }
  throw Error("No usable scheduled time");
}
export function dueSchedule(settings: CommunicationSettings, now = new Date()) {
  const today = dateKey(now, settings.timezone);
  if (settings.paused || inQuietHours(localMinute(now, settings.timezone), settings.quietStart, settings.quietEnd)) return null;
  for (const day of [today, addDaysKey(today, -1)]) {
    const at = scheduledInstant(day, settings);
    if (at <= now && now.getTime() - at.getTime() < 24 * 3600_000) return { day, at };
  }
  return null;
}
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export function newReplyToken(now = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), expiresAt: new Date(now.getTime() + REPLY_TTL_MS) };
}
export function tokenMatches(token: unknown, hash: string | null) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) || !hash || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashToken(token), "hex"), Buffer.from(hash, "hex"));
}
export function promptKey(userId: string, purpose: Purpose, sessionId: string, day: string) {
  return hashToken(JSON.stringify([CONSENT_VERSION, userId, purpose, sessionId, day]));
}
export interface MissingQuestion { key: string; question: string; consequence: string; optional: boolean; appOnly: boolean }
export function missingDataQuestions(input: { feedbackStatus?: string | null; actualDurationMin?: number | null; rpe?: number | null;
  sport: string; missingSafety?: string[]; planningMissing?: string[]; hasAnchor?: boolean; declinedOptional: string[] }): MissingQuestion[] {
  const questions: MissingQuestion[] = [];
  if (!input.feedbackStatus || input.feedbackStatus === "unknown") questions.push({ key: "status", question: "Was this selected session completed, partial, substituted, skipped, or unknown?", consequence: "Completion and recent training load stay unknown until you confirm an outcome.", optional: false, appOnly: false });
  if (input.feedbackStatus !== "skipped" && input.actualDurationMin == null) questions.push({ key: "minutes", question: "How many actual minutes did this selected session last? Unknown is allowed.", consequence: "A session-load estimate needs actual duration; planned minutes will not be substituted.", optional: false, appOnly: false });
  if (input.feedbackStatus !== "skipped" && input.rpe == null) questions.push({ key: "rpe", question: "What was overall session RPE: 1 very easy, 3 easy, 5 moderate, 7 hard, 9 very hard, 10 maximal?", consequence: "The duration × RPE load proxy remains unavailable without a reported effort.", optional: false, appOnly: false });
  const safetyQuestions: Record<string, string> = { sleep: "How was your sleep?", soreness: "How much muscle soreness do you have?", motivation: "How willing do you feel to train?", energy: "How is your energy or fatigue?", stress: "How much stress are you experiencing?", sick: "Do you have current illness symptoms?", newPain: "Do you have new or worsening focal pain?", urgentSymptoms: "Do you currently have chest discomfort, fainting, severe unexplained breathlessness, confusion or collapse?", availableMin: "How many minutes are available for training today?" };
  for (const key of input.missingSafety || []) questions.push({ key, question: `${safetyQuestions[key] || `Complete today's ${key} answer.`} Answer privately in the check-in.`, consequence: "Current safety, recovery and time uncertainty prevents a cleared workout.", optional: false, appOnly: true });
  for (const key of input.planningMissing || []) questions.push({ key: `setup:${key}`, question: `Complete athlete setup: ${key}.`, consequence: "Individualized progression remains on hold until this setup input is known.", optional: false, appOnly: true });
  const benchmark = ({ run: "runBenchmark", bike: "bikeBenchmark", swim: "swimBenchmark" } as Record<string, string>)[input.sport];
  if (benchmark && !input.hasAnchor && !input.declinedOptional.includes(benchmark)) questions.push({ key: benchmark, question: "Would you like to add an optional dated, relevant benchmark in the app?", consequence: "Without it, use effort/talk-test guidance rather than personalized numeric targets. No test is required.", optional: true, appOnly: true });
  return questions;
}
export interface ReplyCandidate { status: "completed" | "partial" | "substituted" | "skipped" | "unknown"; minutes: number | null; rpe: number | null; sport: string | null; declinedOptional: string[] }
export const ACTUAL_SPORTS = ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "boxing", "other"];
/** Deliberately bounded text grammar. Unclear/narrative/symptom answers stay in app. */
export function parseCoachingReply(text: unknown): ReplyCandidate {
  if (typeof text !== "string" || text.length > 600 || !text.trim()) throw Error("Use status=completed; minutes=30; rpe=5; sport=run, or answer in the app. Unknown is allowed.");
  const fields: Record<string, string> = {};
  for (const item of text.split(";")) {
    const match = item.trim().match(/^([A-Za-z]+)\s*=\s*([A-Za-z0-9,_-]+)$/);
    if (!match || fields[match[1]] !== undefined || !["status", "minutes", "rpe", "sport", "decline"].includes(match[1])) throw Error("Ambiguous reply. Use the labeled fields or answer in the app; no data was applied.");
    fields[match[1]] = match[2];
  }
  return validateCandidate({ status: fields.status, minutes: fields.minutes === "unknown" || fields.minutes === undefined ? null : Number(fields.minutes),
    rpe: fields.rpe === "unknown" || fields.rpe === undefined ? null : Number(fields.rpe), sport: fields.sport === "unknown" || fields.sport === undefined ? null : fields.sport,
    declinedOptional: fields.decline ? fields.decline.split(",") : [] });
}
export function validateCandidate(value: unknown): ReplyCandidate {
  const c = record(value);
  if (Object.keys(c).some(k => !["status", "minutes", "rpe", "sport", "declinedOptional"].includes(k))) throw Error("Unknown answer field");
  if (typeof c.status !== "string" || !["completed", "partial", "substituted", "skipped", "unknown"].includes(c.status)) throw Error("Choose a session outcome");
  if (c.minutes !== null && (!Number.isInteger(c.minutes) || Number(c.minutes) < 0 || Number(c.minutes) > 1440)) throw Error("Actual minutes must be 0–1440 or unknown");
  if (c.rpe !== null && (!Number.isInteger(c.rpe) || Number(c.rpe) < 1 || Number(c.rpe) > 10)) throw Error("RPE must be 1–10 or unknown");
  if (c.sport !== null && (typeof c.sport !== "string" || !ACTUAL_SPORTS.includes(c.sport))) throw Error("Choose an actual sport or unknown");
  if (!Array.isArray(c.declinedOptional) || c.declinedOptional.some(k => !OPTIONAL_INPUTS.includes(k))) throw Error("Invalid declined optional input");
  if (c.status === "skipped" && (c.minutes !== null || c.rpe !== null || c.sport !== null)) throw Error("A skipped session cannot report effort, minutes or another sport. Log other activity separately.");
  return c as unknown as ReplyCandidate;
}
export interface ReplyBinding { userId: string; sessionId: string; observationDate: string; sourceRevision: string; timezone: string;
  tokenHash: string | null; tokenExpiresAt: Date | null; tokenUsedAt: Date | null; status: string; replyStatus: string; channel: string }
export function verifyReplyBinding(prompt: ReplyBinding, input: { userId: string; sessionId: string; observationDate: string; sourceRevision: string; timezone: string; token: unknown;
  actorId: string; chatId: string; verifiedActorId: string; verifiedChatId: string }, now = new Date(), authenticatedReceipt = false) {
  if (prompt.userId !== input.userId || input.actorId !== input.verifiedActorId || input.chatId !== input.verifiedChatId) throw Error("Reply actor or private chat does not match");
  if (prompt.sessionId !== input.sessionId || prompt.observationDate !== input.observationDate || prompt.timezone !== input.timezone) throw Error("Reply session, local observation date or timezone does not match");
  if (prompt.sourceRevision !== input.sourceRevision) throw Error("Session revision changed; refresh and answer in the app");
  if (!["simulated", "sent"].includes(prompt.status) || prompt.replyStatus !== "none" || prompt.tokenUsedAt) throw Error("This reply has already been used or is unavailable");
  if (!prompt.tokenExpiresAt || prompt.tokenExpiresAt <= now || (!prompt.tokenHash || (!authenticatedReceipt && !tokenMatches(input.token, prompt.tokenHash)))) throw Error("Reply token is invalid or expired");
}
export type MockOutcome = "accepted" | "failed" | "unknown";
export function mockTransport(outcome: MockOutcome = "accepted") {
  if (outcome === "failed") return { status: "failed" as const, receiptId: null, error: "Mock transport rejected before acceptance. No external message was sent." };
  if (outcome === "unknown") return { status: "unknown" as const, receiptId: null, error: "Mock outcome is unknown. No automatic resend; no external message was sent." };
  return { status: "simulated" as const, receiptId: `mock:${randomBytes(12).toString("hex")}`, error: null };
}
