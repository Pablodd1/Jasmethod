import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dayBounds } from "@/lib/dates";
import { meterUsage } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// Legacy endpoint name retained for clients. This exports JMM's exact stored
// prescription for review, NOT an undocumented Garmin import format.
// Automatic device publishing requires an approved, implemented provider API.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const { start, end } = dayBounds(user.timezone);
  const workout = sessionId
    ? await prisma.workout.findFirst({ where: { id: sessionId, userId: user.id } })
    : await prisma.workout.findFirst({
        where: {
          userId: user.id,
          date: { gte: start, lt: end },
          planned: true,
          completed: false,
        },
        orderBy: { date: "asc" },
      });
  if (!workout)
    return NextResponse.json({ error: "No workout to export" }, { status: 404 });
  if (workout.durationMin <= 0)
    return NextResponse.json(
      { error: "Rest day has no workout to export" },
      { status: 400 },
    );

  // Steps come from the stored prescription (the same structured steps the
  // athlete sees on Today) or the deterministic fallback.
  let steps: any[] = [];
  try {
    const p = workout.prescription ? JSON.parse(workout.prescription) : null;
    if (Array.isArray(p?.steps) && p.steps.length) steps = p.steps;
  } catch {}
  if (!steps.length) return NextResponse.json(
    { error: "No stored structured prescription. Review and save the workout before exporting." },
    { status: 422 },
  );
  const payload = {
    format: "jmm-prescription-v1",
    delivery: { status: "export_only", providerPublished: false, deviceReceipt: false },
    compatibility: "JMM review file. Garmin/COROS import compatibility is not established.",
    workoutId: workout.id,
    title: workout.title,
    sport: workout.sport,
    durationMin: workout.durationMin,
    prescription: JSON.parse(workout.prescription!),
  };

  await meterUsage(user.id, "fit_exports", 1);

  const safeName =
    workout.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40) ||
    "workout";
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${safeName}-jmm.json"`,
    },
  });
}
