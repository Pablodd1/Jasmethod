import { boundedUploadForm, MAX_UPLOAD_BYTES, UploadLimitError } from "@/lib/upload-limits";
import { deviceMetricSnapshot } from "@/lib/device-metric-snapshot";
import { persistDeviceDay } from "@/lib/sync";
import { storeActivity } from "@/lib/activity-store";
import { dayBounds, parseDate } from "@/lib/dates";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseOuraExport } from "@/lib/oura-import";
import {
  parseAppleHealth,
  parseWhoopCsv,
  type ImportedWorkout,
} from "@/lib/importers";
import { parseTcxActivities } from "@/lib/tcx-import";
import { parseGarminActivitiesCsvDetailed } from "@/lib/garmin-activities-csv";
import { decodeFitActivity } from "@/lib/fit-import";
import { sniffUpload, uploadProblem } from "@/lib/import-files";
import type { ActivityStreams } from "@/lib/activity-streams";
import { prismaStreamRepo, storeStreams, streamStorageEnabled, type StreamDelegate } from "@/lib/activity-stream-store";

// POST /api/import — multipart upload. source: tcx | garmin | coros (TCX, Garmin Activities.csv or a FIT
// activity file, told apart by the file's BYTES), apple | applehealth (Apple Health export.xml), whoop (cycle
// CSV). ZIP archives are refused with an explanation; nothing is imported from a file that fails validation.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await boundedUploadForm(req);
    const source = String(form.get("source") || "");
    const file = form.get("file") as File | null;
    if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function")
      return NextResponse.json({ error: "No file provided." }, { status: 400 });

    // Normalize: the Connectors page posts the provider id as the source.
    const src =
      source === "garmin" || source === "coros"
        ? "tcx"
        : source === "apple"
          ? "applehealth"
          : source;

    if (file.size > MAX_UPLOAD_BYTES)
      return NextResponse.json(
        { error: "File exceeds 4 MB. Export a smaller date range." },
        { status: 413 },
      );
    const lang = user.language === "es" ? "es" : "en";
    const refuse = (key: string, status = 422, extra: Record<string, unknown> = {}) =>
      NextResponse.json({ error: uploadProblem(key, lang), code: key, ...extra }, { status });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffUpload(bytes);
    if (kind === "empty" || kind === "zip" || kind === "binary") return refuse(kind, kind === "empty" ? 400 : 415);
    if (kind === "fit" && src !== "tcx") return refuse("fit_for_other_source", 415);
    const text = kind === "fit" ? "" : new TextDecoder("utf-8").decode(bytes);
    let workouts: ImportedWorkout[] = [];
    let extra: Record<string, any> = {};
    let skipped: Record<string, number> = {};
    let unsupportedTypes: Record<string, number> = {};
    // Second-by-second data decoded from TCX/FIT, keyed by the activity's external id. It is stored only after the
    // summary is saved, only when the operator enabled it, the athlete consented on this upload, and the activity's
    // origin is known not to be Strava (activity-stream-store.ts). Otherwise it is discarded.
    const streamsByExternalId = new Map<string, ActivityStreams | null>();

    if (src === "tcx") {
      // Garmin/COROS uploads can be a .tcx (one activity), the Activities.csv bulk export, or a .fit activity.
      if (kind === "fit") {
        const fit = decodeFitActivity(bytes);
        if (!fit.ok) return refuse(fit.error);
        workouts = fit.activities.map((a) => a.workout);
        for (const a of fit.activities) streamsByExternalId.set(a.workout.externalId, a.streams);
        skipped = { sessionsSkipped: fit.sessionsSkipped };
      } else if (kind === "tcx" || kind === "xml") {
        const tcx = parseTcxActivities(text);
        if (!tcx.ok) return refuse(tcx.error);
        workouts = tcx.activities.map((a) => a.workout);
        for (const a of tcx.activities) streamsByExternalId.set(a.workout.externalId, a.streams);
        skipped = { ...tcx.skipped };
      } else {
        const csv = parseGarminActivitiesCsvDetailed(text, user.timezone, form.get("distanceUnits") === "metric" ? "metric" : form.get("distanceUnits") === "imperial" ? "imperial" : undefined);
        if (!csv.ok) return refuse(csv.error === "empty" ? "empty_csv" : (csv.error ?? "unrecognized_columns"), 422, { foundColumns: csv.foundColumns });
        workouts = csv.activities.map((a) => ({
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
        skipped = { ...csv.skipped, ambiguousNumbers: csv.ambiguousNumbers, implausibleValues: csv.implausibleValues };
        unsupportedTypes = csv.unsupportedTypes;
      }
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
        const snapshot=deviceMetricSnapshot(user.id,dayStart,"whoop",data,"uploaded_file");
        if(!snapshot.observations.length) continue;
        await prisma.$transaction(tx=>persistDeviceDay(tx,user.id,dayStart,"whoop",snapshot.data,snapshot.observations,"uploaded_file"));
        created++;
      }
      return NextResponse.json({
        ok: true,
        source,
        metricsImported: created,
        workoutsImported: 0,
      });
    } else if (src === "oura" || src === "aura") {
      const oura = parseOuraExport(text);
      let created = 0;
      for (const m of oura.metrics) {
        const d = new Date(m.date);
        if (isNaN(d.getTime())) continue;
        const dayStart = parseDate(m.date.slice(0,10),user.timezone);
        const data = {
          hrv: m.hrv ?? undefined,
          restingHr: m.restingHr ?? undefined,
          sleepHours: m.sleepHours ?? undefined,
          sleepScore: m.sleepScore ?? undefined,
          recoveryScore: m.recoveryScore ?? undefined,
          source: "oura",
        };
        const snapshot=deviceMetricSnapshot(user.id,dayStart,"oura",data,"uploaded_file");
        if(!snapshot.observations.length) continue;
        await prisma.$transaction(tx=>persistDeviceDay(tx,user.id,dayStart,"oura",snapshot.data,snapshot.observations,"uploaded_file"));
        created++;
      }
      return NextResponse.json({ ok: true, source: "oura", metricsImported: created, workoutsImported: 0 });
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
    const streamReport: { enabled: boolean; stored: number; workoutIds: string[]; refused: Record<string, number>; error?: true } = { enabled: streamStorageEnabled(), stored: 0, workoutIds: [], refused: {} };
    if (streamReport.enabled && streamsByExternalId.size) {
      // Best effort: a failure here (for example the optional table not being migrated yet) never fails the import.
      try {
        const consent = form.get("streamConsent") === "1";
        const repo = prismaStreamRepo((prisma as unknown as { activityStream: StreamDelegate }).activityStream);
        for (const w of workouts) {
          const streams = streamsByExternalId.get(w.externalId);
          if (!streams) continue;
          const row = await prisma.workout.findFirst({ where: { userId: user.id, source: w.source, externalId: w.externalId }, select: { id: true } });
          if (!row) continue;
          const outcome = await storeStreams(repo, { athleteId: user.id, workoutId: row.id, streams, provenance: w, consent });
          if (outcome === "stored") { streamReport.stored++; if (streamReport.workoutIds.length < 20) streamReport.workoutIds.push(row.id); }
          else streamReport.refused[outcome] = (streamReport.refused[outcome] ?? 0) + 1;
        }
      } catch (error) {
        console.error("activity stream storage unavailable");
        streamReport.error = true;
      }
    }
    if (src === "applehealth") {
      // The file is athlete-supplied: preserve its recorded date, never label it
      // a device measurement or overwrite the canonical profile without review.
      const now = new Date();
      const latestWeight = (extra.weightLogs || [])
        .filter((row: { date: Date; kg: number }) => Number.isFinite(row.kg) && row.kg >= 20 && row.kg <= 350 && Number.isFinite(row.date.getTime()) && row.date <= now && row.date.getTime() >= now.getTime() - 30 * 86400000)
        .sort((a: { date: Date }, b: { date: Date }) => b.date.getTime() - a.date.getTime())[0];
      if (latestWeight) await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
        const existing = await tx.metricObservation.findFirst({ where: {
          userId: user.id, source: "apple_health", metricType: "weight_kg",
          measurementMethod: "uploaded_file", observedAt: latestWeight.date, value: latestWeight.kg,
        }, select: { id: true } });
        if (!existing) await tx.metricObservation.create({ data: {
          userId: user.id, source: "apple_health", metricType: "weight_kg",
          measurementMethod: "uploaded_file", observedAt: latestWeight.date,
          value: latestWeight.kg, unit: "kg", qualityFlag: "ok",
        } });
      });
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
        const snapshot=deviceMetricSnapshot(user.id,d.date,"apple",d,"uploaded_file");
        if(!snapshot.observations.length) continue;
        await prisma.$transaction(tx=>persistDeviceDay(tx,user.id,d.date,"apple",snapshot.data,snapshot.observations,"uploaded_file"));
        metricsImported++;
      }
    }
    if (!workouts.length && !metricsImported)
      return NextResponse.json(
        {
          error:
            "No supported records found. Check the source and file format.",
          skipped,
          unsupportedTypes,
        },
        { status: 400 },
      );

    return NextResponse.json({
      ok: true,
      source,
      workoutsImported: imported,
      // Records already stored (same source and id) are refreshed in place, so a re-import never duplicates.
      workoutsAlreadyStored: workouts.length - imported,
      metricsImported,
      workoutsFound: workouts.length,
      skipped,
      unsupportedTypes,
      streams: streamReport,
      extra: Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.length : v,
        ]),
      ),
    });
  } catch (e: any) {
    if (e instanceof UploadLimitError) return NextResponse.json({ error: uploadProblem("too_large", user.language === "es" ? "es" : "en"), code: "too_large" }, { status: 413 });
    console.error("activity import failed");
    return NextResponse.json(
      { error: "Import failed. Please check the file format and retry." },
      { status: 500 },
    );
  }
}
