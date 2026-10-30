import nodemailer from "nodemailer";
import { coachTextConfigured } from "./coach-text-provider";
import { manualEmailOrigin } from "./manual-workout-email";

type Environment = Record<string, string | undefined>;
export type IntegrationCheck = { state: "configured" | "verified" | "missing" | "failed" | "conflict"; detail: string; missing?: string[]; botUsername?: string };
export type LaunchChecks = { openai: IntegrationCheck; email: IntegrationCheck; telegram: IntegrationCheck };
const present = (env: Environment, key: string) => Boolean(env[key]?.trim());
/** Fixed provider names only. Never expose arbitrary host strings or authentication values. */
function smtpProviderDetail(env: Environment): string {
  const host = env.SMTP_HOST?.trim().toLowerCase();
  const provider = host === "smtp-relay.brevo.com" || host === "smtp-relay.sendinblue.com" ? "Brevo"
    : host === "smtp.gmail.com" ? "Google Gmail"
    : host === "smtp.office365.com" ? "Microsoft 365"
    : host === "smtp.sendgrid.net" ? "SendGrid"
    : host === "smtp.resend.com" ? "Resend" : null;
  return provider ? `Configured SMTP provider: ${provider}. ` : "SMTP provider is not identified by the safe host allowlist. ";
}
export function telegramWebhookTarget(env: Environment): string | null {
  try {
    const url = new URL(env.APP_URL || env.NEXT_PUBLIC_APP_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return `${url.origin}/api/coaching/telegram/webhook`;
  } catch { return null; }
}
export function launchConfiguration(env: Environment = process.env): LaunchChecks {
  const emailMissing = ["SMTP_HOST", "SMTP_FROM", "MANUAL_WORKOUT_EMAIL_ORIGIN"].filter(key => !present(env, key));
  if (present(env, "MANUAL_WORKOUT_EMAIL_ORIGIN")) { try { manualEmailOrigin(env); } catch { emailMissing.push("valid HTTPS MANUAL_WORKOUT_EMAIL_ORIGIN"); } }
  if (env.ENABLE_MANUAL_WORKOUT_EMAIL !== "true") emailMissing.push("ENABLE_MANUAL_WORKOUT_EMAIL=true");
  const telegramMissing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_COACHING_WEBHOOK_SECRET"].filter(key => !present(env, key));
  if (present(env, "TELEGRAM_COACHING_WEBHOOK_SECRET") && !/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_COACHING_WEBHOOK_SECRET!)) telegramMissing.push("valid URL-safe TELEGRAM_COACHING_WEBHOOK_SECRET");
  if (env.ENABLE_TELEGRAM_COACHING !== "true") telegramMissing.push("ENABLE_TELEGRAM_COACHING=true");
  if (env.ENABLE_AUTOMATED_DELIVERY !== "true") telegramMissing.push("ENABLE_AUTOMATED_DELIVERY=true");
  if (env.COACHING_TRANSPORT !== "telegram") telegramMissing.push("COACHING_TRANSPORT=telegram");
  if (!telegramWebhookTarget(env)) telegramMissing.push("HTTPS app origin");
  const username = env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || "";
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) telegramMissing.push("valid TELEGRAM_BOT_USERNAME");
  const aiMissing = present(env, "OPENAI_API_KEY") ? [] : ["OPENAI_API_KEY"];
  if (env.EXTERNAL_AI_ENABLED !== "true") aiMissing.push("EXTERNAL_AI_ENABLED=true");
  if (!aiMissing.length && !coachTextConfigured(env)) aiMissing.push("valid OpenAI key and supported OPENAI_TEXT_MODEL");
  return {
    openai: { state: aiMissing.length ? "missing" : "configured", missing: aiMissing,
      detail: "Configuration only. A successful consented chat is required to verify OpenAI." },
    email: { state: emailMissing.length ? "missing" : "configured", missing: emailMissing,
      detail: smtpProviderDetail(env) + "Athletes must verify their own email and opt in. SMTP acceptance is not inbox delivery." },
    telegram: { state: telegramMissing.length ? "missing" : "configured", missing: telegramMissing,
      detail: "Athletes must pair their private chat and opt in. A bot receipt does not prove it was read." },
  };
}

type TelegramRequest = (method: "getMe" | "getWebhookInfo" | "setWebhook", body?: Record<string, unknown>) => Promise<unknown>;
function telegramRequest(env: Environment): TelegramRequest {
  return async (method, body) => {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new Error("Telegram request failed");
    const result = await response.json();
    if (result?.ok !== true) throw new Error("Telegram rejected request");
    return result.result;
  };
}
function webhookInfo(value: unknown): { url: string } {
  if (!value || typeof value !== "object" || !("url" in value) || typeof value.url !== "string") throw new Error("Invalid webhook response");
  return { url: value.url };
}
export async function checkTelegramWebhook(configure: boolean, env: Environment = process.env, request: TelegramRequest = telegramRequest(env)): Promise<IntegrationCheck> {
  const config = launchConfiguration(env).telegram;
  if (config.state === "missing" && config.missing?.some(key => key !== "valid TELEGRAM_BOT_USERNAME")) return config;
  const target = telegramWebhookTarget(env)!;
  try {
    const [bot, webhook] = await Promise.all([request("getMe"), request("getWebhookInfo")]);
    if (!bot || typeof bot !== "object" || !("is_bot" in bot) || bot.is_bot !== true || !("username" in bot) || typeof bot.username !== "string" || !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(bot.username)) throw new Error("Invalid bot response");
    const expectedUsername = env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || "";
    if (expectedUsername.toLowerCase() !== bot.username.toLowerCase()) return { state: "failed", detail: "Configured pairing username does not match the bot authenticated by Telegram. Correct the bot username and redeploy before pairing.", botUsername: bot.username };
    const current = webhookInfo(webhook);
    if (current.url && current.url !== target) return { state: "conflict", detail: "This bot already has a different webhook. It was not replaced. Review the existing bot integration first." };
    if (!configure) return current.url === target
      ? { state: "verified", detail: "Telegram recognizes the bot and the JMM webhook URL. Private-chat delivery still needs an athlete test." }
      : { state: "configured", detail: "Telegram recognizes the bot. Register the JMM webhook, then pair your private chat." };
    const secret = env.TELEGRAM_COACHING_WEBHOOK_SECRET || "";
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return { state: "failed", detail: "Webhook secret must contain 32–256 URL-safe characters." };
    if (await request("setWebhook", { url: target, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: false }) !== true)
      throw new Error("Webhook registration not confirmed");
    const after = webhookInfo(await request("getWebhookInfo"));
    return after.url === target
      ? { state: "verified", detail: "JMM webhook registered and its URL confirmed by Telegram. Pair your private chat and test delivery next." }
      : { state: "failed", detail: "Webhook registration could not be confirmed. No delivery is claimed." };
  } catch { return { state: "failed", detail: "Telegram verification failed or timed out. No raw provider error or credential is exposed." }; }
}
async function verifySmtp(env: Environment): Promise<boolean> {
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === "true", requireTLS: env.SMTP_SECURE !== "true",
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    auth: { user: env.SMTP_USER || "", pass: env.SMTP_PASS || "" } });
  try { return await transport.verify(); } finally { transport.close(); }
}
/** Allowlisted categories only: SMTP errors can contain credentials or server responses. */
function smtpFailureDetail(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "EAUTH") return "SMTP authentication was rejected. Review SMTP_USER, SMTP_PASS and the mail provider's authorization settings. No email was sent.";
  if (code === "EDNS" || code === "ENOTFOUND") return "SMTP host lookup failed. Review SMTP_HOST. No email was sent.";
  if (code === "ETIMEDOUT") return "SMTP connection timed out. Review the mail provider's host, port and connection availability. No email was sent.";
  if (["ECONNECTION", "ECONNREFUSED", "ESOCKET", "ETLS", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "ERR_SOCKET_BAD_PORT"].includes(String(code)))
    return "SMTP connection or TLS verification failed. Review SMTP_HOST, SMTP_PORT, SMTP_SECURE and the provider's certificate. No email was sent.";
  return "SMTP verification failed or timed out. No email was sent.";
}
export async function probeLaunchIntegrations(env: Environment = process.env, dependencies: { smtp?: () => Promise<boolean>; telegram?: TelegramRequest } = {}): Promise<LaunchChecks> {
  const config = launchConfiguration(env);
  const [email, telegram] = await Promise.all([
    (async (): Promise<IntegrationCheck> => {
      if (config.email.state === "missing") return config.email;
      try {
        return await (dependencies.smtp ? dependencies.smtp() : verifySmtp(env))
          ? { state: "verified", detail: smtpProviderDetail(env) + "SMTP connection, TLS and authentication verified. No email was sent; inbox delivery remains unverified." }
          : { state: "failed", detail: smtpProviderDetail(env) + "SMTP verification was not confirmed. No email was sent." };
      } catch (error) { return { state: "failed", detail: smtpProviderDetail(env) + smtpFailureDetail(error) }; }
    })(),
    checkTelegramWebhook(false, env, dependencies.telegram),
  ]);
  return { openai: config.openai, email, telegram };
}
