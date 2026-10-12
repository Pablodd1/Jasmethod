import { timingSafeEqual } from "node:crypto";
export type TelegramPartReceipt = { kind: "text" | "fit" | "graphic"; status: "sent" | "failed" | "unknown"; receiptId: string | null };
export type TelegramTransportResult = { status: "sent" | "partial" | "failed" | "unknown"; receiptId: string | null; error: string | null; parts?: TelegramPartReceipt[] };
export type TelegramWorkoutAttachment = { kind: "fit" | "graphic"; bytes: Uint8Array; filename: string; caption: string };
type TelegramOptions = { fetcher?: typeof fetch; env?: Record<string, string | undefined>; expectsReply?: boolean; attachments?: TelegramWorkoutAttachment[]; beforeSend?: () => Promise<void> };
export function telegramCoachingEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ENABLE_TELEGRAM_COACHING === "true" && env.ENABLE_AUTOMATED_DELIVERY === "true" && env.COACHING_TRANSPORT === "telegram";
}
export function telegramCoachingConfigured(env: Record<string, string | undefined> = process.env) {
  return telegramCoachingEnabled(env) && Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_COACHING_WEBHOOK_SECRET);
}
export function verifyTelegramWebhookSecret(header: string | null, env: Record<string, string | undefined> = process.env) {
  const expected = env.TELEGRAM_COACHING_WEBHOOK_SECRET;
  if (!expected || !header || header.length > 256 || Buffer.byteLength(expected) !== Buffer.byteLength(header)) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
/** Fixed official endpoint. Injection exists only as a server-side function
 * argument for tests; no route/setting accepts an endpoint or HTTP client. */
async function sendTelegramPart(chatId: string, text: string, options: TelegramOptions, attachment?: TelegramWorkoutAttachment): Promise<TelegramTransportResult> {
  const env = options.env || process.env;
  if (!telegramCoachingConfigured(env)) return { status: "failed", receiptId: null, error: "Telegram coaching is disabled or unconfigured; no request was sent." };
  if (!/^\d{1,20}$/.test(chatId) || text.length > 4096 || !text.trim()) return { status: "failed", receiptId: null, error: "Invalid private recipient or oversized message; no request was sent." };
  try {
    await options.beforeSend?.();
  } catch {
    return { status: "failed", receiptId: null, error: "Delivery authorization or current workout changed; no request was sent." };
  }
  const multipart = attachment ? new FormData() : null;
  if (multipart && attachment) {
    multipart.append("chat_id", chatId);
    multipart.append("caption", attachment.caption);
    multipart.append(attachment.kind === "fit" ? "document" : "photo", new Blob([new Uint8Array(attachment.bytes)], { type: attachment.kind === "fit" ? "application/octet-stream" : "image/png" }), attachment.filename);
  }
  try {
    const response = await (options.fetcher || fetch)(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${attachment ? attachment.kind === "fit" ? "sendDocument" : "sendPhoto" : "sendMessage"}`, {
      method: "POST", headers: multipart ? undefined : { "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(15_000),
      body: multipart || JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...(options.expectsReply ? { reply_markup: { force_reply: true, selective: true, input_field_placeholder: "status=completed; minutes=30; rpe=5" } } : {}) }),
    });
    let result: unknown; try { result = await response.json(); } catch { return { status: "unknown", receiptId: null, error: "Telegram returned an unreadable response; acceptance is unknown. Do not automatically resend." }; }
    const data = result as { ok?: unknown; result?: { message_id?: unknown; chat?: { id?: unknown } }; error_code?: unknown };
    if (data?.ok === false) return { status: "failed", receiptId: null, error: `Telegram rejected the request${typeof data.error_code === "number" ? ` (code ${data.error_code})` : ""}. No message acceptance was reported.` };
    if (response.ok && data?.ok === true && Number.isSafeInteger(data.result?.message_id) && Number(data.result?.message_id) > 0 && String(data.result?.chat?.id) === chatId) return { status: "sent", receiptId: `telegram:${data.result!.message_id}`, error: null };
    return { status: "unknown", receiptId: null, error: "Telegram acceptance or recipient could not be verified. Do not automatically resend." };
  } catch {
    // Never log/return a URL, response description or exception: it may contain
    // the bot credential, private message or provider request body.
    return { status: "unknown", receiptId: null, error: "Telegram request was interrupted; acceptance is unknown. Check receipts before any retry." };
  }
}
/** Each accepted part has its own receipt. A partial or ambiguous attempt is
 * terminal: retrying the bundle would duplicate an already accepted message. */
export async function sendTelegramCoaching(chatId: string, text: string, options: TelegramOptions = {}): Promise<TelegramTransportResult> {
  const attachments = options.attachments || [];
  if (attachments.length > 2 || new Set(attachments.map(a => a.kind)).size !== attachments.length || attachments.some(a =>
    !["fit", "graphic"].includes(a.kind) || !a.bytes?.length || a.bytes.length > 5_000_000 ||
    !/^[A-Za-z0-9._-]{1,180}$/.test(a.filename) || !a.filename.endsWith(a.kind === "fit" ? ".fit" : ".png") || a.caption.length > 1024)) {
    return { status: "failed", receiptId: null, error: "Invalid workout attachment; no request was sent." };
  }
  const first = await sendTelegramPart(chatId, text, options);
  if (!attachments.length || first.status !== "sent") return first;
  const parts: TelegramPartReceipt[] = [{ kind: "text", status: "sent", receiptId: first.receiptId }];
  for (const attachment of attachments) {
    const result = await sendTelegramPart(chatId, text, options, attachment);
    parts.push({ kind: attachment.kind, status: result.status as TelegramPartReceipt["status"], receiptId: result.receiptId });
    if (result.status !== "sent") return { status: result.status === "unknown" ? "unknown" : "partial", receiptId: first.receiptId,
      error: "Some parts were accepted; remaining workout delivery is incomplete or uncertain. Do not automatically resend. Device transfer and reading are unverified.", parts };
  }
  return { ...first, parts };
}
export function parseTelegramUpdate(value: unknown, now = new Date()) {
  const b = value as { update_id?: unknown; message?: { forward_origin?: unknown; forward_from?: unknown; forward_date?: unknown; is_automatic_forward?: unknown; reply_to_message?: { message_id?: unknown; from?: { is_bot?: unknown }; chat?: { id?: unknown }; forward_origin?: unknown; forward_from?: unknown; forward_date?: unknown }; text?: unknown; date?: unknown; from?: { id?: unknown; is_bot?: unknown }; chat?: { id?: unknown; type?: unknown } } } | null;
  const m = b?.message;
  if (!b || !Number.isSafeInteger(b.update_id) || Number(b.update_id) < 0 || !m || m.forward_origin || m.forward_from || m.forward_date || m.is_automatic_forward || typeof m.text !== "string" || m.text.length > 1400 ||
    !Number.isSafeInteger(m.date) || typeof m.date !== "number" || m.date * 1000 > now.getTime() + 30_000 || now.getTime() - m.date * 1000 > 5 * 60_000 ||
    m.chat?.type !== "private" || !Number.isSafeInteger(m.chat.id) || !Number.isSafeInteger(m.from?.id) || m.from?.is_bot === true ||
    String(m.chat.id) !== String(m.from?.id) || !/^\d{1,20}$/.test(String(m.chat.id))) throw Error("Expected a fresh private message from its matching human sender");
  const start = m.text.trim().match(/^\/start(?:@[A-Za-z0-9_]+)? ([A-Za-z0-9_-]{43})$/);
  if (start) return { kind: "pair" as const, token: start[1], actorId: String(m.from!.id), chatId: String(m.chat.id), updateId: b.update_id as number };
  if (m.reply_to_message) {
    const reply = m.reply_to_message;
    if (!Number.isSafeInteger(reply.message_id) || Number(reply.message_id) <= 0 || reply.from?.is_bot !== true || String(reply.chat?.id) !== String(m.chat.id) || reply.forward_origin || reply.forward_from || reply.forward_date) throw Error("Reply directly to the original coaching message in this private chat");
    return { kind: "nativeReply" as const, receiptId: `telegram:${reply.message_id}`, text: m.text.trim(), actorId: String(m.from!.id), chatId: String(m.chat.id), updateId: b.update_id as number };
  }
  const reply = m.text.trim().match(/^\/reply ([A-Za-z0-9_-]{43}) ([A-Za-z0-9_-]{1,120}) (\d{4}-\d{2}-\d{2}) ([a-f0-9]{64})\s+([\s\S]+)$/);
  if (!reply) throw Error("Use the exact session-bound reply command or answer in the app");
  return { kind: "reply" as const, token: reply[1], sessionId: reply[2], observationDate: reply[3], sourceRevision: reply[4], text: reply[5],
    actorId: String(m.from!.id), chatId: String(m.chat.id), updateId: b.update_id as number };
}

/** Keep whole source lines, metadata and authenticated app links. An abbreviated
 * notification never presents itself as the full prescription. */
export function boundedTelegramMessage(message: string, replyCommand = "") {
  const limit = 4096;
  if ((message + replyCommand).length <= limit) return message + replyCommand;
  const lines = message.split("\n");
  const footer = lines.splice(Math.max(1, lines.length - 3));
  const note = "Concise summary shortened; review every step and target in the authenticated app before training.";
  const tail = `\n${note}\n${footer.join("\n")}${replyCommand}`;
  if (tail.length >= limit) throw Error("Telegram metadata exceeds the message limit");
  const kept: string[] = [];
  let length = tail.length;
  for (const line of lines) { if (length + line.length + 1 > limit) break; kept.push(line); length += line.length + 1; }
  return kept.join("\n") + tail;
}
