import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dayBounds } from "@/lib/dates";
import { sendTelegram } from "@/lib/notify";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/reminders/feedback-prompt — evening (or post-session) Telegram
// nudge asking how today's session went. One tap: the athlete replies
// 1 = easy / 2 = as expected / 3 = harder. The reply is ingested by the
// daily check-in scan (sessionFelt) so tomorrow's training adapts even if
// the athlete never reopens the app.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const when = url.searchParams.get("when") === "tomorrow" ? "tomorrow" : "today";

  const prefs = await prisma.reminderPref.findUnique({
    where: { userId: user.id },
  });
  if (!prefs?.telegramEnabled || !prefs.telegramChatId)
    return NextResponse.json(
      { error: "Connect Telegram in Reminders first." },
      { status: 400 },
    );

  const { start, end } = dayBounds(user.timezone);
  const session = await prisma.workout.findFirst({
    where: {
      userId: user.id,
      date: { gte: start, lt: end },
      planned: true,
      completed: false,
      durationMin: { gt: 0 },
    },
    orderBy: { date: "asc" },
    select: { id: true, title: true, durationMin: true },
  });

  const label = when === "tomorrow" ? "today's" : "today's";
  const text = session
    ? `🏋️ ${session.title} (${session.durationMin} min) — how did it feel?
Reply with a number:
1️⃣ Easier than expected
2️⃣ As expected
3️⃣ Harder than expected

(También puedes escribir una nota — KCoach la lee.)`
    : `☁️ Rest day — how does the body feel? Reply 1 (fresh) · 2 (ok) · 3 (beat up).`;

  const result = await sendTelegram(prefs.telegramChatId, text);
  await logEvent({
    kind: "info",
    source: "delivery",
    route: "/api/reminders/feedback-prompt",
    userId: user.id,
    message: `prompt sent for ${label} session`,
  });
  return NextResponse.json({ ok: result.ok, error: result.error });
}
