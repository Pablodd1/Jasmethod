import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildReminder, sendReminder } from "@/lib/notify";
import { temperatureAdjustment } from "@/lib/adaptive";

// GET /api/reminders — reminder preferences + status
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = await prisma.reminderPref.findUnique({
    where: { userId: user.id },
  });
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return NextResponse.json({
    prefs: prefs ?? {
      emailEnabled: true,
      telegramEnabled: false,
      telegramChatId: null,
      reminderHour: 6,
      remindBeforeMin: 0,
    },
    telegramConfigured,
  });
}

// PUT /api/reminders — update preferences
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    const data: Record<string, any> = {};
    if (b.emailEnabled !== undefined)
      data.emailEnabled = Boolean(b.emailEnabled);
    if (b.telegramEnabled !== undefined)
      data.telegramEnabled = Boolean(b.telegramEnabled);
    if (b.telegramChatId !== undefined)
      data.telegramChatId = b.telegramChatId || null;
    if (b.reminderHour !== undefined)
      data.reminderHour = Math.max(
        0,
        Math.min(23, parseInt(b.reminderHour, 10)),
      );
    if (b.remindBeforeMin !== undefined)
      data.remindBeforeMin = Math.max(0, parseInt(b.remindBeforeMin, 10));
    const prefs = await prisma.reminderPref.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    return NextResponse.json({ ok: true, prefs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

export { POST } from "./send/route";
