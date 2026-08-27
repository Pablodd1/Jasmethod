// Training reminders — email (nodemailer) + Telegram (Bot API).
// Both are gated on env/config and never crash the caller.

import { sendEmail } from "./email";
import { buildSessionDetail } from "./science";

export async function sendTelegram(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN not configured" };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const data = await resp.json();
    if (!data.ok) return { ok: false, error: data.description || `Telegram HTTP ${resp.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e.message || e) };
  }
}

export interface ReminderMessage {
  subject: string;
  text: string;
  html: string;
}

export function buildReminder(name: string, session: { title: string; durationMin: number; intensity?: string; recovery?: string } | null, tempC?: number): ReminderMessage {
  const sessionLine = session
    ? `Today's session: ${session.title} — ${session.durationMin} min${session.intensity ? ` (${session.intensity})` : ""}.`
    : "Rest day — recovery is a training session too.";
  const tempLine = tempC !== undefined ? `Race-day temp ~${tempC}°C — ` : "";
  const recoveryLine = session?.recovery ? `\nAfter the session: ${session.recovery}` : "";
  const subject = `🏊🚴🏃 ${name} — ${session ? "Training reminder" : "Recovery day"}`;
  const text = `Good morning, ${name}.\n${sessionLine}\n${tempLine}Fuel 60-90g carbs/h on long sessions, hydrate early.\n${recoveryLine}`;
  const html = `<div style="font-family:system-ui;max-width:600px;margin:auto;background:#f0f9ff;border-radius:16px;padding:32px;border:1px solid #bae8ff">
    <h1 style="color:#175793;margin:0 0 8px">Good morning, ${name} ☀️</h1>
    <p style="color:#334155">${sessionLine}</p>
    ${tempLine ? `<p style="color:#334155">${tempLine}</p>` : ""}
    ${recoveryLine ? `<p style="background:#d8f1ff;padding:12px;border-radius:8px;color:#175793">${recoveryLine.replace(/\n/g, "<br/>")}</p>` : ""}
    <p style="color:#64748b;font-size:13px">Hydrate. Sleep 8h. You are building an engine.</p>
    <p style="color:#175793"><strong>— JasMiamiMethod Coach</strong></p>
  </div>`;
  return { subject, text, html };
}

export interface DailyPlanLine {
  title: string;
  durationMin: number;
  intensity?: string;
  type?: string;
  sport?: string;
  description?: string;
  recovery?: string;
}

export interface DailyPlanInput {
  name: string;
  dateLabel: string; // "tomorrow" | "Tuesday, Sep 1"
  sessions: DailyPlanLine[]; // empty = day off / no plan
  readiness?: { score: number; advice: string } | null;
  hydration?: string | null; // sweat-loss advice from yesterday's session weights
}

// Evening detailed plan (5pm default) — tomorrow's sessions in full, or the
// day-off protocol, plus a data-driven readiness recommendation.
export function buildDailyPlanMessage(inp: DailyPlanInput): ReminderMessage {
  const { name, dateLabel, sessions, readiness } = inp;
  const subject = `📋 ${name} — ${dateLabel}'s plan`;
  const lines: string[] = [`JASAI · ${dateLabel}'s training plan`];
  if (!sessions.length) {
    lines.push("");
    lines.push("☁️ DAY OFF — active recovery protocol (a day off is NOT zero):");
    lines.push("• 20 min Zone 1 in any modality — walk, spin, swim, stretch, yoga");
    lines.push("• Breathing: pick one, 2-5 min — box (4-4-4-4), physiological sigh, or 4-7-8");
    lines.push("• Sleep 8h. This IS the workout — recovery compounds.");
  } else {
    for (const s of sessions) {
      const detail = buildSessionDetail(
        { sport: s.sport || "run", type: s.type || "endurance", zone: s.intensity || "z2", minutes: s.durationMin, description: s.description || "" },
        s.recovery,
      );
      lines.push("");
      lines.push(`🏷 ${s.title}`);
      lines.push(`   ${s.durationMin} min · ${(s.intensity || "Z2").toUpperCase()} · ${s.type || ""}${s.sport ? ` · ${s.sport}` : ""}`);
      lines.push(`   🔥 WU: ${detail.wu}`);
      lines.push(`   ✅ MAIN: ${detail.main}`);
      lines.push(`   🧊 CD: ${detail.cd}`);
      lines.push(`   🧘 ${detail.breathing}`);
      lines.push(`   📚 Study: ${detail.study}`);
    }
  }
  if (readiness?.advice) lines.push("", `🧬 Readiness: ${readiness.advice}`);
  if (inp.hydration) lines.push("", `💧 ${inp.hydration}`);
  lines.push("", "— JasMiamiMethod Coach");
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui;max-width:600px;margin:auto;background:#f0f9ff;border-radius:16px;padding:32px;border:1px solid #bae8ff">
    <h2 style="color:#175793;margin:0 0 12px">${subject}</h2>
    <div style="white-space:pre-wrap;color:#334155;font-size:14px;line-height:1.5">${text.replace(/</g, "&lt;")}</div>
  </div>`;
  return { subject, text, html };
}

export async function sendReminder(
  opts: { email: string; name: string; telegramChatId?: string },
  message: ReminderMessage,
): Promise<{ email: { ok: boolean; error?: string }; telegram: { ok: boolean; error?: string } | null }> {
  const email = await sendEmail({ to: opts.email, subject: message.subject, html: message.html, text: message.text });
  let telegram: { ok: boolean; error?: string } | null = null;
  if (opts.telegramChatId) telegram = await sendTelegram(opts.telegramChatId, message.text);
  return { email, telegram };
}
