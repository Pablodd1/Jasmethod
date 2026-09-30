import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { intervalsCreateEvent, intervalsUpdateEvent, type IntervalStep } from "@/lib/intervals";
import { estimateTss } from "@/lib/fitness";
import { buildFuelingPlan } from "@/lib/fueling";
import { structuredSteps } from "@/lib/prescription";
import { effectivePrescription } from "@/lib/effective-prescription";
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

    // Effective prescription — SHARED safety-gated resolver (Codex P1-1):
    // an injured athlete or day-off row is never published to a device.
    const resolved = await effectivePrescription(user.id, workout.id);
    if (!resolved) return NextResponse.json({ error: "No session found" }, { status: 404 });
    const p = resolved.prescription;
    if (p.verdict === "rest" || (p.durationMin ?? resolved.workout.durationMin) === 0)
      return NextResponse.json(
        { error: "This is a rest day — nothing to publish." },
        { status: 400 },
      );
    const steps: IntervalStep[] = Array.isArray(p.steps) && p.steps.length
      ? p.steps
      : structuredSteps(p.durationMin ?? workout.durationMin, p.intensity || "z2", workout.type || "endurance", 0, p.sport || workout.sport);

    const tss = estimateTss({
      durationMin: p.durationMin ?? workout.durationMin,
      intensity: p.intensity || undefined,
      ftp: (user as any).profile?.ftp || undefined,
      lthr: (user as any).profile?.lthr || undefined,
    });
    // Fuel-on-delivery: the personalized fuel plan rides WITH the workout.
    const fuel = buildFuelingPlan({
      durationMin: p.durationMin ?? workout.durationMin,
      intensity: p.intensity,
      weightKg: (user as any).profile?.weightKg,
      sweatRateMlH: (user as any).profile?.sweatRateMlH,
      sodiumMgPerL: (user as any).profile?.sodiumMgPerL,
      gutTrained: (user as any).profile?.gutTrained,
      verdict: p.verdict,
    });
    const fuelLine = `\n\nFuel: ~${fuel.carbsPerHourG} g carbs/h · ~${Math.round(fuel.fluidMlPerHour)} ml/h${fuel.sodiumMgPerHour ? ` · ~${Math.round(fuel.sodiumMgPerHour)} mg Na/h` : ""}.`;
    const description =
      `${(p.intensity || "z2").toUpperCase()} · ${(p.durationMin ?? workout.durationMin)} min · planned TSS ~${tss}\n\n` +
      steps
        .slice(0, 12)
        .map(
          (s: any, i: number) =>
            `${i + 1}. ${s.name || "Segment"} — ${Math.round(s.seconds / 60)} min ${(s.zone || "").toUpperCase()}${s.note ? ` (${s.note.slice(0, 80)})` : ""}`,
        )
        .join("\n") + fuelLine;

    // Publish semantics (Codex review P1-5): re-push UPDATES the existing
    // Intervals event instead of creating duplicates. Only a first push
    // creates; the delivery id is required bookkeeping — a lost id is
    // reported as ambiguous, never as clean success.
    // CONCURRENT-CLAIM (Codex follow-up F4): two simultaneous pushes both read
    // deliveryId=null and both create externally. Claim the row first with a
    // conditional update — exactly one request wins the create.
    const claimToken = `pending:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const claim = await prisma.workout.updateMany({
      where: { id: workout.id, deliveryId: null },
      data: { deliveryProvider: "intervals", deliveryId: claimToken },
    });
    const priorId = claim.count === 0
      ? (await prisma.workout.findUnique({ where: { id: workout.id }, select: { deliveryId: true } }))?.deliveryId
      : null;
    if (priorId && priorId.startsWith("pending:"))
      return NextResponse.json(
        { error: "A publish for this session is already in progress. Wait a moment, then check your Intervals calendar — avoid double-pushing." },
        { status: 409 },
      );
    if (priorId && intervalsUpdateEvent) {
      await intervalsUpdateEvent(decryptSecret(conn.tokenEnc)!, priorId, {
        dateLocal: dateKey(workout.date, user.timezone),
        sport: p.sport || workout.sport,
        title: p.title || workout.title,
        description,
        trainingLoad: tss,
        steps,
      });
      await meterUsage(user.id, "fit_exports", 1);
      return NextResponse.json({ ok: true, intervalsId: priorId, updated: true, structured: (p.sport || workout.sport) === "bike" });
    }
    let created: { id: string };
    try {
      created = await intervalsCreateEvent(decryptSecret(conn.tokenEnc)!, {
        dateLocal: dateKey(workout.date, user.timezone),
        sport: p.sport || workout.sport,
        title: p.title || workout.title,
        description,
        trainingLoad: tss,
        steps,
      });
    } catch (e: any) {
      if (e?.definite) {
        // DEFINITE provider rejection: nothing was created — release the
        // claim so the athlete can retry without duplicate risk.
        await prisma.workout.updateMany({
          where: { id: workout.id, deliveryId: claimToken },
          data: { deliveryId: null, deliveryProvider: null },
        }).catch(() => {});
        return NextResponse.json({ error: e.message }, { status: 502 });
      }
      // AMBIGUOUS (network/timeout): the request may have reached Intervals.
      // The claim stays pending for reconciliation; retrying now could create
      // a duplicate. Surface the ambiguity instead of pretending either way.
      return NextResponse.json(
        {
          error:
            "The publish did not complete clearly — it may or may not have reached Intervals.icu. Check your Intervals calendar before retrying.",
          claimPending: true,
        },
        { status: 502 },
      );
    }

    // Remember the Intervals event id so a re-push can update instead of
    // duplicating (update endpoint wired when we add edit propagation).
    if (!created.id)
      return NextResponse.json(
        { error: "Intervals accepted the request but returned no event id — treat delivery as ambiguous and check your Intervals calendar before re-pushing." },
        { status: 502 },
      );
    const saved = await prisma.workout.updateMany({
      where: { id: workout.id, deliveryId: claimToken },
      data: { deliveryId: created.id },
    }).catch(() => null);
    if (!saved || saved.count === 0)
      return NextResponse.json({
        ok: true, intervalsId: created.id, structured: (p.sport || workout.sport) === "bike",
        warning: "Published, but the delivery id could not be saved locally — a future push may create a duplicate. Check your Intervals calendar.",
      });
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
