import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { dayBounds } from "@/lib/dates";
import { meterUsage } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// GET /api/workout/garmin-json?sessionId=<id>
// Exports the session in Garmin Connect's own JSON import format (Training &
// Planning → Workouts → Import). Community-verified import path, not a
// partner API: import, inspect the received steps, then send to device.
// Targets: HR-zone approximations (Garmin JSON supports zones 1-5; our z6-z7
// cap at 5) and per-step power targets for cycling when FTP is known.

const SPORT_KEY: Record<string, string> = {
  run: "running",
  bike: "cycling",
  swim: "lap_swimming",
  strength: "strength_training",
  mobility: "yoga",
  recovery: "cardio_training",
  brick: "transition",
  boxing: "cardio_training",
  hyrox: "cardio_training",
  other: "cardio_training",
};

const STEP_KEY: Record<string, string> = {
  warmup: "warmup",
  active: "interval",
  recovery: "recovery",
  cooldown: "cooldown",
};

function zoneNumber(zone: string | null | undefined): number {
  const z = Number((zone || "z2").replace(/[^1-7]/g, ""));
  return Math.min(5, Math.max(1, z || 2)); // Garmin HR zones are 1–5
}

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

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
    select: { lthr: true },
  });
  const sportKey = SPORT_KEY[workout.sport] || "running";

  // Steps come from the stored prescription (the same structured steps the
  // athlete sees on Today) or the deterministic fallback.
  // SHARED SAFETY GATE — enforced, not decorative (Codex review #3 P1):
  // a rest verdict or failed resolution NEVER exports, and a rejected session
  // is never reconstructed from the raw stored prescription.
  const { effectivePrescription } = await import("@/lib/effective-prescription");
  const resolved = await effectivePrescription(user.id, workout.id);
  if (!resolved)
    return NextResponse.json({ error: "Session could not be resolved safely — export refused" }, { status: 503 });
  const p = resolved.prescription;
  if (
    p.verdict === "rest" ||
    (p.durationMin ?? resolved.workout.durationMin) === 0 ||
    !Array.isArray(p.steps) ||
    p.steps.length === 0
  )
    return NextResponse.json(
      { error: "This is a rest day — there is no workout to export." },
      { status: 400 },
    );
  let steps: any[] = p.steps;
  const effectiveIntensity: string | null = p.intensity || null;

  const workoutSteps = steps.map((s: any, i: number) => {
    const step: any = {
      stepOrder: i + 1,
      childStepId: null,
      description: (s.note || workout.notes || "").slice(0, 180) || null,
      stepType: { stepTypeKey: STEP_KEY[s.phase] || "interval" },
      endCondition: { conditionTypeKey: "time" },
      endConditionValue: Math.max(1, Math.round(s.seconds)), // exact seconds — never silently alter a prescription
      preferredEndConditionUnit: { unitKey: "second" },
      targetValueOne: null,
      targetValueTwo: null,
      zone: null,
    };
    // Targets preserved per sport (Codex review #3 P1): cycling gets an
    // exact WATT target from FTP × zone multiplier (the number the athlete
    // must hold); HR-zone targets (Garmin zones 1-5; our z6-z7 cap at 5 —
    // a format limit, stated) only when LTHR exists and no power applies.
    if (sportKey === "cycling" && user.profile?.ftp) {
      const mult = ({ z1: 0.55, z2: 0.75, z3: 0.9, z4: 1.0, z5: 1.18, z6: 1.45, z7: 1.65 } as Record<string, number>)[
        (s.zone || "z2").toLowerCase()
      ] ?? 0.75;
      step.targetType = { targetTypeKey: "power" };
      step.targetValueOne = Math.round(user.profile.ftp * mult);
      step.targetValueTwo = null;
      step.zone = null;
    } else if (profile?.lthr) {
      const z = zoneNumber(s.zone);
      step.targetType = { targetTypeKey: "heart.rate.zone" };
      step.zone = z;
    }
    return step;
  });

  // Fuel-on-delivery: carb/fluid targets ride in the description so they're
  // visible in Garmin Connect before the workout goes to the watch.
  let fuelNote: string | null = null;
  try {
    const { buildFuelingPlan } = await import("@/lib/fueling");
    const fuel = buildFuelingPlan({
      durationMin: workout.durationMin,
      intensity: effectiveIntensity || workout.intensity || "z2",
      weightKg: user.profile?.weightKg,
      sweatRateMlH: user.profile?.sweatRateMlH,
      sodiumMgPerL: user.profile?.sodiumMgPerL,
      gutTrained: user.profile?.gutTrained,
    });
    fuelNote = `Fuel: ~${fuel.carbsPerHourG} g carbs/h · ~${Math.round(fuel.fluidMlPerHour)} ml/h`;
  } catch {}

  // Fuel is essential guidance (Codex P2): notes are truncated to RESERVE
  // room for it, and truncation is marked with an ellipsis rather than
  // silently dropping the athlete's instructions.
  const notesRaw = (workout.notes || "").trim();
  const noteCap = fuelNote ? 120 : 180;
  const notesShown =
    notesRaw.length > noteCap ? `${notesRaw.slice(0, noteCap)}…` : notesRaw || null;

  const payload = {
    workoutName: workout.title.slice(0, 60),
    workoutDescription:
      [notesShown, fuelNote].filter(Boolean).join(" — ").slice(0, 180) || null,
    sportType: { sportTypeKey: sportKey },
    aerobicTrainingEffect: null,
    anaerobicTrainingEffect: null,
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeKey: sportKey },
        workoutSteps,
      },
    ],
  };

  await meterUsage(user.id, "fit_exports", 1);

  const safeName =
    workout.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40) ||
    "workout";
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${safeName}-garmin.json"`,
    },
  });
}
