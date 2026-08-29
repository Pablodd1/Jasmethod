// One-off: create Evgenia T (gym + running) with full profile, plan, metrics.
// Run: node scripts/create-evgenia.cjs  (DATABASE_URL loaded from .env)
const fs = require("fs");
const dot = fs.readFileSync(require("path").join(__dirname, "..", ".env"), "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL"));
process.env.DATABASE_URL = dot.split("=").slice(1).join("=").replace(/"/g, "");

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient({ log: ["error"] });

const PASSWORD = "demo1234";
const bcrypt = require("bcryptjs");
function hashPassword(pw) {
  return bcrypt.hashSync(pw, 10);
}

function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

// Run + strength schedule (gym + running focus)
const WEEKLY = [
  { sport: "run", title: "Run: Easy Aerobic", type: "endurance", minutes: 40, zone: "z2", description: "Easy Z2 run — conversational pace, HR capped ~75% LTHR." },
  { sport: "strength", title: "Strength: Lower Body", type: "strength", minutes: 45, zone: "z1", description: "Squats, lunges, hip thrusts, calf raises — 3×10-12, moderate load." },
  { sport: "run", title: "Run: Intervals", type: "interval", minutes: 40, zone: "z5", description: "6×3 min at 10K pace with 2 min easy jog (Billat 2001)." },
  { sport: "strength", title: "Strength: Upper + Core", type: "strength", minutes: 40, zone: "z1", description: "Push, pull, core circuit — 3 rounds, 60s work / 30s rest." },
  { sport: "run", title: "Run: Tempo", type: "threshold", minutes: 45, zone: "z4", description: "3×8 min at threshold pace, 3 min easy between." },
  { sport: "run", title: "Run: Long Run", type: "endurance", minutes: 75, zone: "z2", description: "Long aerobic run — build endurance base." },
  { sport: "strength", title: "Active Recovery: Mobility + Walk", type: "recovery", minutes: 30, zone: "z1", description: "Easy walk + full-body mobility flow + breathing." },
];

function metricsFor(sport, zone, { lthr, durationMin }) {
  const base = { swim: 140, bike: 138, run: 150, strength: 120, recovery: 100 };
  const hr = (base[sport] || 130) + (zone === "z4" ? 18 : zone === "z5" ? 26 : 0);
  const avgHr = Math.min(hr, (lthr || 165) + 12);
  return { avgHr, calories: Math.round(durationMin * (sport === "run" ? 11 : sport === "strength" ? 8 : 9)) };
}

(async () => {
  const user = await prisma.user.upsert({
    where: { email: "evgenia@jasmiamimethod.com" },
    create: {
      email: "evgenia@jasmiamimethod.com",
      passwordHash: hashPassword(PASSWORD),
      name: "Evgenia T",
      role: "athlete",
      avatar: "🏃‍♀️",
      profile: {
        create: {
          birthYear: 1993, sex: "female", heightCm: 165, weightKg: 58,
          experience: "amateur", goal: "olympic", weeklyHours: 8,
          vo2max: 42, lthr: 158, maxHr: 185, runPaceBase: 320,
          hasHrm: true, hasGpsWatch: true,
        },
      },
      motivation: { create: { dailyQuote: true, emailDigest: false, style: "gentle" } },
      supplement: { create: { enabled: true, likes: JSON.stringify(["creatine"]), dislikes: JSON.stringify(["bicarb"]) } },
    },
    update: { name: "Evgenia T", avatar: "🏃‍♀️" },
  });
  console.log(`user: ${user.email} / ${PASSWORD}`);

  // Plan: 12 weeks run+gym
  const start = new Date(); start.setDate(start.getDate() - 30);
  const sessions = [];
  for (let w = 0; w < 12; w++) for (const s of WEEKLY) sessions.push(s);
  const completedCount = Math.floor(sessions.length * 0.42);

  await prisma.trainingPlan.deleteMany({ where: { userId: user.id } });
  await prisma.trainingPlan.create({
    data: {
      userId: user.id,
      name: "Evgenia's Run + Gym plan",
      level: "amateur",
      distance: "olympic",
      weeks: 12,
      startDate: start,
      raceDate: new Date(start.getTime() + 12 * 7 * 86400000),
      easyPct: 70,
      days: {
        create: sessions.map((s, si) => {
          const date = new Date(start); date.setDate(date.getDate() + si);
          const completed = si < completedCount;
          const m = completed ? metricsFor(s.sport, s.zone, { lthr: 158, durationMin: s.minutes }) : null;
          return {
            date, week: Math.floor(si / 7) + 1, dayOfWeek: date.getDay(),
            focus: s.sport, notes: s.description,
            sessions: {
              create: {
                userId: user.id, date, sport: s.sport, title: s.title, type: s.type,
                durationMin: s.minutes, intensity: s.zone,
                rpe: s.zone === "z1" || s.zone === "z2" ? 3 : s.zone === "z3" ? 5 : s.zone === "z4" ? 7 : 9,
                planned: true, completed, source: "plan",
                recovery: `Cool-down: 8 min Box Breathing.`,
                ...(m || {}),
              },
            },
          };
        }),
      },
    },
  });
  console.log(`plan: 12 weeks, ${sessions.length} sessions, ${completedCount} completed`);

  // 30 days of metrics
  const base = { hrv: 58, rhr: 54, sleep: 7.0, weight: 58 };
  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    days.push({
      userId: user.id, date: dayStart(d),
      hrv: Math.round(base.hrv + (Math.random() * 12 - 6)),
      rhr: Math.round(base.rhr + (Math.random() * 8 - 4)),
      sleepHours: Math.round((base.sleep + (Math.random() * 2 - 1)) * 10) / 10,
      weightKg: Math.round((base.weight + (Math.random() * 1.2 - 0.6)) * 10) / 10,
    });
  }
  for (const d of days) {
    await prisma.dailyMetrics.upsert({
      where: { userId_date: { userId: user.id, date: d.date } },
      create: d, update: d,
    });
  }
  console.log(`metrics: 30 days seeded`);

  // Upcoming race
  await prisma.race.deleteMany({ where: { userId: user.id } });
  await prisma.race.create({
    data: {
      userId: user.id, name: "Miami Corporate Run 10K", distance: "10k",
      date: new Date(Date.now() + 40 * 86400000), startTime: "07:30",
      location: "Miami, FL", targetTempC: 27, humidity: 72,
      runElevM: 60, runTerrain: "flat", priority: 1,
    },
  });
  console.log("race: Miami Corporate Run 10K");

  console.log("\nDONE — evgenia@jasmiamimethod.com / demo1234");
})().catch((e) => { console.error("ERR", e.message); process.exit(1); }).finally(() => prisma.$disconnect());
