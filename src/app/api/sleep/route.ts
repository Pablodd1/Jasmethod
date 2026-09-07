export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dayBounds, parseDate } from "@/lib/dates";
import { errorResponse, ApiError, trainingAccess } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";

// GET /api/sleep?days=30
export async function GET(req: Request) {
  let user, actor;
  try {
    const access = await trainingAccess(req);
    user = access.athlete;
    actor = access.actor;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.max(
    1,
    Math.min(90, parseInt(url.searchParams.get("days") || "30", 10) || 30),
  );
  const since = new Date(Date.now() - days * 86400000);
  const sleep = await prisma.sleepRecord.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: { date: "desc" },
  });
  return NextResponse.json({ sleep });
}

// POST /api/sleep
export async function POST(req: Request) {
  let user, actor;
  try {
    const access = await trainingAccess(req);
    user = access.athlete;
    actor = access.actor;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const dayStart = body.date
      ? dayBounds(user.timezone, parseDate(body.date, user.timezone)).start
      : dayBounds(user.timezone).start;
    for (const k of [
      "hours",
      "deepHours",
      "remHours",
      "lightHours",
      "awakenings",
      "efficiency",
      "quality",
    ]) {
      if (body[k] == null || body[k] === "") {
        delete body[k];
        continue;
      }
      const n = Number(body[k]),
        max = k === "efficiency" ? 100 : k === "quality" ? 10 : 24;
      if (!Number.isFinite(n) || n < 0 || n > max)
        throw new ApiError(`Invalid ${k}`);
    }
    const data: Record<string, any> = {
      date: dayStart,
      bedTime: body.bedTime ? new Date(body.bedTime) : undefined,
      wakeTime: body.wakeTime ? new Date(body.wakeTime) : undefined,
      hours: body.hours !== undefined ? parseFloat(body.hours) : undefined,
      deepHours:
        body.deepHours !== undefined ? parseFloat(body.deepHours) : undefined,
      remHours:
        body.remHours !== undefined ? parseFloat(body.remHours) : undefined,
      lightHours:
        body.lightHours !== undefined ? parseFloat(body.lightHours) : undefined,
      awakenings:
        body.awakenings !== undefined
          ? parseInt(body.awakenings, 10)
          : undefined,
      efficiency:
        body.efficiency !== undefined ? parseFloat(body.efficiency) : undefined,
      quality:
        body.quality !== undefined ? parseInt(body.quality, 10) : undefined,
      source: body.source || "manual",
    };
    const existing = await prisma.sleepRecord.findUnique({
      where: { userId_date: { userId: user.id, date: dayStart } },
    });
    const record = existing
      ? await prisma.sleepRecord.update({ where: { id: existing.id }, data })
      : await prisma.sleepRecord.create({
          data: {
            userId: user.id,
            date: dayStart,
            hours: body.hours !== undefined ? parseFloat(body.hours) : 0,
            ...data,
          },
        });
    if (body.hours !== undefined)
      await prisma.dailyMetrics.upsert({
        where: { userId_date: { userId: user.id, date: dayStart } },
        create: {
          userId: user.id,
          date: dayStart,
          sleepHours: Number(body.hours),
          source: "manual",
        },
        update: { sleepHours: Number(body.hours) },
      });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        subjectId: user.id,
        action: "sleep.update",
        entityId: record.id,
        before: JSON.stringify(existing),
        after: JSON.stringify(record),
      },
    });
    return NextResponse.json({ ok: true, record });
  } catch (e: any) {
    return errorResponse(e);
  }
}
