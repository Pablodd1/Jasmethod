import { SessionResolutionError } from "@/lib/canonical-session";
// GET /api/v1/training/today — daily-training screen adapter.
// Maps the athlete's REAL plan/profile/fueling data into the versioned
// DailyTraining contract (components/daily-training/training-contract.ts).
// Honesty rules from the kit: every unavailable value is null with a
// missingReason; paces carry provenance (never "measured" unless they are);
// density is a planning score, not physiology; no fabricated calories.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse } from "@/lib/access";
import { dayBounds, dateKey } from "@/lib/dates";
import { effectivePrescription } from "@/lib/effective-prescription";
import { buildFuelingPlan, postFuelPersonalized } from "@/lib/fueling";
import { canonicalBlocks, planningDensity } from "@/components/daily-training/training-contract";
import type {
  DailyTraining,
  PaceKey,
  PaceRef,
} from "@/components/daily-training/training-contract";

export const dynamic = "force-dynamic";

const KM_PER_MI = 1.609344;

function secPerKmToPerMi(s: number | null): number | null {
  return s == null ? null : Math.round(s * KM_PER_MI);
}

// Pace references derived from the athlete's threshold pace. Derived values
// are labeled coach_set (multipliers are coaching conventions, not tests).
function paceRefs(runPaceBase: number | null | undefined): Record<PaceKey, PaceRef> {
  if (!runPaceBase) {
    const missing: PaceRef = {
      secondsPerMile: null, measuredAt: null, status: "missing",
      missingReason: "No recent verified running benchmark is available. Effort guidance remains usable; an optional reviewed assessment can refine pace targets.",
    };
    return { mile: missing, "5k": missing, "10k": missing, half: missing, marathon: missing, easy: missing };
  }
  const mul: Record<PaceKey, number> = {
    mile: 0.88, "5k": 0.93, "10k": 0.97, half: 1.04, marathon: 1.10, easy: 1.25,
  };
  return Object.fromEntries(
    (Object.keys(mul) as PaceKey[]).map((k) => [
      k,
      { secondsPerMile: secPerKmToPerMi(runPaceBase * mul[k]), measuredAt: null, status: "coach_set" as const },
    ]),
  ) as Record<PaceKey, PaceRef>;
}

export async function GET(req: Request) {
  try {
    const { athlete: user } = await trainingAccess(req);
    const { start, end } = dayBounds(user.timezone);
    const [workouts, race] = await Promise.all([
      prisma.workout.findMany({
        where: { userId: user.id, date: { gte: start, lt: end }, planned: true },
        orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
        include: { planDay: { select: { dayOff: true } } },
      }),
      prisma.race.findFirst({
        where: { userId: user.id, date: { gte: start } },
        orderBy: [{ priority: "asc" }, { date: "asc" }],
      }),
    ]);
    const selected = new URL(req.url).searchParams.get("sessionId");
    const workout = selected ? workouts.find(w => w.id === selected) : workouts[0];
    if (!workout) return selected
      ? NextResponse.json({ error: "Session not found for today" }, { status: 404 })
      : new NextResponse(null, { status: 204 });
    const resolved = await effectivePrescription(user.id, workout.id);
    if (!resolved) return NextResponse.json({ error: "Session is no longer available" }, { status: 404 });
    const { prescription: p, canonical, targetProfile } = resolved;
    const rawSteps = canonical.steps;
    const blocks = canonicalBlocks(rawSteps);
    const revision = canonical.revisionNumber;

    const fuel = buildFuelingPlan({
      durationMin: p.durationMin ?? workout.durationMin,
      intensity: p.intensity,
      weightKg: user.profile?.weightKg,
      sweatRateMlH: user.profile?.sweatRateMlH,
      sodiumMgPerL: user.profile?.sodiumMgPerL,
      gutTrained: user.profile?.gutTrained,
      verdict: p.verdict,
    });
    const post = postFuelPersonalized({ durationMin: canonical.durationMin, intensity: p.intensity, sport: canonical.sport, weightKg: user.profile?.weightKg });
    const checkin = await prisma.dailyCheckin.findUnique({
      where: { userId_date: { userId: user.id, date: start } },
      select: { answers: true },
    });
    let focusReady = false;
    try {
      focusReady = !!(JSON.parse(checkin?.answers || "{}")?.focus || {})[workout.id];
    } catch {}
    const completed = workout.completed;
    const metric = user.profile?.units === "imperial" ? "imperial" : "metric";

    const plan: DailyTraining = {
      schemaVersion: 2,
      sessions: workouts.map(w => ({ id: w.id, title: w.title, sport: w.sport, startTime: w.startTime })),
      session: {
        id: workout.id,
        revision,
        sourceRevision: canonical.revision,
        verdict: canonical.verdict,
        capability: canonical.capability,
        durationIsEstimate: canonical.exactTimeSeconds === null,
        dateLocal: dateKey(workout.date, user.timezone),
        timezone: user.timezone,
        sport: p.sport || workout.sport,
        title: p.title || workout.title,
        subtitle: canonical.verdict === "ready" ? (p.why || canonical.reason) : canonical.reason,
        planStatus: completed ? "completed" : "planned",
        totalMinutes: p.durationMin ?? workout.durationMin,
        density: planningDensity(rawSteps),
        calories: {
          kcal: null, method: "none", asOf: null,
          missingReason: "No energy expenditure measurement is available; no device is required to train or report effort",
        },
      },
      profile: {
        paces: paceRefs(targetProfile?.runPaceBase ?? null),
        thresholdHeartRate: {
          bpm: targetProfile?.lthr ?? null,
          status: targetProfile?.lthr ? "coach_set" : "missing",
          measuredAt: null,
        },
        unitSystem: metric,
        updatedAt: new Date().toISOString(),
      },
      blocks,
      guidance: {
        focus: {
          title: "Arrive ready",
          items: [
            canonical.verdict === "ready" ? "Check today's endpoints, targets and equipment before warming up." : canonical.reason,
            sportPreparation(canonical.sport),
            race
              ? `Next race: ${race.name} — ${Math.max(0, Math.round((Date.parse(dateKey(race.date, user.timezone)) - Date.parse(dateKey(workout.date, user.timezone))) / 86400000))} days out.`
              : "Hydrate through the day; sleep is part of the session.",
            "Phone away during the warm-up — the first minutes set the rhythm.",
          ],
        },
        preFuel: {
          title: "Fuel before",
          items: [
            fuel.preSession?.note ||
              `Target ~${fuel.carbsPerHourG} g carbs/h on this session.`,
            ...(fuel.preSession?.carbsG
              ? [`Pre-session: ${fuel.preSession.carbsG} g carbs ${fuel.preSession.timingLabel}.`]
              : []),
            `Fluid ~${Math.round(fuel.fluidMlPerHour)} ml/h (${fuel.fluidSource}).`,
            "Low fiber, low fat, familiar food before hard work.",
          ],
          note: fuel.personalization?.length
            ? `Personalized: ${fuel.personalization.join("; ")}.`
            : "Guidance is generated for this session's duration and intensity.",
        },
        postFuel: {
          title: "Refuel after",
          items: post
            ? [
                post.carbsG == null || post.proteinG == null ? "Personalized recovery amounts unavailable: current weight is not recorded. Choose a familiar meal with carbohydrate and protein." : `~${post.carbsG} g carbs + ~${post.proteinG} g protein (session guidance).`,
                "Examples, if suitable for your diet: rice with beans, yogurt with fruit, or a sandwich.",
              ]
            : ["Rehydrate and eat a mixed meal within 2 hours."],
          note: post?.note || undefined,
        },
        downshift: {
          title: "Downshift breathing",
          items: ["Let your breathing settle comfortably. Stop the exercise if you feel dizzy or unwell."],
          note: "Optional relaxation practice; no recovery effect is guaranteed.",
          timerSeconds: 120, inhaleSeconds: 4, exhaleSeconds: 6,
        },
        checkIn: {
          title: "Close the loop",
          items: ["Log actual minutes and effort — the coach adapts tomorrow from it."],
        },
      },
      completion: {
        focusReady,
        submittedAt: workout.feedbackAt?.toISOString() || null,
        actual: workout.feedbackStatus
          ? {
              durationMinutes: workout.actualDurationMin ?? null,
              actualSport: workout.actualSport ?? null,
              sessionRpe: workout.rpe ?? null,
              comments: workout.feedbackNote ?? null,
            }
          : null,
      },
      links: { editProfile: "/settings" },
    };
    return NextResponse.json(plan, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof SessionResolutionError) return NextResponse.json({ error: e.message }, { status: e.status });
    return errorResponse(e);
  }
}

function sportPreparation(sport: string): string {
  const cues: Record<string, string> = {
    run: "Choose safe footing and appropriate shoes. Follow the displayed pace or effort, adjusting to terrain and conditions.",
    bike: "Check brakes, tires and a safe route or trainer setup. Power targets apply only when provided above.",
    swim: "Confirm pool or open-water venue and safe supervision. Follow only the supplied distances, rests and technique instructions; pool length is not assumed.",
    strength: "Prepare the listed equipment. Follow exercise, set, rep and rest instructions with controlled technique; do not guess an unspecified load.",
    mobility: "Use a clear space and comfortable range of motion; do not force a painful stretch.",
    recovery: "Keep movement comfortable. Recovery guidance is optional; rest if the safety decision asks you to.",
    boxing: "Prepare the specified protective equipment and space. Preserve round/rest order and controlled technique.",
    hyrox: "Check station equipment and safe transitions. Follow actual distances, loads and reps only where the plan specifies them.",
    brick: "Prepare equipment for each component and a safe transition area. Keep the prescribed component order; transitions are not inferred.",
  };
  return cues[sport] || "Check the session's equipment and technique requirements. Ask for any missing execution details.";
}
