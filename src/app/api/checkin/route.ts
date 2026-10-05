import { preserveSportStructure } from "@/lib/preserve-sport-structure";
import { intervalsConnectorEnabled } from "@/lib/capabilities";
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
import { checkinPrescriptionInputError } from "@/lib/checkin-prescription-input";
import { applyExecutionFeedback } from "@/lib/execution-feedback";
import { readPlanningSetup } from "@/lib/planning-setup-store";
import { assessPlanningSetup } from "@/lib/planning-setup";
import { baseWorkout } from "@/lib/prescription";
import { hrvReadiness } from "@/lib/science";
import { stimPlan } from "@/lib/stimulation";
import { cycleAdvice, youthPolicy, proteinPerKg } from "@/lib/cycle";
import { fuelBrandsFor } from "@/lib/fuelbrands";
import { sourcesFor } from "@/lib/research";
import { checkinSyncFreshness, optionalCheckinBoolean, optionalCheckinNumber, SUBJECTIVE_FIELDS, SAFETY_FIELDS, CHECKIN_SAFETY_VERSION, type FreshnessResult, resolveCheckinSafety } from "@/lib/checkin-safety";

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
    const { start, end, key } = dayBounds(user.timezone);
    const feedbackDate = new URL(req.url).searchParams.get("feedbackDate") || addDaysKey(key, -1);
    let feedbackStart: Date;
    try { feedbackStart = localDate(feedbackDate, user.timezone); } catch { throw new ApiError("Invalid feedback observation date"); }
    if (feedbackDate > key) throw new ApiError("Feedback must describe today or an earlier date");
    const feedbackEnd = localDate(addDaysKey(feedbackDate, 1), user.timezone);
    const [checkin, metrics, appointments, previousSessions, profile, planning] = await Promise.all([
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
      prisma.workout.findMany({ where: { userId: user.id, date: { gte: feedbackStart, lt: feedbackEnd } }, orderBy: [{ startTime: "asc" }, { createdAt: "asc" }], select: { id: true, title: true, sport: true, durationMin: true, date: true, feedbackStatus: true, actualDurationMin: true, rpe: true, feedbackNote: true, feedbackAt: true, actualSport: true, actualDetails: true } }),
      prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
      readPlanningSetup(user.id),
    ]);
    const sameType = metrics.filter(
      (m) => Number.isFinite(m.hrv) && m.hrv! > 0 && m.hrv! <= 300 && (m.hrvType || "rmssd") === (metrics[0]?.hrvType || "rmssd"),
    );
    let readiness: ReturnType<typeof hrvReadiness> | null = null;
    if (sameType.length >= 4 && sameType[0].date >= start && sameType[0].date < end) {
      const values = sameType.slice(1).map((m) => m.hrv!);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const hrvComparison = hrvReadiness(
        sameType[0].hrv!,
        values,
        Math.sqrt(
          values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length,
        ),
      );
      if (hrvComparison.hrvStatus !== "insufficient") readiness = { ...hrvComparison, advice: "Derived comparison with your recent HRV readings. It is not a diagnosis or permission to increase training; current symptoms and the reviewed plan take priority." };
    }
    let displayedCheckin = checkin;
    let currentSafetyClear = false;
    if (checkin) {
      let answers: Checkin = {};
      try { const parsed = JSON.parse(checkin.answers || "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) answers = parsed; } catch { /* Fail closed below. */ }
      const safety = resolveCheckinSafety(profile?.injured ? { ...answers, newPain: true } : answers);
      const setup = assessPlanningSetup(profile, planning.setup, new Date(), "daily");
      currentSafetyClear = safety.status === "clear" && setup.ready;
      let savedAdaptation: any = null;
      try { savedAdaptation = JSON.parse(checkin.adaptation || "null"); } catch { /* Invalid stored output is not clearance. */ }
      const validSaved = savedAdaptation && typeof savedAdaptation.ruleId === "string" && ["full", "trim", "easy", "rest"].includes(savedAdaptation.verdict) && Number.isFinite(savedAdaptation.score) && savedAdaptation.score >= 0 && savedAdaptation.score <= 100 && typeof savedAdaptation.scoreAvailable === "boolean" && Number.isFinite(savedAdaptation.durationFactor) && savedAdaptation.durationFactor >= 0 && savedAdaptation.durationFactor <= 1 && /^z[1-7]$/.test(savedAdaptation.intensityCap);
      if (safety.status !== "clear") displayedCheckin = { ...checkin, adaptation: JSON.stringify(adaptSession(profile?.injured ? { ...answers, newPain: true } : answers)) };
      else if (!validSaved) displayedCheckin = { ...checkin, adaptation: JSON.stringify({ score: 0, scoreAvailable: false, verdict: "rest", durationFactor: 0, intensityCap: "z1", safetyStatus: "unknown", ruleId: "checkin-safety-v1:refresh-required", message: "The saved adaptation cannot be verified. Review and submit today's check-in to refresh it before training." }) };
      currentSafetyClear = currentSafetyClear && Boolean(validSaved);
      if (safety.status === "clear" && !setup.ready) displayedCheckin = { ...checkin, adaptation: JSON.stringify({ score: 0, scoreAvailable: false, verdict: "rest", durationFactor: 0, intensityCap: "z1", safetyStatus: "unknown", ruleId: setup.ruleId, message: `Complete or review athlete setup before individualized training. ${[...setup.missing, ...setup.review].join("; ")}` }) };
    }
    return NextResponse.json({
      checkin: displayedCheckin,
      feedbackDate,
      previousSessions,
      localToday: key,
      readiness: currentSafetyClear ? readiness : null,
      recovery: currentSafetyClear ? recovery() : null,
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
    const raw = await req.json().catch(() => { throw new ApiError("Invalid JSON"); });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError("Expected a check-in object");
    const b: Record<string, any> = { ...raw };
    const checkin: Checkin = {};
    try {
      for (const field of SUBJECTIVE_FIELDS) checkin[field] = optionalCheckinNumber(b[field], field, 1, 5, true);
      for (const field of [...SAFETY_FIELDS, "menstrual", "painAffectsMovement"] as const) checkin[field] = optionalCheckinBoolean(b[field], field);
      for (const [field, range] of Object.entries({ mood: [1, 5], cycleDay: [1, 35], weightKg: [20, 350], rhr: [20, 150], hrv: [1, 300], sleepHours: [0, 24], availableMinutes: [0, 1440] })) {
        b[field] = optionalCheckinNumber(b[field], field, range[0], range[1], ["mood", "cycleDay", "rhr"].includes(field));
        if (["mood", "cycleDay", "weightKg", "rhr"].includes(field)) (checkin as any)[field] = b[field];
      }
    } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid check-in"); }
    checkin.availableMin = b.availableMinutes;
    if (b.painLocation != null && typeof b.painLocation !== "string") throw new ApiError("Invalid painLocation");
    checkin.painLocation = b.painLocation?.trim().slice(0, 80) || undefined;
    if (b.sessionFelt && !["easier", "normal", "harder"].includes(b.sessionFelt)) throw new ApiError("Invalid sessionFelt");
    checkin.sessionFelt = b.sessionFelt || undefined;
    // Retain honest per-provider outcomes, including resolved calls containing failures.
    const providerQuery = { userId: user.id, status: { in: ["connected", "error"] }, provider: { in: ["strava", "whoop", "oura", ...(intervalsConnectorEnabled() ? ["intervals"] : [])] } };
    let deviceProviders = await prisma.connector.findMany({ where: providerQuery, select: { provider: true, status: true, lastSyncAt: true } });
    const syncAttempted = deviceProviders.some((p) => p.status !== "connected" || !p.lastSyncAt || Date.now() - p.lastSyncAt.getTime() >= 6 * 3600000);
    let syncResults: FreshnessResult[] | null = null;
    if (syncAttempted) {
      const { syncUserConnectors } = await import("@/lib/sync");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        syncResults = await Promise.race([
          // Do not trigger unrelated calendar publication while recording health answers.
          Promise.all(deviceProviders.map((p) => syncUserConnectors(user.id, p.provider))).then((summaries) => summaries.flatMap((s) => s.results)),
          new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 7000); }),
        ]);
      } catch { syncResults = deviceProviders.map((p) => ({ provider: p.provider, ok: false, imported: 0, error: "Provider refresh failed." })); }
      finally { if (timer) clearTimeout(timer); }
      deviceProviders = await prisma.connector.findMany({ where: providerQuery, select: { provider: true, status: true, lastSyncAt: true } });
    }
    const syncFreshness = checkinSyncFreshness(deviceProviders, syncResults, syncAttempted);
    const { start, end, key } = dayBounds(user.timezone);
    const [metrics, profile, appointments, prefs, feedback, planning, sameDayReports] = await Promise.all(
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
        prisma.workout.findMany({
          where: {
            userId: user.id,
            date: { gte: new Date(start.getTime() - 3 * 86400000), lt: start },
          },
          orderBy: { date: "desc" },
        }),
        readPlanningSetup(user.id),
        prisma.workout.findMany({ where: { userId: user.id, date: { gte: start, lt: end }, OR: [{ feedbackAt: { not: null } }, { planned: false }, { completed: true }] }, select: { id: true, feedbackStatus: true, actualDurationMin: true, matchedPlanId: true } }),
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
    // Profile restriction influences the decision without rewriting the athlete's report.
    let adaptation = adaptSession(profile?.injured ? { ...checkin, newPain: true } : checkin);
    const hrv = b.hrv != null && b.hrv !== "" ? Number(b.hrv) : current?.hrv;
    const hrvType = b.hrv ? "rmssd" : current?.hrvType || "rmssd";
    const hrvs = history
      .filter((m) => m.hrv != null && Number.isFinite(m.hrv) && m.hrv > 0 && m.hrv <= 300 && (m.hrvType || "rmssd") === hrvType)
      .slice(-7)
      .map((m) => m.hrv!);
    const hrvMean =
      hrvs.length >= 3 ? hrvs.reduce((a, v) => a + v, 0) / hrvs.length : null;
    const hrvLow = hrv != null && hrvMean != null && hrv < hrvMean * 0.9;
    const setupGate = assessPlanningSetup(profile, planning.setup, new Date(), "daily");
    if (!setupGate.ready && adaptation.safetyStatus === "clear") adaptation = { ...adaptation, verdict: "rest", durationFactor: 0, intensityCap: "z1", scoreAvailable: false, safetyStatus: "unknown", ruleId: setupGate.ruleId, missingFields: setupGate.missing, message: `Individual training is on hold until setup is complete or reviewed. ${[...setupGate.missing, ...setupGate.review].join("; ")}. Update athlete setup; no device benchmark is required.` };
    if (hrvLow && adaptation.verdict === "full") adaptation = { ...adaptation, verdict: "trim", durationFactor: 0.85, intensityCap: "z4", ruleId: "checkin-safety-v1:low-hrv", message: "HRV is below your recent baseline; today's plan is conservative. Review how you feel before training." };
    const execution = applyExecutionFeedback(adaptation, feedback);
    adaptation = execution.adaptation;
    const uniqueSameDayReports = sameDayReports.filter((w) => !w.matchedPlanId || !sameDayReports.some((actual) => actual.id === w.matchedPlanId));
    const uncertainSameDay = uniqueSameDayReports.some((w) => w.feedbackStatus !== "skipped" && w.actualDurationMin == null);
    const usedDailyMinutes = uniqueSameDayReports.reduce((sum, w) => sum + (w.actualDurationMin ?? 0), 0);
    const dailyBudgetRemaining = Math.max(0, (planning.setup?.maxSessionMinutes ?? 0) - usedDailyMinutes);
    if (adaptation.safetyStatus === "clear" && (uncertainSameDay || dailyBudgetRemaining === 0)) adaptation = { ...adaptation, verdict: "rest", durationFactor: 0, intensityCap: "z1", ruleId: "checkin-safety-v1:daily-budget", message: uncertainSameDay ? "Confirm actual duration for today's reported activity before adding a workout. Unknown duration is not zero." : "Today's reviewed training-time budget is already used. No further workout is prescribed." };
    const busyHrs = busyHours(appointments, key, user.timezone);
    const busyNote = `${appointments.length} calendar commitments, ${busyHrs.toFixed(1)} hours busy.`;
    const saved = await prisma.$transaction(async (tx) => {
      const sessions = await tx.workout.findMany({
        where: {
          userId: user.id,
          date: { gte: start, lt: end },
          planned: true,
          completed: false,
          feedbackAt: null,
          OR: [
            { feedbackStatus: null },
            { feedbackStatus: { not: "skipped" } },
          ],
        },
        include: { planDay: true },
        orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
      });
      const prescriptions = [];
      const rejectedSessions: { sessionId: string; reason: string }[] = [];
      let remaining = Math.min(checkin.availableMin ?? 0, dailyBudgetRemaining);
      for (const w of sessions) {
        const invalidBase = checkinPrescriptionInputError(w);
        if (invalidBase) { rejectedSessions.push({ sessionId: w.id, reason: invalidBase }); await tx.workout.update({ where: { id: w.id }, data: { approved: false } }); continue; }
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
        const p = preserveSportStructure(w, prescribeToday({
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
        }));
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
        if (adaptation.scoreAvailable === false) throw new Error("Shadow score unavailable for incomplete or held check-in");
        const { compareShadow } = await import("@/lib/athlete-state-v2");
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
      } catch { /* Missing safety inputs never become synthetic shadow scores. */ }
      const recordedAnswers = {
        ...checkin,
        ...Object.fromEntries([...SUBJECTIVE_FIELDS, ...SAFETY_FIELDS].map((field) => [field, checkin[field] ?? null])),
        availableMin: checkin.availableMin ?? null,
        sleepHours: b.sleepHours ?? null,
        hrv: b.hrv ?? null,
        inputMetadata: { version: CHECKIN_SAFETY_VERSION, source: b.voiceReviewConfirmed === true ? "athlete-confirmed-voice" : "athlete-reported", observedOn: key, recordedAt: new Date().toISOString(), missingFields: adaptation.missingFields || [], rhrSource: b.rhr != null ? "athlete-reported" : current?.restingHr != null ? current.source : "unknown" },
      };
      const check = await tx.dailyCheckin.upsert({
        where: { userId_date: { userId: user.id, date: start } },
        create: {
          userId: user.id,
          date: start,
          answers: JSON.stringify(recordedAnswers),
          adaptation: JSON.stringify(adaptation),
          shadowV2,
        },
        update: {
          answers: JSON.stringify(recordedAnswers),
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
            ruleId: adaptation.ruleId,
            inputSnapshot: recordedAnswers,
            executionInputs: execution.inputs,
            executionNotes: execution.notes,
            priorPrescriptions: sessions.map((w) => ({ sessionId: w.id, prescription: w.prescription })),
            newPrescriptions: prescriptions,
            uncertainty: [...(adaptation.missingFields || []), ...rejectedSessions.map((w) => w.reason)],
            rejectedSessions,
            dailyBudget: { reportedRemainingMinutes: checkin.availableMin ?? null, usedDailyMinutes, reviewedDailyMaxMinutes: planning.setup?.maxSessionMinutes ?? null },
            timestamp: new Date().toISOString(),
            verdict: adaptation.verdict,
            sessions: prescriptions.map((p) => p.sessionId),
          }),
        },
      });
      return { checkin: check, prescriptions, rejectedSessions };
    });
    const prescription = saved.prescriptions[0] || null;
    const session = prescription || {
      sport: "recovery",
      type: "recovery",
      intensity: "z1",
      durationMin: 0,
    };
    const fuel = session.durationMin > 0 ? recommendFuel(session) : null;
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
      where: { userId: user.id, status: "connected", provider: { in: ["strava", "whoop", "oura", "google_cal", ...(intervalsConnectorEnabled() ? ["intervals"] : [])] } },
      select: { provider: true },
    });
    for (const { provider } of connectedProviders)
      await enqueueSyncJob(user.id, "sync", `checkin:${provider}:${user.id}:${hourKey}`, { provider }).catch(() => {});
    return NextResponse.json({
      ok: true,
      freshness: syncFreshness.freshness,
      freshnessNote: syncFreshness.note,
      providerFreshness: syncFreshness.providers,
      ...saved,
      prescription,
      adaptation,
      executionFeedback: { inputs: execution.inputs, notes: execution.notes },
      fuel,
      ergos,
      post: session.durationMin ? postWorkoutFuel({ ...session, weightKg: checkin.weightKg ?? profile?.weightKg ?? undefined }) : null,
      stim: adaptation.safetyStatus !== "clear" ? null : {
        pre: stimPlan("pre", { hardSession: hard }),
        during: stimPlan("during", { hardSession: hard }),
        post: stimPlan("post", { hardSession: false }),
        night: stimPlan("night", { hardSession: false }),
      },
      recovery: adaptation.safetyStatus === "clear" ? recovery() : null,
      fuelBrands: session.durationMin > 0 ? fuelBrandsFor(session.durationMin) : [],
      sources: sources(),
      cycle: adaptation.safetyStatus === "clear" ? cycleAdvice(checkin.cycleDay, profile?.sex ?? null) : null,
      youth: youthPolicy(profile?.birthYear ?? null),
      protein: adaptation.safetyStatus !== "clear" ? null : {
        perKg: proteinPerKg(
          profile?.sex ?? null,
          session.sport === "strength",
          profile?.birthYear ?? null,
        ),
        note: "Daily target, adjusted to the saved profile.",
      },
      hydration: adaptation.safetyStatus !== "clear" ? null : {
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
