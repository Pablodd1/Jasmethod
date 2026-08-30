// Idempotent provisioning for the two real MVP accounts.
//   Evgenia T — evgenia@jasmiamimethod.com — "123456789"  (athlete, run + gym)
//   Jasmel    — jasmel@jasmiamimethod.com   — "12345679"   (admin, triathlon + Miami 70.3)
// Run from the project root:  npx tsx scripts/create-accounts.ts
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Load DATABASE_URL / DIRECT_URL from .env manually (PrismaClient does not auto-load).
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const line = raw.split("\n").find((l) => l.trim().startsWith(key + "="));
    if (line) {
      process.env[key] = line.substring(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
    }
  }
}

const prisma = new PrismaClient({ log: ["error"] });
const hash = (pw: string) => bcrypt.hashSync(pw, 10);
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

interface SessionSpec {
  sport: string;
  title: string;
  type: string;
  minutes: number;
  zone: string;
  description: string;
}

function metricsFor(sport: string, zone: string, p: { lthr?: number | null; ftp?: number | null; durationMin: number }) {
  const zf: Record<string, number> = { z1: 0.72, z2: 0.76, z3: 0.85, z4: 0.92, z5: 0.98, z6: 1.02, z7: 1.05 };
  const factor = zf[zone] ?? 0.76;
  const avgHr = p.lthr ? Math.round(p.lthr * factor) : null;
  const avgPower = sport === "bike" && p.ftp ? Math.round(p.ftp * factor * 0.95) : null;
  const calPerMin = sport === "swim" ? 9 : sport === "bike" ? 10 : sport === "run" ? 11 : 8;
  return { avgHr, avgPower, calories: Math.round(p.durationMin * calPerMin * factor) };
}

async function seedMetrics(userId: string, base: { hrv: number; rhr: number; sleep: number; weight: number }, days = 30) {
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const date = dayStart(d);
    const hrv = Math.round(base.hrv + Math.sin(i / 4) * 8 + (Math.random() * 6 - 3));
    const rhr = Math.round(base.rhr + Math.random() * 4 - 2);
    const sleep = Math.round((base.sleep + Math.random() * 1.2 - 0.6) * 10) / 10;
    const recovery = Math.max(20, Math.min(100, Math.round(50 + (hrv - base.hrv) * 2 + Math.random() * 15)));
    await prisma.dailyMetrics.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, hrv, restingHr: rhr, rhr, sleepHours: sleep, recoveryScore: recovery, weightKg: Math.round((base.weight + Math.random() * 0.8 - 0.4) * 10) / 10, source: "whoop" },
      update: { hrv, restingHr: rhr, rhr, sleepHours: sleep, recoveryScore: recovery },
    });
  }
}

async function seedSleep(userId: string, days = 30) {
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const date = dayStart(d);
    const hours = Math.round((6.5 + Math.random() * 1.8) * 10) / 10;
    await prisma.sleepRecord.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, hours, deepHours: Math.round(hours * 0.22 * 10) / 10, remHours: Math.round(hours * 0.25 * 10) / 10, lightHours: Math.round(hours * 0.53 * 10) / 10, awakenings: Math.round(Math.random() * 3), efficiency: Math.round(80 + Math.random() * 15), quality: Math.round(60 + Math.random() * 30), source: "whoop" },
      update: { hours },
    });
  }
}

// Run + strength schedule (Evgenia).
const RUN_GYM_WEEKLY: SessionSpec[] = [
  { sport: "run", title: "Run: Easy Aerobic", type: "endurance", minutes: 40, zone: "z2", description: "Easy Z2 run — conversational pace, HR capped ~75% LTHR." },
  { sport: "strength", title: "Strength: Lower Body", type: "strength", minutes: 45, zone: "z1", description: "Squats, lunges, hip thrusts, calf raises — 3×10-12." },
  { sport: "run", title: "Run: Intervals", type: "interval", minutes: 40, zone: "z5", description: "6×3 min at 10K pace with 2 min easy jog." },
  { sport: "strength", title: "Strength: Upper + Core", type: "strength", minutes: 40, zone: "z1", description: "Push, pull, core circuit — 3 rounds, 60s work / 30s rest." },
  { sport: "run", title: "Run: Tempo", type: "threshold", minutes: 45, zone: "z4", description: "3×8 min at threshold pace, 3 min easy between." },
  { sport: "run", title: "Run: Long Run", type: "endurance", minutes: 75, zone: "z2", description: "Long aerobic run — build endurance base." },
  { sport: "strength", title: "Active Recovery: Mobility + Walk", type: "recovery", minutes: 30, zone: "z1", description: "Easy walk + full-body mobility flow + breathing." },
];

// Triathlon schedule (Jasmel).
const TRI_WEEKLY: SessionSpec[] = [
  { sport: "swim", title: "Swim: Endurance", type: "endurance", minutes: 45, zone: "z2", description: "CSS steady swim, focus on form + bilateral breathing." },
  { sport: "bike", title: "Bike: Endurance", type: "endurance", minutes: 60, zone: "z2", description: "Z2 endurance ride, aero position practice." },
  { sport: "run", title: "Run: Easy Aerobic", type: "endurance", minutes: 40, zone: "z2", description: "Easy Z2 run off the bike." },
  { sport: "strength", title: "Strength: Legs + Core", type: "strength", minutes: 40, zone: "z1", description: "Tri-specific strength: squats, deadlift, core." },
  { sport: "brick", title: "Brick: Bike → Run", type: "threshold", minutes: 75, zone: "z3", description: "45 min bike (Z3) + 30 min run (Z3) transition practice." },
  { sport: "swim", title: "Swim: Threshold Intervals", type: "interval", minutes: 45, zone: "z4", description: "8×200 m at CSS with 20s rest." },
  { sport: "run", title: "Run: Long Run", type: "endurance", minutes: 90, zone: "z2", description: "Long aerobic run — fuel 30-60g carbs/h." },
];

interface AccountSpec {
  email: string;
  name: string;
  password: string;
  role: string;
  avatar: string;
  profile: Record<string, any>;
  motivation: Record<string, any>;
  supplement?: Record<string, any>;
  sport: "rungym" | "triathlon";
  distance: string;
  weeks: number;
  metricsBase: { hrv: number; rhr: number; sleep: number; weight: number };
  races: Record<string, any>[];
}

const ACCOUNTS: AccountSpec[] = [
  {
    email: "evgenia@jasmiamimethod.com",
    name: "Evgenia T",
    password: "123456789",
    role: "athlete",
    avatar: "🏃‍♀️",
    profile: { birthYear: 1993, sex: "female", heightCm: 165, weightKg: 58, experience: "amateur", goal: "olympic", weeklyHours: 8, vo2max: 42, lthr: 158, maxHr: 185, runPaceBase: 320, hasHrm: true, hasGpsWatch: true },
    motivation: { dailyQuote: true, emailDigest: false, style: "gentle" },
    supplement: { enabled: true, likes: JSON.stringify(["creatine"]), dislikes: JSON.stringify(["bicarb"]) },
    sport: "rungym",
    distance: "olympic",
    weeks: 12,
    metricsBase: { hrv: 58, rhr: 54, sleep: 7.0, weight: 58 },
    races: [{ name: "Miami Corporate Run 10K", distance: "10k", date: new Date(Date.now() + 40 * 86400000), startTime: "07:30", location: "Miami, FL", targetTempC: 27, humidity: 72, runElevM: 60, runTerrain: "flat", priority: 1 }],
  },
  {
    email: "jasmel@jasmiamimethod.com",
    name: "Jasmel",
    password: "12345679",
    role: "admin",
    avatar: "🏊",
    profile: { birthYear: 1991, sex: "male", heightCm: 180, weightKg: 74, experience: "advanced", goal: "half", weeklyHours: 12, vo2max: 52, lthr: 165, maxHr: 185, ftp: 250, runPaceBase: 270, swimPaceBase: 95 },
    motivation: { dailyQuote: true, emailDigest: true, style: "coach" },
    sport: "triathlon",
    distance: "half",
    weeks: 16,
    metricsBase: { hrv: 62, rhr: 48, sleep: 7.2, weight: 74 },
    races: [{ name: "Miami 70.3", distance: "half", date: new Date(Date.now() + 45 * 86400000), startTime: "07:00", location: "Miami, FL", targetTempC: 28, humidity: 75, baseElevM: 15, bikeElevM: 650, bikeTerrain: "rolling", runElevM: 120, runTerrain: "flat", swimVenue: "ocean", waterTempC: 23, swimCurrent: "mild", priority: 1 }],
  },
];

async function provision(acc: AccountSpec) {
  const user = await prisma.user.upsert({
    where: { email: acc.email },
    create: {
      email: acc.email,
      passwordHash: hash(acc.password),
      name: acc.name,
      role: acc.role,
      avatar: acc.avatar,
      profile: { create: acc.profile },
      motivation: { create: acc.motivation },
      ...(acc.supplement ? { supplement: { create: acc.supplement } } : {}),
    },
    update: { name: acc.name, role: acc.role, avatar: acc.avatar, passwordHash: hash(acc.password) },
  });

  // Refresh nested records on reruns.
  await prisma.athleteProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...acc.profile },
    update: acc.profile,
  });
  await prisma.motivationPref.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...acc.motivation },
    update: acc.motivation,
  });
  if (acc.supplement) {
    await prisma.supplementProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...acc.supplement },
      update: acc.supplement,
    });
  }

  console.log(`✓ ${acc.name} <${acc.email}> role=${acc.role} pass="${acc.password}"`);

  // Plan
  const weekly = acc.sport === "rungym" ? RUN_GYM_WEEKLY : TRI_WEEKLY;
  const start = new Date(); start.setDate(start.getDate() - 30);
  const sessions: SessionSpec[] = [];
  for (let w = 0; w < acc.weeks; w++) {
    const scale = 0.9 + 0.04 * w;
    for (const s of weekly) sessions.push({ ...s, minutes: Math.max(20, Math.round(s.minutes * scale)) });
  }
  const completedCount = Math.floor(sessions.length * 0.42);

  await prisma.trainingPlan.deleteMany({ where: { userId: user.id } });
  await prisma.trainingPlan.create({
    data: {
      userId: user.id,
      name: `${acc.name}'s ${acc.distance} plan`,
      level: acc.profile.experience,
      distance: acc.distance,
      weeks: acc.weeks,
      startDate: start,
      raceDate: new Date(start.getTime() + acc.weeks * 7 * 86400000),
      easyPct: 70,
      days: {
        create: sessions.map((s, si) => {
          const date = new Date(start); date.setDate(date.getDate() + si);
          const completed = si < completedCount;
          const m = completed ? metricsFor(s.sport, s.zone, { lthr: acc.profile.lthr, ftp: acc.profile.ftp, durationMin: s.minutes }) : null;
          return {
            date, week: Math.floor(si / 7) + 1, dayOfWeek: date.getDay(), focus: s.sport, notes: s.description,
            sessions: {
              create: {
                userId: user.id, date, sport: s.sport, title: s.title, type: s.type, durationMin: s.minutes, intensity: s.zone,
                rpe: s.zone === "z1" || s.zone === "z2" ? 3 : s.zone === "z3" ? 5 : s.zone === "z4" ? 7 : 9,
                planned: true, completed, source: "plan",
                ...(m || {}),
              },
            },
          };
        }),
      },
    },
  });
  console.log(`  plan: ${acc.weeks} weeks / ${sessions.length} sessions`);

  await seedMetrics(user.id, acc.metricsBase);
  await seedSleep(user.id);

  await prisma.race.deleteMany({ where: { userId: user.id } });
  for (const r of acc.races) {
    await prisma.race.create({ data: { userId: user.id, ...r } });
  }
  console.log(`  metrics + sleep + ${acc.races.length} race(s) seeded`);
}

(async () => {
  for (const a of ACCOUNTS) await provision(a);
  console.log("\nDONE");
})().catch((e) => { console.error("ERR", e); process.exit(1); }).finally(() => prisma.$disconnect());
