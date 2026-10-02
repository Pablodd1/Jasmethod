import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { automatedDeliveryEnabled } from "@/lib/capabilities";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefs = await prisma.reminderPref.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ prefs: prefs ?? { emailEnabled: false, telegramEnabled: false,
    telegramChatId: null, reminderHour: 17, remindBeforeMin: 0 },
    automatedDeliveryEnabled: automatedDeliveryEnabled(), telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN) });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) return NextResponse.json({ error: "Invalid preferences" }, { status: 400 });
  const previous = await prisma.reminderPref.findUnique({ where: { userId: user.id } });
  const data: { emailEnabled?: boolean; telegramEnabled?: boolean; telegramChatId?: string | null; reminderHour?: number; remindBeforeMin?: number } = {};
  for (const key of ["emailEnabled", "telegramEnabled"] as const) {
    if (b[key] === undefined) continue;
    if (typeof b[key] !== "boolean") return NextResponse.json({ error: `${key} must be true or false` }, { status: 400 });
    data[key] = b[key];
  }
  for (const [key, max] of [["reminderHour", 23], ["remindBeforeMin", 360]] as const) {
    if (b[key] === undefined) continue;
    if (!Number.isInteger(b[key]) || b[key] < 0 || b[key] > max) return NextResponse.json({ error: `${key} is outside its allowed range` }, { status: 400 });
    data[key] = b[key];
  }
  if (b.telegramChatId !== undefined && b.telegramChatId !== previous?.telegramChatId) {
    if (b.telegramChatId !== null && b.telegramChatId !== "") return NextResponse.json({ error: "Pair your own private Telegram chat using Detect before enabling delivery." }, { status: 400 });
    data.telegramChatId = null;
    data.telegramEnabled = false;
  }
  const email = data.emailEnabled ?? previous?.emailEnabled ?? false;
  const telegram = data.telegramEnabled ?? previous?.telegramEnabled ?? false;
  if (email && telegram) return NextResponse.json({ error: "Choose one primary reminder channel to avoid duplicate reminders." }, { status: 400 });
  if (telegram && !(data.telegramChatId ?? previous?.telegramChatId)) return NextResponse.json({ error: "Pair your private Telegram chat first." }, { status: 400 });
  const prefs = await prisma.reminderPref.upsert({ where: { userId: user.id },
    create: { userId: user.id, emailEnabled: false, telegramEnabled: false, ...data }, update: data });
  return NextResponse.json({ ok: true, prefs });
}
export { POST } from "./send/route";
