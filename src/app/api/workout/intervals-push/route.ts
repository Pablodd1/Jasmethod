import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { intervalsCreateEvent, type IntervalStep } from "@/lib/intervals";
import { estimateTss } from "@/lib/fitness";
import { baseWorkout, structuredSteps } from "@/lib/prescription";
import { prescribeToday } from "@/lib/adaptive";
import { dayBounds, dateKey } from "@/lib/dates";
import { meterUsage } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/workout/intervals-push — { sessionId }
// Publishes the session to the athlete's Intervals.icu calendar. Intervals
// then syncs it to their linked Garmin/COROS/Wahoo/Suunto automatically —
// the one fully-open structured-workout bridge (owner request 2026-09-28).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId || "");
    const { start, end } = dayBounds(user.timezone);
    const workout = sessionId
      ? await prisma.workout.findFirst({ where: { id: sessionId, userId: user.id } })
      : await prisma.workout.findFirst({
          where: { userId: user.id, date: { gte: start, lt: end }, planned: true },
          orderBy: { date: "asc" },
        });
    if (!workout) return NextResponse.json({ error: "No session found" }, { status: 404 });
    if (workout.durationMin <= 0)
      return NextResponse.json({ error: "Rest day has no workout to push" }, { status: 400 });

    const conn = await prisma.connector.findFirst({
      where: { userId: user.id, provider: "intervals", status: "connected" },
    });
    if (!conn?.tokenEnc)
      return NextResponse.json(
        { error: "Connect Intervals.icu first (Connections page)." },
        { status: 400 },
      );

    // Effective prescription — same source of truth as Today.
    let p: any = null;
    try {
      p = workout.prescription ? JSON.parse(workout.prescription) : null;
    } catch {}
    if (!p)
      p = prescribeToday({
        session: baseWorkout(workout),
        adaptation: { verdict: "full", durationFactor: 1, intensityCap: "z7" },
        profile: (user as any).profile,
      });
    const steps: IntervalStep[] = Array.isArray(p.steps) && p.steps.length
      ? p.steps
      : structuredSteps(p.durationMin ?? workout.durationMin, p.intensity || "z2", workout.type || "endurance", 0, p.sport || workout.sport);

    const tss = estimateTss({
      durationMin: p.durationMin ?? workout.durationMin,
      intensity: p.intensity || undefined,
      ftp: (user as any).profile?.ftp || undefined,
      lthr: (user as any).profile?.lthr || undefined,
    });
    const description =
      `${(p.intensity || "z2").toUpperCase()} · ${(p.durationMin ?? workout.durationMin)} min · planned TSS ~${tss}\n\n` +
      steps
        .slice(0, 12)
        .map(
          (s: any, i: number) =>
            `${i + 1}. ${s.name || "Segment"} — ${Math.round(s.seconds / 60)} min ${(s.zone || "").toUpperCase()}${s.note ? ` (${s.note.slice(0, 80)})` : ""}`,
        )
        .join("\n");

    const created = await intervalsCreateEvent(decryptSecret(conn.tokenEnc)!, {
      dateLocal: dateKey(workout.date, user.timezone),
      sport: p.sport || workout.sport,
      title: p.title || workout.title,
      description,
      trainingLoad: tss,
      steps,
    });

    // Remember the Intervals event id so a re-push can update instead of
    // duplicating (update endpoint wired when we add edit propagation).
    await prisma.workout.update({
      where: { id: workout.id },
      data: { deliveryProvider: "intervals", deliveryId: created.id || null },
    }).catch(() => {});
    await meterUsage(user.id, "fit_exports", 1);
    return NextResponse.json({
      ok: true,
      intervalsId: created.id,
      structured: (p.sport || workout.sport) === "bike",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Push failed" }, { status: 502 });
  }
}
