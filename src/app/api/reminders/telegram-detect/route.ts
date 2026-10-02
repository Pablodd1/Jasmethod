import { NextResponse } from "next/server";
import { telegramPairingCode, matchesTelegramPairing } from "@/lib/telegram-pairing";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Never prerender — hits the Telegram API and the DB.
export const dynamic = "force-dynamic";

// Short-lived HMAC pairing codes are bound to this authenticated athlete.
// A public user ID cannot be used to compute a pairing code.
// GET /api/reminders/telegram-detect — pairing code + bot username for the UI.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    code: process.env.TELEGRAM_BOT_TOKEN ? telegramPairingCode(user.id, process.env.TELEGRAM_BOT_TOKEN) : "",
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
      { error: "Telegram auto-connect isn't activated on the server yet — manual chat IDs cannot enable delivery.", code: "NO_TOKEN" },
      { status: 400 },
    );
  }

  const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`).catch((e) => ({ ok: false, json: async () => ({ description: String(e) }) }));
  const data = await (updatesRes as Response).json();
  if (!data.ok) {
    return NextResponse.json({ error: `Telegram API error: ${data.description || "unknown"}`, code: "API_ERROR" }, { status: 502 });
  }

  const updates: any[] = data.result || [];
  const hit = updates
    .map((u: any) => u.message || u.edited_message)
    .find((m: any) => matchesTelegramPairing(m, user.id, token));

  if (!hit) {
    return NextResponse.json(
      { error: "No message with your code found yet — open the bot, send the code (the link below fills it in), then press Detect again.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const chatId = String(hit.chat.id);
  await prisma.reminderPref.upsert({
    where: { userId: user.id },
    create: { userId: user.id, emailEnabled: false, telegramEnabled: true, telegramChatId: chatId },
    update: { emailEnabled: false, telegramEnabled: true, telegramChatId: chatId },
  });


  return NextResponse.json({ ok: true, chatId, saved: true });
}
