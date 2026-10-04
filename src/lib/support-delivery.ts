import { supportCategories, type SupportCategory } from "./support-contact";

export function supportTelegramConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!((env.ADMIN_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN) && /^-?\d+$/.test(env.ADMIN_TELEGRAM_CHAT_ID || ""));
}

export function parseSupportMessage(value: unknown): { category: SupportCategory; message: string } | null {
  if (!value || typeof value !== "object") return null;
  const { category, message } = value as Record<string, unknown>;
  if (typeof category !== "string" || !Object.hasOwn(supportCategories, category) || typeof message !== "string") return null;
  const text = message.trim();
  if (text.length < 10 || text.length > 1500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
  return { category: category as SupportCategory, message: text };
}

// Success means Telegram accepted a message into the configured admin chat,
// not that a human has read it. No health records or attachments are fetched.
export async function deliverSupportMessage(input: { category: SupportCategory; message: string; replyEmail: string }, env: Record<string, string | undefined> = process.env, send: typeof fetch = fetch): Promise<number | null> {
  if (!supportTelegramConfigured(env)) return null;
  try {
    const response = await send(`https://api.telegram.org/bot${env.ADMIN_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.ADMIN_TELEGRAM_CHAT_ID, text: `JMM support: ${supportCategories[input.category]}\nReply by email: ${input.replyEmail.slice(0, 254)}\n\n${input.message}`, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    return response.ok && result?.ok === true && Number.isSafeInteger(result.result?.message_id) && result.result.message_id > 0 && String(result.result?.chat?.id) === env.ADMIN_TELEGRAM_CHAT_ID ? result.result.message_id : null;
  } catch {
    return null; // Never expose provider responses containing credentials.
  }
}
