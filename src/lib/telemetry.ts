// JasMiamiMethod — Telemetry, metering & cost estimation
//
// Self-hosted observability (no third-party service):
//   AppEvent     — error/warn/info ledger (client + server + cron)
//   UsageCounter — per-user, per-day, per-metric consumption counters
//
// Critical errors alert the OWNER's Telegram instantly (rate-limited).
// Cost estimates come from a transparent, editable price table below —
// they are ESTIMATES for planning, not invoices.

import { prisma } from "./db";

export type EventKind = "error" | "warn" | "info";
export type EventSource = "client" | "server" | "cron" | "sync" | "ai" | "delivery";

export interface LogEventInput {
  kind: EventKind;
  source: EventSource;
  route?: string;
  userId?: string | null;
  message: string;
  meta?: Record<string, unknown>;
}

// ---- Event ledger ----
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    await prisma.appEvent.create({
      data: {
        kind: input.kind,
        source: input.source,
        route: input.route ?? null,
        userId: input.userId ?? null,
        message: input.message.slice(0, 500),
        meta: input.meta ? JSON.stringify(input.meta).slice(0, 4000) : null,
      },
    });
  } catch (e) {
    // Telemetry must never break the request.
    console.error("[telemetry] logEvent failed:", String(e).slice(0, 120));
  }
}

// ---- Owner Telegram alerts (rate-limited per kind) ----
const lastAlertAt = new Map<string, number>();
const ALERT_COOLDOWN_MS = 30 * 60000; // max one alert per kind per 30 min

export async function alertOwner(
  kind: string,
  message: string,
  opts: { cooldownMin?: number } = {},
): Promise<void> {
  try {
    const cooldown = (opts.cooldownMin ?? 30) * 60000;
    const last = lastAlertAt.get(kind) || 0;
    if (Date.now() - last < cooldown) return;
    // Cross-instance durable check: skip if we already alerted for this kind
    // in the cooldown window (serverless = multiple instances).
    const recent = await prisma.appEvent.count({
      where: {
        kind: "error",
        route: `alert:${kind}`,
        createdAt: { gte: new Date(Date.now() - cooldown) },
      },
    });
    if (recent > 0) return;

    const admins = await prisma.user.findMany({
      where: { role: "admin" },
      select: { reminder: { select: { telegramChatId: true } } },
    });
    const chatIds = admins
      .map((a) => a.reminder?.telegramChatId)
      .filter((x): x is string => !!x);
    if (!chatIds.length) return;

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    await Promise.all(
      chatIds.map((chatId) =>
        fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🚨 [${kind}]\n${message.slice(0, 500)}`,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10000),
        }).catch(() => {}),
      ),
    );
    lastAlertAt.set(kind, Date.now());
    await logEvent({
      kind: "error",
      source: "server",
      route: `alert:${kind}`,
      message: message.slice(0, 300),
    });
  } catch {
    // never throw from the alerter
  }
}

// ---- Usage metering ----
export type UsageMetric =
  | "ai_calls"
  | "ai_input_tokens"
  | "ai_output_tokens"
  | "db_rows_synced"
  | "fit_exports"
  | "telegram_msgs"
  | "email_sends"
  | "gpx_uploads";

export async function meterUsage(
  userId: string,
  metric: UsageMetric,
  count = 1,
  day?: string,
): Promise<void> {
  try {
    const key = day ?? new Date().toISOString().slice(0, 10);
    await prisma.usageCounter.upsert({
      where: { userId_day_metric: { userId, day: key, metric } },
      create: { userId, day: key, metric, count },
      update: { count: { increment: count } },
    });
  } catch (e) {
    console.error("[telemetry] meterUsage failed:", String(e).slice(0, 120));
  }
}

// ---- Cost model (EDITABLE — planning estimates, not invoices) ----
export const COST_TABLE = {
  ai_input_per_1m_tokens: 0.1, // Gemini Flash-class list price
  ai_output_per_1m_tokens: 0.4,
  email_per_send: 0.001, // SMTP marginal/infra amortization
  telegram_per_send: 0, // bot API is free
  db_gb_month: 0.125, // Supabase Pro per-GB overage reference
  fit_export_per: 0,
  gpx_upload_per: 0,
} as const;

export interface UsageTotals {
  ai_calls: number;
  ai_input_tokens: number;
  ai_output_tokens: number;
  db_rows_synced: number;
  fit_exports: number;
  telegram_msgs: number;
  email_sends: number;
  gpx_uploads: number;
}

export function estimateMonthlyCostUsd(t: UsageTotals): number {
  return +(
    (t.ai_input_tokens / 1_000_000) * COST_TABLE.ai_input_per_1m_tokens +
    (t.ai_output_tokens / 1_000_000) * COST_TABLE.ai_output_per_1m_tokens +
    t.email_sends * COST_TABLE.email_per_send +
    t.telegram_msgs * COST_TABLE.telegram_per_send +
    t.fit_exports * COST_TABLE.fit_export_per +
    t.gpx_uploads * COST_TABLE.gpx_upload_per
  ).toFixed(4);
}
