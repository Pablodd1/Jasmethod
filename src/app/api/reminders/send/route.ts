import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dayBounds, addDaysKey } from "@/lib/dates";
import { trainingReminder } from "@/lib/training-reminder";
import { sendReminder } from "@/lib/notify";
import { rateLimit } from "@/lib/ratelimit";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = await prisma.reminderPref.findUnique({
    where: { userId: user.id },
  });
  if (!prefs || (!prefs.emailEnabled && !prefs.telegramEnabled))
    return Response.json(
      { error: "Enable a delivery channel first." },
      { status: 400 },
    );
  if (!rateLimit(`reminder:${user.id}`, 3, 60000).ok)
    return Response.json(
      { error: "Please wait before sending another reminder." },
      { status: 429 },
    );
  const b = await req.json().catch(() => ({})),
    day = dayBounds(user.timezone),
    key = b.when === "tomorrow" ? addDaysKey(day.key, 1) : day.key;
  const message = await trainingReminder(user, key),
    result = await sendReminder(
      {
        email: prefs.emailEnabled && !prefs.telegramEnabled ? user.email : undefined,
        name: user.name,
        telegramChatId: prefs.telegramEnabled
          ? prefs.telegramChatId || undefined
          : undefined,
      },
      message,
    );
  return Response.json({
    ok: result.email.ok || result.telegram?.ok === true,
    result,
  });
}
