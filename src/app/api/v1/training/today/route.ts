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
import { postWorkoutFuel } from "@/lib/adaptive";
import { effectivePrescription } from "@/lib/effective-prescription";
import { buildFuelingPlan } from "@/lib/fueling";
import { zoneTargets } from "@/lib/prescription";
import type {
  Block,
  DailyTraining,
  PaceKey,
  PaceRef,
  Segment,
} from "@/components/daily-training/training-contract";

export const dynamic = "force-dynamic";

const KM_PER_MI = 1.609344;

function secPerKmToPerMi(s: number | null): number | null {
  return s == null ? null : Math.round(s * KM_PER_MI);
}

// Zone → chart kind. Kinds drive color; they are visual, not physiological.
function kindOf(zone: string | null | undefined, phase?: string): Segment["kind"] {
  if (phase === "warmup") return "prep";
  if (phase === "cooldown") return "cool";
  if (phase === "recovery") return "recover";
  const z = Number((zone || "z2").replace(/[^1-7]/g, "")) || 2;
  if (z <= 2) return "easy";
  return "work";
}

// Planning density 1-10 from average zone intensity (label says coach score).
function densityOf(steps: { seconds: number; zone: string }[]): number {
  const total = steps.reduce((a, s) => a + s.seconds, 0);
  if (!total) return 1;
  const avg =
    steps.reduce((a, s) => a + s.seconds * (Number((s.zone || "z2").replace(/[^1-7]/g, "")) || 2), 0) / total;
  return Math.max(1, Math.min(10, Math.round(avg * 1.4)));
}

// Pace references derived from the athlete's threshold pace. Derived values
// are labeled coach_set (multipliers are coaching conventions, not tests).
function paceRefs(runPaceBase: number | null | undefined): Record<PaceKey, PaceRef> {
  if (!runPaceBase) {
    const missing: PaceRef = {
      secondsPerMile: null, measuredAt: null, status: "missing",
      missingReason: "Add a benchmark (5K time or threshold pace) in Profile & Zones",
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
    const [workout, race] = await Promise.all([
      prisma.workout.findFirst({
        where: { userId: user.id, date: { gte: start, lt: end }, planned: true },
        orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
        include: { planDay: { select: { dayOff: true } } },
      }),
      prisma.race.findFirst({
        where: { userId: user.id, date: { gte: start } },
        orderBy: [{ priority: "asc" }, { date: "asc" }],
      }),
    ]);
    if (!workout || workout.planDay?.dayOff || workout.durationMin === 0)
      return new NextResponse(null, { status: 204 });

    // The effective prescription — the SHARED safety-gated resolver (injury,
    // day-off, stale saved prescriptions are rest; Codex review P1-1).
    const resolved = await effectivePrescription(user.id, workout.id);
    if (!resolved) return new NextResponse(null, { status: 204 });
    const p = resolved.prescription;

    // Steps → blocks: group consecutive steps by phase into named blocks.
    const rawSteps: any[] = Array.isArray(p.steps) && p.steps.length
      ? p.steps
      : [];
    const blocks: Block[] = [];
    let cur: { title: string; kind: Segment["kind"]; segs: Segment[] } | null = null;
    const phaseTitle: Record<string, string> = {
      warmup: "Warm up", active: "Main set", recovery: "Recoveries", cooldown: "Cool down",
    };
    for (let i = 0; i < rawSteps.length; i++) {
      const s = rawSteps[i];
      const kind = kindOf(s.zone, s.phase);
      const title = phaseTitle[s.phase] || "Main set";
      if (!cur || cur.title !== title)
        blocks.push({ id: `b${blocks.length}`, title, repeat: 1, segments: [] }),
          (cur = { title, kind, segs: blocks[blocks.length - 1].segments });
      const zt = zoneTargets(s.zone || "z2", p.sport || workout.sport, user.profile as any);
      const hrNum = zt.hr ? Number(zt.hr.replace(/[^0-9]/g, "")) || null : null;
      cur.segs.push({
        id: `s${i}`,
        seconds: Math.max(1, Math.round(s.seconds || 60)),
        kind,
        title: s.name || s.note?.slice(0, 40) || "Segment",
        instruction: s.note || "Execute as prescribed.",
        target: {
          label: `${(s.zone || "z2").toUpperCase()}${zt.pace ? ` · ${zt.pace}` : ""}${zt.power ? ` · ${zt.power}` : ""}`,
          paceLowSecondsPerMile: null, paceHighSecondsPerMile: null,
          rpeLow: zt.rpe ?? null, rpeHigh: null,
          heartRateBpm: hrNum,
          note: zt.hr || undefined,
        },
      });
    }
    if (!blocks.length)
      return NextResponse.json({ error: "Plan has no structured steps" }, { status: 404 });

    // Session revision: content-derived so a plan change invalidates the screen.
    const revision = Math.max(
      1,
      Math.abs(
        [...(workout.prescription || ""), workout.id, String(workout.durationMin)]
          .join("|").length *
          31 +
          new Date(workout.createdAt).getTime() % 100000,
      ) % 1000000,
    );

    const fuel = buildFuelingPlan({
      durationMin: p.durationMin ?? workout.durationMin,
      intensity: p.intensity,
      weightKg: user.profile?.weightKg,
      sweatRateMlH: user.profile?.sweatRateMlH,
      sodiumMgPerL: user.profile?.sodiumMgPerL,
      gutTrained: user.profile?.gutTrained,
      verdict: p.verdict,
    });
    const post = postWorkoutFuel({ durationMin: p.durationMin, intensity: p.intensity });
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
      schemaVersion: 1,
      session: {
        id: workout.id,
        revision,
        dateLocal: dateKey(workout.date, user.timezone),
        timezone: user.timezone,
        sport: p.sport || workout.sport,
        title: p.title || workout.title,
        subtitle:
          p.why ||
          `${(p.intensity || "z2").toUpperCase()} session — execute the targets, let the plan work.`,
        planStatus: completed ? "completed" : "planned",
        totalMinutes: p.durationMin ?? workout.durationMin,
        density: {
          score: densityOf(rawSteps.length ? rawSteps : [{ seconds: 60 * (p.durationMin || 60), zone: p.intensity || "z2" }]),
          label: "coach planning score",
          method: "coach_planning",
        },
        calories: {
          kcal: null, method: "none", asOf: null,
          missingReason: "Energy expenditure comes from your device after the session",
        },
      },
      profile: {
        paces: paceRefs(user.profile?.runPaceBase ?? null),
        thresholdHeartRate: {
          bpm: user.profile?.lthr ?? null,
          status: user.profile?.lthr ? "coach_set" : "missing",
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
            "Check today's targets before warming up.",
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
                `~${post.carbsG} g carbs + ~${post.proteinG} g protein within 60 min.`,
                post.examples || "Examples: chocolate milk, rice + chicken, yogurt + fruit.",
              ]
            : ["Rehydrate and eat a mixed meal within 2 hours."],
          note: post?.notes || undefined,
        },
        downshift: {
          title: "Downshift breathing",
          items: ["Nose breathing, long exhales, until your breath settles."],
          note: "Optional — a 2026 trial found slow breathing helped post-interval recovery.",
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
    return errorResponse(e);
  }
}
