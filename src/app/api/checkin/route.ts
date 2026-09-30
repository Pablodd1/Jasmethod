export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { dayBounds, busyHours, addDaysKey, localDate } from "@/lib/dates";
import {
  adaptSession,
  prescribeToday,
  recommendFuel,
  recommendErgogenics,
  recoveryFor,
  postWorkoutFuel,
  morningWeightTrend,
  type Checkin,
} from "@/lib/adaptive";
import { baseWorkout } from "@/lib/prescription";
import { hrvReadiness } from "@/lib/science";
import { stimPlan } from "@/lib/stimulation";
import { cycleAdvice, youthPolicy, proteinPerKg } from "@/lib/cycle";
import { fuelBrandsFor } from "@/lib/fuelbrands";
import { sourcesFor } from "@/lib/research";

const sources = () =>
  sourcesFor(["seiler2009", "buchheit2014", "jeukendrup2014", "thomas2016"]);
const recovery = () => {
  const r = recoveryFor(new Date());
  return { ...r.technique, key: r.dailyKey };
};
function array(value?: string | null) {
  try {
    const x = JSON.parse(value || "[]");
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}
export async function GET(req: Request) {
  try {
    const { athlete: user } = await trainingAccess(req);
    const { start, end } = dayBounds(user.timezone);
    const [checkin, metrics, appointments] = await Promise.all([
      prisma.dailyCheckin.findUnique({
        where: { userId_date: { userId: user.id, date: start } },
      }),
      prisma.dailyMetrics.findMany({
        where: {
          userId: user.id,
          date: { gte: new Date(start.getTime() - 14 * 86400000), lt: end },
          hrv: { not: null },
        },
        orderBy: { date: "desc" },
        take: 8,
      }),
      prisma.calendarEvent.findMany({
        where: {
          userId: user.id,
          type: "appointment",
          date: { gte: start, lt: end },
        },
        select: { title: true, startTime: true, endTime: true },
      }),
    ]);
    const sameType = metrics.filter(
      (m) => (m.hrvType || "rmssd") === (metrics[0]?.hrvType || "rmssd"),
    );
    let readiness = null;
    if (sameType.length >= 4) {
      const values = sameType.slice(1).map((m) => m.hrv!);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      readiness = hrvReadiness(
        sameType[0].hrv!,
        values,
        Math.sqrt(
          values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
        ),
      );
    }
    return NextResponse.json({
      checkin,
      readiness,
      recovery: recovery(),
      sources: sources(),
      fuelBrands: fuelBrandsFor(0),
      language: user.language,
      calendar: { busyCount: appointments.length, appointments },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { actor, athlete: user } = await trainingAccess(req);
    const b = await req.json();
    for (const key of ["sleep", "soreness", "motivation", "energy", "stress"])
      if (
        !Number.isInteger(Number(b[key])) ||
        Number(b[key]) < 1 ||
        Number(b[key]) > 5
      )
        throw new ApiError(`Choose ${key} from 1 to 5`);
    const checkin: Checkin = {
      sleep: +b.sleep,
      soreness: +b.soreness,
      motivation: +b.motivation,
      energy: +b.energy,
      stress: +b.stress,
      sick: b.sick === true,
      menstrual: b.menstrual === true,
      // Device-free daily loop — persisted with the record and used by
      // adaptSession (pain/sessionFelt) and the session budget (availableMin).
      availableMin:
        b.availableMinutes == null || b.availableMinutes === ""
          ? undefined
          : Number(b.availableMinutes),
      newPain: b.newPain === true || undefined,
      painLocation:
        typeof b.painLocation === "string" && b.painLocation.trim()
          ? b.painLocation.trim().slice(0, 80)
          : undefined,
      painAffectsMovement: b.painAffectsMovement === true || undefined,
      sessionFelt: ["easier", "normal", "harder"].includes(b.sessionFelt)
        ? b.sessionFelt
        : undefined,
    };
    for (const [key, max] of Object.entries({
      mood: 5,
      cycleDay: 40,
      weightKg: 350,
      rhr: 150,
      hrv: 300,
      sleepHours: 24,
      availableMinutes: 1440,
    })) {
      if (b[key] === undefined || b[key] === "" || b[key] === null) continue;
      const value = Number(b[key]);
      if (!Number.isFinite(value) || value < 0 || value > max)
        throw new ApiError(`Invalid ${key}`);
      if (["mood", "cycleDay", "weightKg", "rhr"].includes(key))
        (checkin as any)[key] = value;
    }
    // FRESHNESS BEFORE ADAPTATION (Codex follow-up F5): when device data is
    // stale, do a BOUNDED inline sync first so the verdict reflects this
    // morning's HRV/recovery, not yesterday's. Hard-capped at 7s so check-in
    // never hangs; the durable queue below remains the safety net, and the
    // refreshed data feeds the NEXT adaptation too.
    // Freshness of the device data behind this adaptation (Codex review #3
    // P1-5): surfaced explicitly instead of an apparently-normal adaptation
    // on stale data.
    let freshness: "synced-now" | "fresh" | "pending" = "fresh";
    {
      const stale = await prisma.connector.findFirst({
        where: {
          userId: user.id,
          status: "connected",
          provider: { in: ["whoop", "oura", "strava"] },
          OR: [
            { lastSyncAt: null },
            { lastSyncAt: { lt: new Date(Date.now() - 6 * 3600000) } },
          ],
        },
        select: { id: true },
      });
      if (stale) {
        freshness = "pending";
        const { syncUserConnectors } = await import("@/lib/sync");
        const ok = await Promise.race([
          syncUserConnectors(user.id).then(() => true).catch(() => false),
          new Promise<boolean>((r) => setTimeout(() => r(false), 7000)),
        ]);
        freshness = ok ? "synced-now" : "pending";
      }
    }
    const { start, end, key } = dayBounds(user.timezone);
    const [metrics, profile, appointments, prefs, feedback] = await Promise.all(
      [
        prisma.dailyMetrics.findMany({
          where: {
            userId: user.id,
            date: { gte: new Date(start.getTime() - 14 * 86400000), lt: end },
          },
          orderBy: { date: "asc" },
        }),
        prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
        prisma.calendarEvent.findMany({
          where: {
            userId: user.id,
            type: "appointment",
            date: { gte: start, lt: end },
          },
          select: { title: true, startTime: true, endTime: true },
        }),
        prisma.supplementProfile.findUnique({ where: { userId: user.id } }),
        prisma.workout.findFirst({
          where: {
            userId: user.id,
            feedbackAt: { not: null },
            date: { gte: new Date(start.getTime() - 3 * 86400000), lt: start },
          },
          orderBy: { date: "desc" },
        }),
      ],
    );
    const history = metrics.filter((m) => m.date < start);
    const rhrs = history
      .filter((m) => m.restingHr != null)
      .slice(-7)
      .map((m) => m.restingHr!);
    const current = metrics.find((m) => m.date.getTime() === start.getTime());
    checkin.rhr ??= current?.restingHr ?? undefined;
    if (rhrs.length >= 3)
      checkin.rhrBaseline = rhrs.reduce((a, b) => a + b, 0) / rhrs.length;
    if (profile?.injured) checkin.sick = true;
    let adaptation = adaptSession(checkin);
    const hrv = b.hrv != null && b.hrv !== "" ? Number(b.hrv) : current?.hrv;
    const hrvType = b.hrv ? "rmssd" : current?.hrvType || "rmssd";
    const hrvs = history
      .filter((m) => m.hrv != null && (m.hrvType || "rmssd") === hrvType)
      .slice(-7)
      .map((m) => m.hrv!);
    const hrvMean =
      hrvs.length >= 3 ? hrvs.reduce((a, v) => a + v, 0) / hrvs.length : null;
    const hrvLow = hrv != null && hrvMean != null && hrv < hrvMean * 0.9;
    const feedbackCaution = feedback?.rpe != null && feedback.rpe >= 9;
    if ((hrvLow || feedbackCaution) && adaptation.verdict === "full")
      adaptation = {
        ...adaptation,
        verdict: "trim",
        durationFactor: 0.85,
        intensityCap: "z4",
        message: hrvLow
          ? "HRV is below your recent baseline; today's plan is conservative. Review how you feel before training."
          : "Your recent workout felt very hard; today's plan is trimmed.",
      };
    const busyHrs = busyHours(appointments, key, user.timezone);
    const busyNote = `${appointments.length} calendar commitments, ${busyHrs.toFixed(1)} hours busy.`;
    const saved = await prisma.$transaction(async (tx) => {
      const sessions = await tx.workout.findMany({
        where: {
          userId: user.id,
          date: { gte: start, lt: end },
          planned: true,
          completed: false,
          OR: [
            { feedbackStatus: null },
            { feedbackStatus: { not: "skipped" } },
          ],
        },
        include: { planDay: true },
        orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
      });
      const prescriptions = [];
      let remaining =
        b.availableMinutes == null || b.availableMinutes === ""
          ? Infinity
          : Number(b.availableMinutes);
      for (const w of sessions) {
        const base = baseWorkout(w);
        const effective = w.planDay?.dayOff
          ? {
              ...adaptation,
              verdict: "rest",
              durationFactor: 0,
              intensityCap: "z1",
            }
          : adaptation;
        const limitedBase =
          Number.isFinite(remaining) && effective.durationFactor > 0
            ? {
                ...base,
                durationMin: Math.min(
                  base.durationMin,
                  remaining / effective.durationFactor,
                ),
              }
            : base;
        const p = prescribeToday({
          session: limitedBase,
          adaptation:
            remaining <= 0
              ? { ...effective, verdict: "rest", durationFactor: 0 }
              : effective,
          busyHrs,
          busyNote,
          profile,
          // Availability is enforced at the END of prescription — the coach
          // intensity multiplier can reshape the session but never exceed it.
          timeBudgetMin: Number.isFinite(remaining) ? remaining : undefined,
        });
        p.scaled.originalMin = base.durationMin;
        p.scaled.factor = base.durationMin
          ? p.durationMin / base.durationMin
          : 0;
        remaining -= p.durationMin;
        await tx.workout.update({
          where: { id: w.id },
          data: {
            originalPlan: JSON.stringify(base),
            prescription: JSON.stringify(p),
            durationMin: p.durationMin,
            intensity: p.intensity,
            type: p.type,
            title: p.title,
            notes: p.detail.main,
            approved: false,
          },
        });
        prescriptions.push({ sessionId: w.id, ...p });
      }
      // SCIENCE V2 SHADOW — run the multi-dimensional engine alongside V1 on
      // every check-in and persist the comparison (auditable; V1 still drives
      // prescriptions until COACH_ENGINE_VERSION=v2).
      let shadowV2: string | null = null;
      try {
        const { computeAthleteState, compareShadow } = await import("@/lib/athlete-state-v2");
        const v2Input = {
          hrvToday: current?.hrv ?? undefined,
          hrvBaseline7d:
            history
              .filter((m: any) => m.hrv != null)
              .slice(-7)
              .map((m: any) => m.hrv as number),
          hrvStatus:
            current?.hrv != null && hrvs.length >= 3
              ? (() => {
                  const base = hrvs.reduce((a: number, b: number) => a + b, 0) / hrvs.length;
                  const delta = (current.hrv - base) / base;
                  return delta >= 0.05 ? "high" : delta <= -0.1 ? "low" : "normal";
                })()
              : undefined,
          sleep: checkin.sleep,
          soreness: checkin.soreness,
          energy: checkin.energy,
          stress: checkin.stress,
          motivation: checkin.motivation,
          mood: checkin.mood,
          painFlag: checkin.newPain === true,
          sick: checkin.sick === true,
          menstrualSymptoms: checkin.menstrual === true,
        };
        shadowV2 = JSON.stringify(
          compareShadow(adaptation.score, adaptation.verdict, v2Input),
        );
      } catch (shadowErr) {
        console.error("shadow v2 failed (non-fatal):", shadowErr);
      }
      const check = await tx.dailyCheckin.upsert({
        where: { userId_date: { userId: user.id, date: start } },
        create: {
          userId: user.id,
          date: start,
          answers: JSON.stringify(checkin),
          adaptation: JSON.stringify(adaptation),
          shadowV2,
        },
        update: {
          answers: JSON.stringify(checkin),
          adaptation: JSON.stringify(adaptation),
          shadowV2,
        },
      });
      if (
        [b.weightKg, b.rhr, b.hrv, b.sleepHours].some(
          (v) => v !== undefined && v !== "" && v !== null,
        )
      ) {
        const data = {
          ...(b.weightKg ? { weightKg: Number(b.weightKg) } : {}),
          ...(b.rhr ? { restingHr: Number(b.rhr) } : {}),
          ...(b.hrv ? { hrv: Number(b.hrv), hrvType: "rmssd" } : {}),
          ...(b.sleepHours !== undefined && b.sleepHours !== ""
            ? { sleepHours: Number(b.sleepHours) }
            : {}),
        };
        await tx.dailyMetrics.upsert({
          where: { userId_date: { userId: user.id, date: start } },
          create: { userId: user.id, date: start, source: "manual", ...data },
          update: data,
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          subjectId: user.id,
          action: "checkin.adapt",
          entityId: check.id,
          after: JSON.stringify({
            verdict: adaptation.verdict,
            sessions: prescriptions.map((p) => p.sessionId),
          }),
        },
      });
      return { checkin: check, prescriptions };
    });
    const prescription = saved.prescriptions[0] || null;
    const session = prescription || {
      sport: "recovery",
      type: "recovery",
      intensity: "z1",
      durationMin: 0,
    };
    const fuel = recommendFuel(session);
    const ergos = session.durationMin
      ? recommendErgogenics(
          {
            enabled: prefs?.enabled ?? false,
            likes: array(prefs?.likes),
            dislikes: array(prefs?.dislikes),
            optsOut: array(prefs?.optsOut),
          },
          session,
        )
      : { recommended: [], reason: "Rest day" };
    const hard = Number(session.intensity.slice(1)) >= 4;
    // Owner spec: a daily check-in is ALSO a sync trigger — the morning
    // ritual should pull the freshest device data before the plan adapts.
    // Fire-and-forget (never blocks or fails the check-in); throttled to once
    // per 6h per user so re-checking doesn't hammer providers.
    // DURABLE refresh (Codex review P1-7): an in-process fire-and-forget can
    // die with the serverless request. Enqueue a SyncJob the worker drains;
    // freshness ordering note: the adaptation below uses the metrics already
    // on file — the refreshed data lands in DailyMetrics and is consumed by
    // the NEXT adaptation (or the hourly cron) rather than this response.
    // Queue ONLY connected providers (Codex review #3 P2 — device-free users
    // must not create four no-op jobs per hourly key).
    const { enqueueSyncJob } = await import("@/lib/background-jobs");
    const hourKey = new Date().toISOString().slice(0, 13); // ≤1 refresh/hour
    const connectedProviders = await prisma.connector.findMany({
      where: { userId: user.id, status: "connected", provider: { in: ["strava", "whoop", "oura", "google_cal"] } },
      select: { provider: true },
    });
    for (const { provider } of connectedProviders)
      await enqueueSyncJob(user.id, "sync", `checkin:${provider}:${user.id}:${hourKey}`, { provider }).catch(() => {});
    return NextResponse.json({
      ok: true,
      freshness,
      freshnessNote:
        freshness === "synced-now"
          ? "Device data refreshed before adapting today's plan."
          : freshness === "pending"
            ? "Device refresh still running — today's plan may update after the next sync."
            : "Device data is current.",
      ...saved,
      prescription,
      adaptation,
      fuel,
      ergos,
      post: session.durationMin ? postWorkoutFuel(session) : null,
      stim: {
        pre: stimPlan("pre", { hardSession: hard }),
        during: stimPlan("during", { hardSession: hard }),
        post: stimPlan("post", { hardSession: false }),
        night: stimPlan("night", { hardSession: false }),
      },
      recovery: recovery(),
      fuelBrands: fuelBrandsFor(session.durationMin),
      sources: sources(),
      cycle: cycleAdvice(checkin.cycleDay, profile?.sex ?? null),
      youth: youthPolicy(profile?.birthYear ?? null),
      protein: {
        perKg: proteinPerKg(
          profile?.sex ?? null,
          session.sport === "strength",
          profile?.birthYear ?? null,
        ),
        note: "Daily target, adjusted to the saved profile.",
      },
      hydration: {
        weightTrend: morningWeightTrend(metrics),
        rhrNote: null,
        hrvNote: hrvLow
          ? "Below recent baseline; prescription adjusted conservatively."
          : null,
        sleepNote: null,
      },
      calendar: { busyCount: appointments.length, busyNote },
      tomorrowAdjustment: null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const { start, end } = dayBounds(athlete.timezone);
    await prisma.$transaction(async (tx) => {
      const sessions = await tx.workout.findMany({
        where: {
          userId: athlete.id,
          planned: true,
          completed: false,
          date: { gte: start, lt: end },
          originalPlan: { not: null },
        },
      });
      for (const w of sessions) {
        const b = baseWorkout(w);
        await tx.workout.update({
          where: { id: w.id },
          data: {
            title: b.title,
            sport: b.sport,
            type: b.type,
            intensity: b.intensity,
            durationMin: b.durationMin,
            notes: b.description,
            prescription: null,
            approved: false,
          },
        });
      }
      await tx.dailyCheckin.deleteMany({
        where: { userId: athlete.id, date: start },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          subjectId: athlete.id,
          action: "checkin.undo",
          after: JSON.stringify({ sessions: sessions.map((w) => w.id) }),
        },
      });
    });
    return NextResponse.json({
      ok: true,
      message:
        "Original sessions restored. Completed results and health measurements were retained.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
