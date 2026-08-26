import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { adaptSession, recommendFuel, recommendErgogenics, temperatureAdjustment, recoveryFor, type Checkin, type SupplementPrefs } from "@/lib/adaptive";
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
  const lang = (user.language || "en") as Lang;
  const checkin = await prisma.dailyCheckin.findUnique({ where: { userId_date: { userId: user.id, date: today } } });
  const todaySession = await prisma.workout.findFirst({
    where: { userId: user.id, date: { gte: today, lt: new Date(today.getTime() + 86400000) }, planned: true },
    orderBy: { date: "asc" },
  });
  const recovery = translatedRecovery(lang);
  const fuelBrands = fuelBrandsFor(todaySession?.durationMin || 0);
  const sources = sourcesFor(CORE_SOURCE_IDS);
  return NextResponse.json({ checkin, recovery, fuelBrands, sources, language: lang });
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
    };

    // Today's planned session (for fuel/ergo context + adaptation note)
    const start = dayStart(new Date());
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const todaySession = await prisma.workout.findFirst({
      where: { userId: user.id, date: { gte: start, lt: end }, planned: true },
      orderBy: { date: "asc" },
    });

    const adaptation = adaptSession(checkin);

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

    return NextResponse.json({
      ok: true,
      checkin: saved,
      adaptation,
      fuel,
      ergos,
      recovery: translatedRecovery((user.language || "en") as Lang),
      fuelBrands: fuelBrandsFor(todaySession?.durationMin || 0),
      sources: sourcesFor(CORE_SOURCE_IDS),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
