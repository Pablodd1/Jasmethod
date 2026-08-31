import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { adaptSession, recommendFuel, recommendErgogenics, temperatureAdjustment, recoveryFor, morningWeightTrend, postWorkoutFuel, prescribeToday, type Checkin, type SupplementPrefs } from "@/lib/adaptive";
import { stimPlan } from "@/lib/stimulation";
import { cycleAdvice, youthPolicy, proteinPerKg } from "@/lib/cycle";
import { t, type Lang } from "@/lib/i18n";
import { fuelBrandsFor } from "@/lib/fuelbrands";
import { sourcesFor } from "@/lib/research";

function dayStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

function loadPrefs(s: { enabled: boolean; likes?: string | null; dislikes?: string | null; optsOut?: string | null } | null): SupplementPrefs {
  const arr = (v?: string | null) => { try { const p = v ? JSON.parse(v) : []; return Array.isArray(p) ? p : []; } catch { return []; } };
  return { enabled: s?.enabled ?? true, likes: arr(s?.likes), dislikes: arr(s?.dislikes), optsOut: arr(s?.optsOut) };
}

function translatedRecovery(lang: Lang) {
  const r = recoveryFor(new Date());
  return {
    key: r.dailyKey,
    name: t(lang, `rec.${r.dailyKey}.name`),
    minutes: r.technique.minutes,
    instructions: t(lang, `rec.${r.dailyKey}.instr`),
    weeklyTheme: r.weeklyTheme,
    monthlyFocus: r.monthlyFocus,
  };
}

// Core evidence backing today's recommendations (ranked human studies)
const CORE_SOURCE_IDS = ["seiler2009", "buchheit2014", "jeukendrup2014", "thomas2016", "ais2021", "goldstein2010", "casa2000"];

// GET /api/checkin — today's check-in + live recommendations
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = dayStart(new Date());
  const lang = (user.language || "es") as Lang;
  const checkin = await prisma.dailyCheckin.findUnique({ where: { userId_date: { userId: user.id, date: today } } });
  const todaySession = await prisma.workout.findFirst({
    where: { userId: user.id, date: { gte: today, lt: new Date(today.getTime() + 86400000) }, planned: true },
    orderBy: { date: "asc" },
  });
  const recovery = translatedRecovery(lang);
  const fuelBrands = fuelBrandsFor(todaySession?.durationMin || 0);
  const sources = sourcesFor(CORE_SOURCE_IDS);
  // Today's appointments — surface them even before submitting the checkin
  const todayAppointments = await prisma.calendarEvent.findMany({
    where: { userId: user.id, type: "appointment", date: { gte: today, lt: new Date(today.getTime() + 86400000) } },
    orderBy: { date: "asc" },
    select: { title: true, startTime: true, endTime: true },
  });
  return NextResponse.json({ checkin, recovery, fuelBrands, sources, language: lang, calendar: { busyCount: todayAppointments.length, appointments: todayAppointments } });
}

// POST /api/checkin — submit the daily questionnaire; returns adaptation + fuel + ergos
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    const checkin: Checkin = {
      sleep: parseInt(b.sleep ?? "3", 10),
      soreness: parseInt(b.soreness ?? "3", 10),
      motivation: parseInt(b.motivation ?? "3", 10),
      energy: parseInt(b.energy ?? "3", 10),
      stress: parseInt(b.stress ?? "3", 10),
      sick: Boolean(b.sick),
      menstrual: b.menstrual === true,
      cycleDay: b.cycleDay ? parseInt(b.cycleDay, 10) : undefined,
      weightKg: b.weightKg ? parseFloat(b.weightKg) : undefined,
      rhr: b.rhr ? parseInt(b.rhr, 10) : undefined,
    };
    // Manual biometrics for athletes without a synced device but with an HR
    // watch/app: HRV (RMSSD) + sleep hours, analyzed alongside weight/RHR.
    const hrv = b.hrv ? parseFloat(b.hrv) : undefined;
    const sleepHours = b.sleepHours ? parseFloat(b.sleepHours) : undefined;

    // 7-day baselines from stored daily metrics — so morning weight + RHR are
    // actually analyzed, not just collected.
    const since = new Date(Date.now() - 12 * 86400000);
    const metrics = await prisma.dailyMetrics.findMany({ where: { userId: user.id, date: { gte: since } }, orderBy: { date: "asc" } });
    const rhrs = metrics.filter((m) => m.restingHr).map((m) => m.restingHr as number);
    if (checkin.rhr && rhrs.length >= 3) {
      checkin.rhrBaseline = Math.round(rhrs.slice(0, -1).reduce((a, v) => a + v, 0) / (rhrs.length - 1));
    }

    // Today's planned session (for fuel/ergo context + adaptation note)
    const start = dayStart(new Date());
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const todaySession = await prisma.workout.findFirst({
      where: { userId: user.id, date: { gte: start, lt: end }, planned: true },
      orderBy: { date: "asc" },
      select: { id: true, sport: true, title: true, type: true, intensity: true, durationMin: true, startTime: true, planDay: { select: { notes: true } } },
    });
    const userProfile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });

    // Female-cycle + youth awareness (sex/age-specific coaching)
    const cycle = cycleAdvice(checkin.cycleDay, userProfile?.sex ?? null);
    const youth = youthPolicy(userProfile?.birthYear ?? null);
    const protein = {
      perKg: proteinPerKg(userProfile?.sex ?? null, todaySession?.sport === "strength", userProfile?.birthYear ?? null),
      note: cycle ? `Female athlete, ${cycle.label} phase → ~${cycle.proteinPerKg.toFixed(1)} g/kg/day (Williamson 2023).` : `Protein target ~${(proteinPerKg(userProfile?.sex ?? null, todaySession?.sport === "strength", userProfile?.birthYear ?? null)).toFixed(1)} g/kg/day (ISSN 2017).`,
    };

    const adaptation = adaptSession(checkin);

    // Lifestyle awareness: today's appointments from calendar (meetings, busy time).
    // The coach uses this to keep the prescription realistic — no 2-hour ride on
    // a day with 4 back-to-back meetings.
    const todayAppointments = await prisma.calendarEvent.findMany({
      where: { userId: user.id, type: "appointment", date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
      select: { title: true, startTime: true, endTime: true },
    });
    const busyCount = todayAppointments.length;
    let busyHrs = 0;
    let busyNote = null;
    if (busyCount > 0) {
      busyHrs = todayAppointments.reduce((s, a) => {
        if (a.startTime && a.endTime) {
          const [sh, sm] = a.startTime.split(":").map(Number);
          const [eh, em] = a.endTime.split(":").map(Number);
          return s + Math.max(0, (eh * 60 + em) - (sh * 60 + sm)) / 60;
        }
        return s + 1; // all-day or unknown length ≈ 1h
      }, 0);
      busyNote = `${busyCount} meeting${busyCount > 1 ? "s" : ""} on your calendar today (~${Math.round(busyHrs)}h busy). ${
        busyHrs >= 6 ? "Heavy day — keep training short and high-yield if you train at all." :
        busyHrs >= 3 ? "Medium day — a compact session fits if you schedule it between commitments." :
        "Light calendar — normal session fits."
      }`;
    }

    // fuel: heat factor if an A-race is within 7 days
    let heatFactor = 1;
    const nearRace = await prisma.race.findFirst({
      where: { userId: user.id, priority: 1, date: { gte: start, lte: new Date(start.getTime() + 7 * 86400000) } },
      orderBy: { date: "asc" },
    });
    if (nearRace?.targetTempC != null) heatFactor = temperatureAdjustment(nearRace.targetTempC).hydrationFactor;

    const fuel = todaySession
      ? recommendFuel({ durationMin: todaySession.durationMin, intensity: todaySession.intensity || "z2", heatFactor })
      : recommendFuel({ durationMin: 0, intensity: "z1" });

    // ergos: match to today's session + respect supplement prefs
    const sp = await prisma.supplementProfile.findUnique({ where: { userId: user.id } });
    const prefs = loadPrefs(sp as any);
    const ergos = todaySession
      ? recommendErgogenics(prefs, { sport: todaySession.sport, type: todaySession.type, durationMin: todaySession.durationMin, intensity: todaySession.intensity || undefined })
      : { recommended: [], reason: "Rest day — no ergogenic aids needed." };
    const ergosIncludeCaffeine = (ergos.recommended || []).some((e: any) => e.key === "caffeine");
    if (todaySession && ergosIncludeCaffeine) {
      fuel.notes += " Caffeine already covered in ergogenic picks — same pre-session timing, no double dose.";
    }

    // Post-workout recovery fueling + stimulation plan (music/brain/breath)
    const post = todaySession
      ? postWorkoutFuel({ durationMin: todaySession.durationMin, intensity: todaySession.intensity || "z2", heatFactor, sport: todaySession.sport })
      : null;
    const hardSession = Boolean(todaySession && ["z4","z5","z6","z7","interval","threshold","test","race"].includes(todaySession.intensity || todaySession.type));
    const stim = {
      pre: stimPlan("pre", { hardSession }),
      during: todaySession ? stimPlan("during", { hardSession }) : null,
      post: stimPlan("post", { hardSession }),
      night: stimPlan("night", { hardSession }),
    };

    // THE prescription: detailed session for today, scaled by recovery + calendar.
    const prescription = todaySession
      ? prescribeToday({
          session: {
            sport: todaySession.sport,
            title: todaySession.title,
            type: todaySession.type,
            intensity: todaySession.intensity,
            durationMin: todaySession.durationMin,
            description: todaySession.planDay?.notes || todaySession.title,
            startTime: todaySession.startTime,
          },
          adaptation,
          busyNote,
          busyHrs,
          profile: userProfile ? { lthr: userProfile.lthr, ftp: userProfile.ftp, runPaceBase: userProfile.runPaceBase } : null,
        })
      : null;
    // Persist the scaled plan back onto today's workout so the athlete sees it all day
    if (prescription && todaySession) {
      await prisma.workout.update({
        where: { id: todaySession.id },
        data: {
          durationMin: prescription.durationMin,
          notes: `[Prescribed ${prescription.scaled.reason}] ${prescription.detail.main}`,
        },
      });
    }

    // ---- Tomorrow's session rides today's readiness too ----
    // Recovery lags one day: a red today softens tomorrow so the calendar
    // reflects the biometrics immediately (user product rule).
    const tomorrowStart = new Date(start); tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowSession = await prisma.workout.findFirst({
      where: { userId: user.id, date: { gte: tomorrowStart, lt: new Date(tomorrowStart.getTime() + 86400000) }, planned: true },
      orderBy: { date: "asc" },
      select: { id: true, sport: true, title: true, type: true, intensity: true, durationMin: true, notes: true, planDay: { select: { notes: true } } },
    });
    let tomorrowAdjustment: { title: string; durationMin: number; note: string } | null = null;
    if (tomorrowSession) {
      // carry-over: today's verdict applies at half weight to tomorrow
      const tomorrowFactor = adaptation.verdict === "rest" ? 0.6 : adaptation.verdict === "easy" ? 0.75 : adaptation.verdict === "trim" ? 0.9 : 1;
      if (tomorrowFactor < 1) {
        const newDur = Math.max(20, Math.round(tomorrowSession.durationMin * tomorrowFactor));
        await prisma.workout.update({
          where: { id: tomorrowSession.id },
          data: {
            durationMin: newDur,
            notes: `[Adapted from yesterday's check-in — ${adaptation.verdict} day, duration ×${tomorrowFactor}] ${tomorrowSession.planDay?.notes || tomorrowSession.title}`,
          },
        });
        tomorrowAdjustment = {
          title: tomorrowSession.title,
          durationMin: newDur,
          note: `Tomorrow adjusted: ${adaptation.verdict} today → duration ×${tomorrowFactor} (${tomorrowSession.durationMin}→${newDur} min). It will re-scale after tomorrow's own check-in.`,
        };
      }
    }

    const saved = await prisma.dailyCheckin.upsert({
      where: { userId_date: { userId: user.id, date: start } },
      create: {
        userId: user.id,
        date: start,
        answers: JSON.stringify(checkin),
        adaptation: JSON.stringify(adaptation),
        fuel: JSON.stringify(fuel),
        ergos: JSON.stringify(ergos.recommended.map((e) => e.key)),
      },
      update: {
        answers: JSON.stringify(checkin),
        adaptation: JSON.stringify(adaptation),
        fuel: JSON.stringify(fuel),
        ergos: JSON.stringify(ergos.recommended.map((e) => e.key)),
      },
    });

    // Persist morning weight + RHR + HRV + sleep hours into daily metrics so the
    // trends compound (weight trend, RHR baseline, HRV baseline, sleep tracking).
    if (checkin.weightKg !== undefined || checkin.rhr !== undefined || hrv !== undefined || sleepHours !== undefined) {
      await prisma.dailyMetrics.upsert({
        where: { userId_date: { userId: user.id, date: start } },
        create: { userId: user.id, date: start, source: "manual", weightKg: checkin.weightKg, restingHr: checkin.rhr, hrv, sleepHours },
        update: {
          ...(checkin.weightKg !== undefined && { weightKg: checkin.weightKg }),
          ...(checkin.rhr !== undefined && { restingHr: checkin.rhr }),
          ...(hrv !== undefined && { hrv }),
          ...(sleepHours !== undefined && { sleepHours }),
        },
      });
    }

    // HRV note: morning RMSSD below the 7-day baseline signals under-recovery.
    const hrvs = metrics.filter((m) => m.hrv).map((m) => m.hrv as number);
    const hrvBaseline = hrvs.length >= 3 ? Math.round(hrvs.slice(0, -1).reduce((a, v) => a + v, 0) / (hrvs.length - 1)) : null;
    const hrvNote = hrv == null || hrvBaseline == null ? null
      : hrv < hrvBaseline * 0.9 ? `HRV ${hrv} ms is well below your ${hrvBaseline} ms baseline — parasympathetic recovery is low, keep today easy.`
      : hrv > hrvBaseline * 1.1 ? `HRV ${hrv} ms is above your ${hrvBaseline} ms baseline — you're recovering well.`
      : `HRV ${hrv} ms is in line with your ${hrvBaseline} ms baseline.`;
    const sleepNote = sleepHours == null ? null
      : sleepHours < 7 ? `Slept ${sleepHours}h last night — under 7h, prioritize an early night tonight (Mah 2011: sleep extension lifts performance).`
      : sleepHours >= 8 ? `Slept ${sleepHours}h — solid. Keep the consistent bed/wake time.`
      : `Slept ${sleepHours}h — decent, but aim for 8h.`;

    // Weight trend (last 3 mornings vs the ones before) + RHR note
    const weightTrend = morningWeightTrend([
      ...metrics.map((m) => ({ date: m.date, weightKg: m.weightKg })),
      ...(checkin.weightKg !== undefined ? [{ date: start, weightKg: checkin.weightKg }] : []),
    ]);
    const rhrDelta = checkin.rhr && checkin.rhrBaseline ? checkin.rhr - checkin.rhrBaseline : null;
    const rhrNote = rhrDelta === null ? null
      : rhrDelta > 6 ? `RHR ${rhrDelta}+ bpm over baseline — recovery is lagging.`
      : rhrDelta < -6 ? "RHR below baseline — recovered."
      : "RHR in range.";

    return NextResponse.json({
      ok: true,
      checkin: saved,
      adaptation,
      prescription,
      cycle,
      youth,
      protein,
      fuel,
      ergos,
      post,
      stim,
      recovery: translatedRecovery((user.language || "es") as Lang),
      fuelBrands: fuelBrandsFor(todaySession?.durationMin || 0),
      sources: sourcesFor(CORE_SOURCE_IDS),
      hydration: { weightTrend, rhrNote, hrvNote, sleepNote, rhrBaseline: checkin.rhrBaseline ?? null },
      calendar: { busyCount, busyNote },
      tomorrowAdjustment,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
