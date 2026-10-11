import nodemailer from "nodemailer";

export type SmokeResult = { status: "provider_accepted" | "rejected" | "unknown"; receiptId: string | null };
export const SMOKE_CONTENT = "JMM SMOKE TEST";
/** Conservative bare ASCII mailbox, shared with eligibility. Reject RFC address
 * list/group/comment/quoted syntax before Nodemailer can reinterpret a target. */
export function isSmokeEmailAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 254) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[A-Za-z0-9_+.-]+$/.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  return labels.length >= 2 && labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
const rejected = (): SmokeResult => ({ status: "rejected", receiptId: null });
const unknown = (): SmokeResult => ({ status: "unknown", receiptId: null });
const accepted = (receiptId: string): SmokeResult => ({ status: "provider_accepted", receiptId });
type Env = Record<string, string | undefined>;
type HttpOptions = { fetcher?: typeof fetch; env?: Env };
type MailResult = { accepted?: unknown[]; rejected?: unknown[]; messageId?: unknown };
type MailTransport = { sendMail: (message: { from: string; to: { address: string; name: string }; subject: string; text: string; html: string }) => Promise<MailResult>; close: () => void };
type MailOptions = { env?: Env; createTransport?: (options: Parameters<typeof nodemailer.createTransport>[0]) => MailTransport };
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const receipt = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\s\x00-\x1f\x7f]/.test(value);

/** Server-side adapters only. Authorization/owner/allowlist checks belong to the
 * calling service. Dependency injection is never read from request data.
 * One attempt, no retries: provider acceptance does not prove delivery or reading. */
export async function sendSmokeTelegram(chatId: string, options: HttpOptions = {}): Promise<SmokeResult> {
  const token = (options.env || process.env).TELEGRAM_BOT_TOKEN;
  // A private numeric recipient only; never accept group handles or URL segments.
  if (!/^[1-9]\d{0,15}$/.test(chatId) || !Number.isSafeInteger(Number(chatId)) || !token || !/^[A-Za-z0-9:_-]+$/.test(token)) return rejected();
  try {
    const response = await (options.fetcher || fetch)(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: SMOKE_CONTENT, link_preview_options: { is_disabled: true } }),
    });
    const data = object(await response.json());
    if (data?.ok === false) return rejected();
    const result = object(data?.result), chat = object(result?.chat);
    if (response.ok && !response.redirected && data?.ok === true && Number.isSafeInteger(result?.message_id) && Number(result?.message_id) > 0 && chat?.type === "private" && String(chat.id) === chatId && result?.text === SMOKE_CONTENT) return accepted(`telegram:${result!.message_id}`);
    return unknown();
  } catch { return unknown(); } // Never expose/log provider errors or credential-bearing URLs.
}

export async function sendSmokeEmail(to: string, options: MailOptions = {}): Promise<SmokeResult> {
  return sendSmokeEmailContent(to, SMOKE_CONTENT, options);
}

/** One explicitly consented message verifies the unverified saved address and
 * serves as its sole smoke email. It never enables ordinary email delivery. */
export async function sendSmokeEmailVerification(to: string, code: string, options: MailOptions = {}): Promise<SmokeResult> {
  if (typeof code !== "string" || code.length !== 12 || !/^[A-F0-9]{12}$/.test(code)) return rejected();
  const text = `${SMOKE_CONTENT}\nVerification code: ${code}\nEnter this code in your signed-in JMM smoke-test page within 15 minutes. This verifies this one test only and does not enable workout emails.`;
  return sendSmokeEmailContent(to, text, options);
}

async function sendSmokeEmailContent(to: string, text: string, options: MailOptions): Promise<SmokeResult> {
  const env = options.env || process.env;
  if (!isSmokeEmailAddress(to) || !env.SMTP_HOST || !env.SMTP_FROM) return rejected();
  let transport: MailTransport | undefined;
  try {
    const settings = { host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), secure: env.SMTP_SECURE === "true", requireTLS: env.SMTP_SECURE !== "true",
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      auth: { user: env.SMTP_USER || "", pass: env.SMTP_PASS || "" } };
    transport = options.createTransport ? options.createTransport(settings) : nodemailer.createTransport(settings);
    const result = await transport.sendMail({ from: env.SMTP_FROM, to: { address: to, name: "" }, subject: SMOKE_CONTENT, text, html: text.split("\n").map(line => `<p>${line}</p>`).join("") });
    const address = (value: unknown) => typeof value === "string" ? value.toLowerCase() : typeof object(value)?.address === "string" ? String(object(value)!.address).toLowerCase() : null;
    const acceptedAddresses = Array.isArray(result.accepted) ? result.accepted.map(address) : [];
    const rejectedAddresses = Array.isArray(result.rejected) ? result.rejected.map(address) : [];
    if (acceptedAddresses.length === 1 && acceptedAddresses[0] === to.toLowerCase() && rejectedAddresses.length === 0 && receipt(result.messageId)) return accepted(result.messageId);
    if (acceptedAddresses.length === 0 && rejectedAddresses.includes(to.toLowerCase())) return rejected();
    return unknown();
  } catch { return unknown(); }
  finally { try { transport?.close(); } catch { /* Closing cannot change the recorded send outcome. */ } }
}

export async function sendSmokeCalendar(input: { token: string; eventId: string; start: Date }, options: Pick<HttpOptions, "fetcher"> = {}): Promise<SmokeResult> {
  if (!input.token || /[\x00-\x20\x7f]/.test(input.token) || !/^[a-v0-9]{5,1024}$/.test(input.eventId) || !(input.start instanceof Date) || !Number.isFinite(input.start.getTime()) || !Number.isFinite(new Date(input.start.getTime() + 300_000).getTime())) return rejected();
  const start = input.start.toISOString(), end = new Date(input.start.getTime() + 300_000).toISOString();
  try {
    const response = await (options.fetcher || fetch)("https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: input.eventId, summary: SMOKE_CONTENT, description: SMOKE_CONTENT, visibility: "private", transparency: "transparent",
        start: { dateTime: start }, end: { dateTime: end }, reminders: { useDefault: false }, attendees: [], guestsCanInviteOthers: false, guestsCanModify: false, guestsCanSeeOtherGuests: false }),
    });
    if (!response.ok && response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status)) return rejected();
    const data = object(await response.json()), reminders = object(data?.reminders);
    const sameTime = (value: unknown, expected: string) => typeof value === "string" && Date.parse(value) === Date.parse(expected);
    if (response.ok && !response.redirected && data?.id === input.eventId && data.status === "confirmed" && data.summary === SMOKE_CONTENT && data.description === SMOKE_CONTENT && data.visibility === "private" && data.transparency === "transparent" &&
      (data.attendees === undefined || Array.isArray(data.attendees) && data.attendees.length === 0) && reminders?.useDefault === false &&
      (reminders.overrides === undefined || Array.isArray(reminders.overrides) && reminders.overrides.length === 0) &&
      sameTime(object(data.start)?.dateTime, start) && sameTime(object(data.end)?.dateTime, end)) return accepted(input.eventId);
    return unknown();
  } catch { return unknown(); }
}
