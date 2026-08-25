import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/sleep?days=30
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.min(90, parseInt(url.searchParams.get("days") || "30", 10));
  const since = new Date(Date.now() - days * 86400000);
  const sleep = await prisma.sleepRecord.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ sleep });
}

// POST /api/sleep
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const date = new Date(body.date || new Date());
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const data: Record<string, any> = {
      date: dayStart,
      bedTime: body.bedTime ? new Date(body.bedTime) : undefined,
      wakeTime: body.wakeTime ? new Date(body.wakeTime) : undefined,
      hours: body.hours !== undefined ? parseFloat(body.hours) : undefined,
      deepHours: body.deepHours !== undefined ? parseFloat(body.deepHours) : undefined,
      remHours: body.remHours !== undefined ? parseFloat(body.remHours) : undefined,
      lightHours: body.lightHours !== undefined ? parseFloat(body.lightHours) : undefined,
      awakenings: body.awakenings !== undefined ? parseInt(body.awakenings, 10) : undefined,
      efficiency: body.efficiency !== undefined ? parseFloat(body.efficiency) : undefined,
      quality: body.quality !== undefined ? parseInt(body.quality, 10) : undefined,
      source: body.source || "manual",
    };
    const existing = await prisma.sleepRecord.findUnique({ where: { userId_date: { userId: user.id, date: dayStart } } });
    const record = existing
      ? await prisma.sleepRecord.update({ where: { id: existing.id }, data })
      : await prisma.sleepRecord.create({ data: { userId: user.id, date: dayStart, hours: body.hours !== undefined ? parseFloat(body.hours) : 0, ...data } });
    return NextResponse.json({ ok: true, record });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
