if (
  process.env.NODE_ENV === "production" ||
  process.env.ENABLE_LOCAL_DEMO !== "1"
)
  throw new Error(
    "Demo seeds are disabled. Use an isolated development database and ENABLE_LOCAL_DEMO=1.",
  );
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";
import { generatePlan, generateHyroxPlan } from "../src/lib/science";
import { recoveryFor } from "../src/lib/adaptive";

const prisma = new PrismaClient();

const PASSWORD = "demo1234";

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

interface SessionSpec {
  sport: string;
  title: string;
  type: string;
  minutes: number;
  zone: string;
  description: string;
}

// Simple run-focused schedule for the runner persona (no swim/bike).
function runSchedule(weeks: number): SessionSpec[] {
  const weekly: SessionSpec[] = [
    {
      sport: "run",
      title: "Run: Easy Aerobic",
      type: "endurance",
      minutes: 45,
      zone: "z2",
      description:
        "Easy Z2 run — keep HR capped at ~75% LTHR, conversational pace.",
    },
    {
      sport: "run",
      title: "Run: Track Intervals",
      type: "interval",
      minutes: 50,
      zone: "z5",
      description: "6×800m at vVO2max with 400m jog recovery (Billat 2001).",
    },
    {
      sport: "strength",
      title: "Strength: Legs + Core",
      type: "strength",
      minutes: 30,
      zone: "z1",
      description:
        "Running-specific strength: squats, lunges, calf raises, core.",
    },
    {
      sport: "run",
      title: "Run: Tempo",
      type: "threshold",
      minutes: 55,
      zone: "z4",
      description: "3×10 min at T-pace with 3 min easy (Friel threshold).",
    },
    {
      sport: "run",
      title: "Run: Long Run",
      type: "endurance",
      minutes: 90,
      zone: "z2",
      description: "Long aerobic run. Fuel 30-60g carbs/h if >90 min.",
    },
    {
      sport: "recovery",
      title: "Recovery: Mobility + Strides",
      type: "recovery",
      minutes: 25,
      zone: "z1",
      description: "Easy flush + 4×20s strides. Prioritize sleep tonight.",
    },
  ];
  const out: SessionSpec[] = [];
  for (let w = 0; w < weeks; w++) {
    const scale = 0.9 + 0.04 * w;
    for (const s of weekly)
      out.push({ ...s, minutes: Math.max(20, Math.round(s.minutes * scale)) });
  }
  return out;
}

function metricsFor(
  sport: string,
  zone: string,
  p: { lthr?: number | null; ftp?: number | null; durationMin: number },
) {
  const zf: Record<string, number> = {
    z1: 0.72,
    z2: 0.76,
    z3: 0.85,
    z4: 0.92,
    z5: 0.98,
    z6: 1.02,
    z7: 1.05,
  };
  const factor = zf[zone] ?? 0.76;
  const avgHr = p.lthr ? Math.round(p.lthr * factor) : null;
  const avgPower =
    sport === "bike" && p.ftp ? Math.round(p.ftp * factor * 0.95) : null;
  const calPerMin =
    sport === "swim" ? 9 : sport === "bike" ? 10 : sport === "run" ? 11 : 8;
  return {
    avgHr,
    avgPower,
    calories: Math.round(p.durationMin * calPerMin * factor),
  };
}

interface Persona {
  email: string;
  name: string;
  avatar: string;
  profile: Record<string, any>;
  sport: "triathlon" | "hyrox" | "run";
  distance: string;
  weeks: number;
  style: string;
  metricsBase: { hrv: number; rhr: number; sleep: number; weight: number };
  races: {
    name: string;
    distance: string;
    date: Date;
    startTime?: string;
    location?: string;
    targetTempC?: number;
    humidity?: number;
    baseElevM?: number;
    bikeElevM?: number;
    bikeTerrain?: string;
    runElevM?: number;
    runTerrain?: string;
    swimVenue?: string;
    waterTempC?: number;
    swimCurrent?: string;
    priority?: number;
  }[];
}

const PERSONAS: Persona[] = [
  {
    email: "jasmel@jasmiamimethod.com",
    name: "Jasmel",
    avatar: "🏊",
    sport: "triathlon",
    distance: "half",
    weeks: 16,
    style: "coach",
    metricsBase: { hrv: 62, rhr: 48, sleep: 7.2, weight: 74 },
    profile: {
      birthYear: 1991,
      sex: "male",
      heightCm: 180,
      weightKg: 74,
      experience: "advanced",
      goal: "half",
      weeklyHours: 12,
      vo2max: 52,
      lthr: 165,
      maxHr: 185,
      ftp: 250,
      runPaceBase: 270,
      swimPaceBase: 95,
    },
    races: [
      {
        name: "Miami 70.3",
        distance: "half",
        date: new Date(Date.now() + 45 * 86400000),
        startTime: "07:00",
        location: "Miami, FL",
        targetTempC: 28,
        humidity: 75,
        baseElevM: 15,
        bikeElevM: 650,
        bikeTerrain: "rolling",
        runElevM: 120,
        runTerrain: "flat",
        swimVenue: "ocean",
        waterTempC: 23,
        swimCurrent: "mild",
        priority: 1,
      },
    ],
  },
  {
    email: "andres@jasmiamimethod.com",
    name: "Andres",
    avatar: "💪",
    sport: "hyrox",
    distance: "hyrox",
    weeks: 12,
    style: "tough",
    metricsBase: { hrv: 55, rhr: 52, sleep: 6.8, weight: 82 },
    profile: {
      birthYear: 1995,
      sex: "male",
      heightCm: 175,
      weightKg: 82,
      experience: "amateur",
      goal: "hyrox",
      weeklyHours: 7,
      lthr: 158,
      maxHr: 190,
      runPaceBase: 310,
    },
    races: [
      {
        name: "Hyrox Miami",
        distance: "hyrox",
        date: new Date(Date.now() + 30 * 86400000),
        startTime: "09:00",
        location: "Miami Beach, FL",
        priority: 1,
      },
    ],
  },
  {
    email: "jando@jasmiamimethod.com",
    name: "Jando",
    avatar: "🏃",
    sport: "run",
    distance: "full",
    weeks: 12,
    style: "gentle",
    metricsBase: { hrv: 70, rhr: 45, sleep: 7.5, weight: 68 },
    profile: {
      birthYear: 1988,
      sex: "male",
      heightCm: 172,
      weightKg: 68,
      experience: "advanced",
      goal: "full",
      weeklyHours: 9,
      vo2max: 58,
      lthr: 172,
      maxHr: 188,
      runPaceBase: 235,
    },
    races: [
      {
        name: "Miami Marathon",
        distance: "full",
        date: new Date(Date.now() + 70 * 86400000),
        startTime: "06:00",
        location: "Miami, FL",
        targetTempC: 26,
        humidity: 70,
        runElevM: 90,
        runTerrain: "flat",
        priority: 1,
      },
    ],
  },
];

async function seedMetrics(
  userId: string,
  base: Persona["metricsBase"],
  days = 30,
) {
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = dayStart(d);
    const existing = await prisma.dailyMetrics
      .findUnique({ where: { userId_date: { userId, date } } })
      .catch(() => null);
    if (existing) continue;
    const hrv = Math.round(
      base.hrv + Math.sin(i / 4) * 8 + (Math.random() * 6 - 3),
    );
    const rhr = Math.round(base.rhr + Math.random() * 4 - 2);
    const sleep =
      Math.round((base.sleep + Math.random() * 1.2 - 0.6) * 10) / 10;
    const recovery = Math.max(
      20,
      Math.min(100, Math.round(50 + (hrv - base.hrv) * 2 + Math.random() * 15)),
    );
    await prisma.dailyMetrics.create({
      data: {
        userId,
        date,
        hrv,
        restingHr: rhr,
        rhr,
        sleepHours: sleep,
        recoveryScore: recovery,
        weightKg:
          Math.round((base.weight + Math.random() * 0.8 - 0.4) * 10) / 10,
        source: "whoop",
      },
    });
  }
}

async function seedSleep(userId: string, days = 30) {
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = dayStart(d);
    const existing = await prisma.sleepRecord
      .findUnique({ where: { userId_date: { userId, date } } })
      .catch(() => null);
    if (existing) continue;
    const hours = Math.round((6.5 + Math.random() * 1.8) * 10) / 10;
    await prisma.sleepRecord.create({
      data: {
        userId,
        date,
        hours,
        deepHours: Math.round(hours * 0.22 * 10) / 10,
        remHours: Math.round(hours * 0.25 * 10) / 10,
        lightHours: Math.round(hours * 0.53 * 10) / 10,
        awakenings: Math.round(Math.random() * 3),
        efficiency: Math.round(80 + Math.random() * 15),
        quality: Math.round(60 + Math.random() * 30),
        source: "whoop",
      },
    });
  }
}

async function seedPersona(p: Persona) {
  const user = await prisma.user.upsert({
    where: { email: p.email },
    create: {
      email: p.email,
      passwordHash: hashPassword(PASSWORD),
      name: p.name,
      role: "athlete",
      avatar: p.avatar,
      profile: { create: p.profile },
      motivation: {
        create: { dailyQuote: true, emailDigest: false, style: p.style },
      },
    },
    update: { name: p.name, avatar: p.avatar },
  });

  const start = new Date();
  start.setDate(start.getDate() - 30); // plan started 30 days ago
  const sessions: SessionSpec[] =
    p.sport === "hyrox"
      ? generateHyroxPlan({
          level: p.profile.experience,
          weeks: p.weeks,
          startDate: start,
          weeklyHours: p.profile.weeklyHours,
        }).flatMap((w) => w.sessions as any)
      : p.sport === "run"
        ? runSchedule(p.weeks)
        : generatePlan({
            level: p.profile.experience,
            distance: p.distance,
            weeks: p.weeks,
            startDate: start,
            weeklyHours: p.profile.weeklyHours,
          }).flatMap((w) => w.sessions as any);

  const completedCount = Math.floor(sessions.length * 0.42);

  await prisma.trainingPlan.create({
    data: {
      userId: user.id,
      name: `${p.name}'s ${p.distance} plan`,
      level: p.profile.experience,
      distance: p.distance,
      weeks: p.weeks,
      startDate: start,
      raceDate: new Date(start.getTime() + p.weeks * 7 * 86400000),
      easyPct: 70,
      days: {
        create: sessions.map((s, si) => {
          const date = new Date(start);
          date.setDate(date.getDate() + si);
          const completed = si < completedCount;
          const m = completed
            ? metricsFor(s.sport, s.zone, {
                lthr: p.profile.lthr,
                ftp: p.profile.ftp,
                durationMin: s.minutes,
              })
            : null;
          return {
            date,
            week: Math.floor(si / 7) + 1,
            dayOfWeek: date.getDay(),
            focus: s.sport,
            notes: s.description,
            sessions: {
              create: {
                userId: user.id,
                date,
                sport: s.sport,
                title: s.title,
                type: s.type,
                durationMin: s.minutes,
                intensity: s.zone,
                rpe:
                  s.zone === "z1" || s.zone === "z2"
                    ? 3
                    : s.zone === "z3"
                      ? 5
                      : s.zone === "z4"
                        ? 7
                        : 9,
                planned: true,
                completed,
                source: "plan",
                recovery: recoveryFor(date).cooldownNote,
                ...(m
                  ? {
                      avgHr: m.avgHr,
                      avgPower: m.avgPower,
                      calories: m.calories,
                    }
                  : {}),
              },
            },
          };
        }),
      },
    },
  });

  await seedMetrics(user.id, p.metricsBase);
  await seedSleep(user.id);
  for (const r of p.races) {
    await prisma.race.upsert({
      where: { id: `${user.id}-${r.name}` },
      create: { id: `${user.id}-${r.name}`, userId: user.id, ...r },
      update: { userId: user.id },
    });
  }
  console.log(
    `Seeded ${p.name} (${p.avatar} ${p.sport}) — ${p.email} / ${PASSWORD}`,
  );
}

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SEED_DEMO !== "true"
  ) {
    console.log("Skipping seed (production). Set SEED_DEMO=true to seed.");
    return;
  }

  // Demo athlete (original)
  const demo = await prisma.user.upsert({
    where: { email: "demo@jasmiamimethod.com" },
    create: {
      email: "demo@jasmiamimethod.com",
      passwordHash: hashPassword("demo1234"),
      name: "Demo Athlete",
      role: "athlete",
      avatar: "🧑",
      profile: {
        create: {
          birthYear: 1992,
          sex: "male",
          heightCm: 178,
          weightKg: 74,
          experience: "amateur",
          goal: "olympic",
          weeklyHours: 10,
          vo2max: 46,
          lthr: 162,
          ftp: 240,
          runPaceBase: 280,
          swimPaceBase: 96,
        },
      },
      motivation: {
        create: { dailyQuote: true, emailDigest: false, style: "coach" },
      },
    },
    update: { avatar: "🧑" },
  });
  console.log(`Seeded demo: ${demo.email} / demo1234`);

  for (const p of PERSONAS) await seedPersona(p);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
