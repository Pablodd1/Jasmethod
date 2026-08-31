import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail, dailyMotivationEmail } from "@/lib/email";
import { dailyMotivation } from "@/lib/science";

// POST /api/email/digest — send the daily motivation email to the user
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const mot = user.motivation;
    const style = mot?.style || "coach";
    const dayIndex = Math.floor(Date.now() / 86400000);
    const { quote, message } = dailyMotivation(dayIndex, style, user.language || "en");

    // Find today's planned session
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const todays = await prisma.workout.findFirst({
      where: { userId: user.id, date: { gte: start, lt: end }, planned: true },
      orderBy: { date: "asc" },
    });
    const sessionText = todays
      ? `${todays.title} — ${todays.durationMin} min (${todays.intensity || "Z2"})`
      : "Rest day or log your own session. Recovery is a training session too.";

    const { subject, html } = dailyMotivationEmail(user.name, quote, message, sessionText);
    const result = await sendEmail({ to: user.email, subject, html, userId: user.id });
    return NextResponse.json({ ok: result.ok, error: result.error || null, sessionText });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
