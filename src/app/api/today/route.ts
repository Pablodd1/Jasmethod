import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { recoveryFor, recommendFuel, recommendErgogenics, postWorkoutFuel } from "@/lib/adaptive";
import { buildSessionDetail } from "@/lib/science";
import { stimPlan } from "@/lib/stimulation";

// Never prerender — per-athlete data.
export const dynamic = "force-dynamic";

// GET /api/today — everything the "Today's Training" first page needs:
// the prescribed session (WU/main/CD/breathing), pre-fuel/ergogenics,
// intra-fuel, post-workout nutrition, stimulation, targets from the
// athlete's own baselines, device/telegram status and race countdown.
// No check-in required — this is the prescribed-as-is view; the check-in
// adapts it via POST /api/checkin (which rewrites the workout in place).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lang = (user.language || "es") as string;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + 1);

  const [profile, sessions, prefs, races, connectors, reminder] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
    prisma.workout.findMany({
      where: { userId: user.id, date: { gte: today, lt: end }, planned: true },
      include: { planDay: { select: { notes: true, dayOff: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.supplementProfile.findUnique({ where: { userId: user.id } }),
    prisma.race.findMany({ where: { userId: user.id, date: { gte: today } }, orderBy: { date: "asc" }, take: 2 }),
    prisma.connector.findMany({ where: { userId: user.id, status: "connected" }, select: { provider: true, lastSyncAt: true } }),
    prisma.reminderPref.findUnique({ where: { userId: user.id } }),
  ]);

  const dayOff = sessions[0]?.planDay?.dayOff ?? false;
  const primary = sessions[0] || null;

  // Session detail (WU/main/CD/breathing/study) — prefers the stored
  // prescription notes written by the check-in adaptation.
  const detail = primary
    ? buildSessionDetail(
        { sport: primary.sport, type: primary.type, zone: primary.intensity || "z2", minutes: primary.durationMin, description: primary.notes || primary.planDay?.notes || primary.title || "" },
        primary.recovery || undefined,
      )
    : null;

  // Pacing targets from the athlete's own baselines (same math as prescribeToday).
  const targets: { hr?: string; power?: string; pace?: string; rpe: number } = { rpe: 7 };
  if (primary && profile) {
    const capZ = primary.intensity || "z2";
    if (profile.lthr && capZ !== "z1") {
      const cap = capZ === "z2" ? 0.85 : capZ === "z4" ? 0.95 : 1.05;
      targets.hr = `${Math.round(profile.lthr * 0.8)}-${Math.round(profile.lthr * cap)} bpm`;
    }
    if (profile.ftp && primary.sport === "bike") {
      const f = capZ === "z2" ? 0.75 : capZ === "z4" ? 0.9 : 1.05;
      targets.power = `≤${Math.round(profile.ftp * f)} W`;
    }
    if (profile.runPaceBase && primary.sport === "run") {
      targets.pace = capZ === "z2" || capZ === "z1"
        ? `${Math.round((profile.runPaceBase * 1.15) / 5) * 5}-${Math.round((profile.runPaceBase * 1.3) / 5) * 5} sec/km`
        : `~${Math.round((profile.runPaceBase * 0.95) / 5) * 5} sec/km`;
    }
  }

  // Pre/intra/post fuel + ergogenics + post-breathing arc.
  const durationMin = primary?.durationMin ?? 0;
  const intensity = primary?.intensity || "z2";
  const fuel = recommendFuel({ durationMin, intensity });
  const supplementPrefs = {
    enabled: prefs ? prefs.enabled : true,
    likes: JSON.parse(prefs?.likes || "[]"),
    dislikes: JSON.parse(prefs?.dislikes || "[]"),
    optsOut: JSON.parse(prefs?.optsOut || "[]"),
  };
  const ergos = primary
    ? recommendErgogenics(supplementPrefs, { sport: primary.sport, type: primary.type, durationMin, intensity })
    : { recommended: [], reason: "Rest day" };
  const post = primary ? postWorkoutFuel({ durationMin, intensity, sport: primary.sport }) : null;
  const recovery = recoveryFor(new Date());
  const stim = {
    pre: stimPlan("pre", { hardSession: ["z4", "z5", "z6", "z7", "interval", "threshold"].includes(intensity) }),
    post: stimPlan("post", { hardSession: false }),
    night: stimPlan("night", { hardSession: false }),
  };

  // Race countdown (A-race first).
  const aRace = races.find((r) => r.priority === 1) || races[0] || null;
  const daysToRace = aRace ? Math.ceil((new Date(aRace.date).getTime() - today.getTime()) / 86400000) : null;

  return NextResponse.json({
    date: today.toISOString(),
    dayOff,
    sessions: sessions.map((s) => ({ id: s.id, sport: s.sport, title: s.title, durationMin: s.durationMin, intensity: s.intensity, type: s.type, approved: s.approved, startTime: s.startTime })),
    detail,
    targets,
    fuel,
    ergos,
    post,
    recovery: { key: recovery.dailyKey, name: recovery.technique.name, minutes: recovery.technique.minutes, instructions: recovery.technique.instructions },
    stim,
    race: aRace ? { name: aRace.name, date: aRace.date, daysAway: daysToRace } : null,
    devices: {
      connected: connectors.map((c) => c.provider),
      count: connectors.length,
      lastSyncAt: connectors[0]?.lastSyncAt || null,
    },
    telegram: { enabled: Boolean(reminder?.telegramEnabled && reminder.telegramChatId) },
    language: lang,
  });
}
