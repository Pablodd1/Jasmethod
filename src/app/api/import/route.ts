import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseTcx, parseAppleHealth, parseWhoopCsv } from "@/lib/importers";

// POST /api/import — multipart upload: source = tcx | applehealth | whoop; file
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const source = String(form.get("source") || "");
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    const text = await file.text();
    let workouts: any[] = [];
    let extra: Record<string, any> = {};

    if (source === "tcx") {
      workouts = parseTcx(text);
    } else if (source === "applehealth") {
      const ah = parseAppleHealth(text);
      workouts = ah.workouts;
      extra = {
        bodyMassKg: ah.bodyMassKg,
        heightCm: ah.heightCm,
        weightLogs: ah.weightLogs,
        hrvLogs: ah.hrvLogs,
        hrLogs: ah.hrLogs,
      };
    } else if (source === "whoop") {
      const cycles = parseWhoopCsv(text);
      // Whoop cycles are recovery/sleep data, not workouts
      let created = 0;
      for (const c of cycles) {
        const d = new Date(c.day);
        if (isNaN(d.getTime())) continue;
        const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
        const existing = await prisma.dailyMetrics.findUnique({ where: { userId_date: { userId: user.id, date: dayStart } } });
        const data = {
          hrv: c.hrv ?? undefined,
          restingHr: c.restingHr ?? undefined,
          recoveryScore: c.recoveryScore !== undefined ? Math.round(c.recoveryScore) : undefined,
          sleepHours: c.sleepHours ?? undefined,
          source: "whoop",
        };
        if (existing) {
          await prisma.dailyMetrics.update({ where: { id: existing.id }, data });
        } else {
          await prisma.dailyMetrics.create({ data: { userId: user.id, date: dayStart, ...data } });
        }
        created++;
      }
      return NextResponse.json({ ok: true, source, metricsImported: created, workoutsImported: 0 });
    } else {
      return NextResponse.json({ error: "Unknown source. Use tcx, applehealth, or whoop." }, { status: 400 });
    }

    // Store imported workouts (dedupe by externalId)
    let imported = 0;
    for (const w of workouts) {
      const existing = await prisma.workout.findFirst({ where: { userId: user.id, externalId: w.externalId } });
      if (existing) continue;
      await prisma.workout.create({
        data: {
          userId: user.id,
          date: w.date,
          sport: w.sport,
          title: w.title,
          type: "endurance",
          durationMin: w.durationMin,
          distanceKm: w.distanceKm ?? undefined,
          avgHr: w.avgHr,
          maxHr: w.maxHr,
          avgPower: w.avgPower,
          calories: w.calories,
          planned: false,
          completed: true,
          source: w.source,
          externalId: w.externalId,
        },
      });
      imported++;
    }

    // Persist Apple Health metrics
    if (source === "applehealth" && extra.hrvLogs?.length) {
      const latest = extra.hrvLogs[extra.hrvLogs.length - 1];
      const dayStart = new Date(latest.date); dayStart.setHours(0, 0, 0, 0);
      const existing = await prisma.dailyMetrics.findUnique({ where: { userId_date: { userId: user.id, date: dayStart } } });
      const data = { hrv: Math.round(latest.ms * 100) / 100, source: "apple" };
      if (existing) await prisma.dailyMetrics.update({ where: { id: existing.id }, data });
      else await prisma.dailyMetrics.create({ data: { userId: user.id, date: dayStart, ...data } });
    }

    return NextResponse.json({
      ok: true,
      source,
      workoutsImported: imported,
      workoutsFound: workouts.length,
      extra: Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])),
    });
  } catch (e: any) {
    console.error("import error:", e);
    return NextResponse.json({ error: e.message || "Import failed" }, { status: 500 });
  }
}
