import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Never prerender — hits the Telegram API and the DB.
export const dynamic = "force-dynamic";

// Stable per-athlete pairing code: the athlete sends "/start <code>" (or the
// deep link prefills it) to our bot; the detect scan matches it to this user.
function pairingCode(userId: string): string {
  return createHash("sha256").update(`tg-pair:${userId}`).digest("hex").slice(0, 6).toUpperCase();
}

// GET /api/reminders/telegram-detect — pairing code + bot username for the UI.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    code: pairingCode(user.id),
    botUsername: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || null,
    configured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
  });
}

// POST /api/reminders/telegram-detect — scan the bot's recent messages for the
// athlete's pairing code, bind that chat to their account, enable Telegram.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Telegram auto-connect isn't activated on the server yet — paste your chat ID manually for now (see below).", code: "NO_TOKEN" },
      { status: 400 },
    );
  }

  const code = pairingCode(user.id);
  const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`).catch((e) => ({ ok: false, json: async () => ({ description: String(e) }) }));
  const data = await (updatesRes as Response).json();
  if (!data.ok) {
    return NextResponse.json({ error: `Telegram API error: ${data.description || "unknown"}`, code: "API_ERROR" }, { status: 502 });
  }

  const updates: any[] = data.result || [];
  const hit = updates
    .map((u: any) => u.message || u.edited_message)
    .find((m: any) => m?.chat?.id && String(m.text || "").toUpperCase().includes(code));

  if (!hit) {
    return NextResponse.json(
      { error: "No message with your code found yet — open the bot, send the code (the link below fills it in), then press Detect again.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const chatId = String(hit.chat.id);
  const firstName = hit.chat.first_name || "";
  await prisma.reminderPref.upsert({
    where: { userId: user.id },
    create: { userId: user.id, telegramEnabled: true, telegramChatId: chatId },
    update: { telegramEnabled: true, telegramChatId: chatId },
  });

  // Confirmation straight into the athlete's chat — instant positive feedback.
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: `✅ Connected! Your JasMiamiMethod daily reminders will arrive in this chat.` }),
  }).catch(() => {});

  return NextResponse.json({ ok: true, chatId, saved: true });
}
