import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildReminder, sendReminder } from "@/lib/notify";
import { temperatureAdjustment } from "@/lib/adaptive";

// GET /api/reminders — reminder preferences + status
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = await prisma.reminderPref.findUnique({ where: { userId: user.id } });
  const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return NextResponse.json({
    prefs: prefs ?? { emailEnabled: true, telegramEnabled: false, telegramChatId: null, reminderHour: 6, remindBeforeMin: 0 },
    telegramConfigured,
  });
}

// PUT /api/reminders — update preferences
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    const data: Record<string, any> = {};
    if (b.emailEnabled !== undefined) data.emailEnabled = Boolean(b.emailEnabled);
    if (b.telegramEnabled !== undefined) data.telegramEnabled = Boolean(b.telegramEnabled);
    if (b.telegramChatId !== undefined) data.telegramChatId = b.telegramChatId || null;
    if (b.reminderHour !== undefined) data.reminderHour = Math.max(0, Math.min(23, parseInt(b.reminderHour, 10)));
    if (b.remindBeforeMin !== undefined) data.remindBeforeMin = Math.max(0, parseInt(b.remindBeforeMin, 10));
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

// POST /api/reminders/send — send today's reminder now (email + telegram)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const prefs = await prisma.reminderPref.findUnique({ where: { userId: user.id } });

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const session = await prisma.workout.findFirst({
      where: { userId: user.id, date: { gte: start, lt: end }, planned: true },
      orderBy: { date: "asc" },
    });

    // race temp for the next A-race (context for the reminder)
    let tempC: number | undefined;
    const race = await prisma.race.findFirst({ where: { userId: user.id, priority: 1, date: { gte: start } }, orderBy: { date: "asc" } });
    if (race?.targetTempC != null) tempC = race.targetTempC;

    const message = buildReminder(
      user.name,
      session ? { title: session.title, durationMin: session.durationMin, intensity: session.intensity || undefined, recovery: session.recovery || undefined } : null,
      tempC,
    );

    const emailEnabled = prefs?.emailEnabled ?? true;
    const telegramChatId = prefs?.telegramEnabled ? prefs.telegramChatId || undefined : undefined;
    if (!emailEnabled && !telegramChatId) return NextResponse.json({ ok: true, note: "All reminders disabled." });

    const result = await sendReminder(
      { email: user.email, name: user.name, telegramChatId },
      message,
    );
    return NextResponse.json({ ok: true, result, message: message.text });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
