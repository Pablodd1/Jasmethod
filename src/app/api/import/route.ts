import { storeActivity } from "@/lib/activity-store";
import { dayBounds, parseDate } from "@/lib/dates";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  parseTcx,
  parseAppleHealth,
  parseWhoopCsv,
  parseGarminActivitiesCsv,
} from "@/lib/importers";

// POST /api/import — multipart upload. source: tcx | garmin | coros (all parsed
// as TCX), apple | applehealth (Apple Health export.xml), whoop (cycle CSV).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const source = String(form.get("source") || "");
    const file = form.get("file") as File | null;
    if (!file)
      return NextResponse.json({ error: "No file provided." }, { status: 400 });

    // Normalize: the Connectors page posts the provider id as the source.
    const src =
      source === "garmin" || source === "coros"
        ? "tcx"
        : source === "apple"
          ? "applehealth"
          : source;

    if (file.size > 40 * 1024 * 1024)
      return NextResponse.json(
        { error: "File exceeds 40 MB. Export a smaller date range." },
        { status: 413 },
      );
    const text = await file.text();
    let workouts: any[] = [];
    let extra: Record<string, any> = {};

    if (src === "tcx") {
      // Garmin uploads can be .tcx (single activity) OR the Activities.csv
      // bulk export — detect by content so either file just works.
      workouts = text.trimStart().startsWith("<")
        ? parseTcx(text)
        : parseGarminActivitiesCsv(text).map((a) => ({
            date: a.date,
            sport: a.sport,
            title: a.title,
            durationMin: a.durationMin,
            distanceKm: a.distanceKm ?? undefined,
            avgHr: a.avgHr ?? undefined,
            maxHr: a.maxHr ?? undefined,
            avgPower: a.avgPower ?? undefined,
            np: a.np ?? undefined,
            tss: a.tss ?? undefined,
            calories: a.calories ?? undefined,
            source: "garmin",
            externalId: a.externalId,
          }));
    } else if (src === "applehealth") {
      const ah = parseAppleHealth(text);
      workouts = ah.workouts;
      extra = {
        bodyMassKg: ah.bodyMassKg,
        heightCm: ah.heightCm,
        weightLogs: ah.weightLogs,
        hrvLogs: ah.hrvLogs,
        hrLogs: ah.hrLogs,
        sleepLogs: ah.sleepLogs,
      };
    } else if (src === "whoop") {
      const cycles = parseWhoopCsv(text);
      // Whoop cycles are recovery/sleep data, not workouts
      let created = 0;
      for (const c of cycles) {
        const d = new Date(c.day);
        if (isNaN(d.getTime())) continue;
        const dayStart = dayBounds(
          user.timezone,
          parseDate(c.day, user.timezone),
        ).start;
        const existing = await prisma.dailyMetrics.findUnique({
          where: { userId_date: { userId: user.id, date: dayStart } },
        });
        const data = {
          hrv: c.hrv ?? undefined,
          restingHr: c.restingHr ?? undefined,
          recoveryScore:
            c.recoveryScore !== undefined
              ? Math.round(c.recoveryScore)
              : undefined,
          sleepHours: c.sleepHours ?? undefined,
          source: "whoop",
          hrvType: "rmssd",
        };
        if (existing) {
          await prisma.dailyMetrics.update({
            where: { id: existing.id },
            data,
          });
        } else {
          await prisma.dailyMetrics.create({
            data: { userId: user.id, date: dayStart, ...data },
          });
        }
        created++;
      }
      return NextResponse.json({
        ok: true,
        source,
        metricsImported: created,
        workoutsImported: 0,
      });
    } else {
      return NextResponse.json(
        {
          error:
            "Unknown source. Use tcx, garmin, coros, apple, applehealth, or whoop.",
        },
        { status: 400 },
      );
    }

    let imported = 0,
      metricsImported = 0;
    for (const w of workouts)
      if (await storeActivity(user.id, user.timezone, w)) imported++;
    if (src === "applehealth") {
      const daily = new Map<string, any>();
      for (const [logs, field, value] of [
        [extra.hrvLogs, "hrv", "ms"],
        [extra.hrLogs, "restingHr", "bpm"],
        [extra.weightLogs, "weightKg", "kg"],
        [extra.sleepLogs, "sleepHours", "hours"],
      ] as any[]) {
        for (const row of logs || []) {
          const { key, start } = dayBounds(user.timezone, new Date(row.date));
          const d = daily.get(key) || { date: start, source: "apple" };
          d[field] =
            field === "sleepHours" ? (d[field] || 0) + row[value] : row[value];
          if (field === "restingHr") d[field] = Math.round(d[field]);
          if (field === "hrv") d.hrvType = "sdnn";
          daily.set(key, d);
        }
      }
      for (const d of Array.from(daily.values())) {
        await prisma.dailyMetrics.upsert({
          where: { userId_date: { userId: user.id, date: d.date } },
          create: { userId: user.id, ...d },
          update: d,
        });
        metricsImported++;
      }
    }
    if (!workouts.length && !metricsImported)
      return NextResponse.json(
        {
          error:
            "No supported records found. Check the source and file format.",
        },
        { status: 400 },
      );

    return NextResponse.json({
      ok: true,
      source,
      workoutsImported: imported,
      metricsImported,
      workoutsFound: workouts.length,
      extra: Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.length : v,
        ]),
      ),
    });
  } catch (e: any) {
    console.error("import error:", e);
    return NextResponse.json(
      { error: e.message || "Import failed" },
      { status: 500 },
    );
  }
}
