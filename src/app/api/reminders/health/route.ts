import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/reminders/health — is scheduled delivery actually alive, and what
// did the last deliveries look like? Surfaces the state that used to fail
// silently (cron secret missing → the schedule never sends for ANYONE).
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prefs = await prisma.reminderPref.findUnique({
    where: { userId: user.id },
  });
  const deliveries = await prisma.reminderDelivery.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    // Server-side delivery prerequisites:
    cronConfigured: Boolean(process.env.CRON_SECRET),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    smtpConfigured: Boolean(process.env.SMTP_HOST),
    // The user's own binding state:
    telegramBound: Boolean(prefs?.telegramChatId),
    reminderHour: prefs?.reminderHour ?? 17,
    // Recent delivery attempts (last 10, newest first):
    deliveries: deliveries.map((d) => ({
      channel: d.channel,
      day: d.day,
      status: d.status,
      error: d.error,
      at: d.createdAt,
    })),
  });
}
