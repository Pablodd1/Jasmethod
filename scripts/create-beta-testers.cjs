// Beta tester provisioning — idempotent.
// Creates/updates the 7 beta testers with password demo1234 so the one-tap
// login buttons on the auth card work. Plans are generated separately via
// POST /api/plan/generate (needs the app running) — see scripts/gen-tester-plans.sh.
// Run: node scripts/create-beta-testers.cjs
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

// Load DATABASE_URL / DIRECT_URL from .env manually
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const line = raw.split("\n").find((l) => l.trim().startsWith(key + "="));
    if (line) process.env[key] = line.substring(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
  }
}

const prisma = new PrismaClient({ log: ["error"] });
const PASSWORD = "demo1234";

const TESTERS = [
  { email: "jeand.duno@gmail.com",       name: "Jeand",  avatar: "🏃‍♂️", sex: "male",   goal: "run-only", hours: 6, level: "amateur" },
  { email: "kathy@jasmiamimethod.com",   name: "Kathy",  avatar: "🏃‍♀️", sex: "female", goal: "run-only", hours: 5, level: "amateur" },
  { email: "jas@jasmiamimethod.com",     name: "Jas",    avatar: "🥉",   sex: null,      goal: "olympic",  hours: 8, level: "amateur" },
  { email: "andres@jasmiamimethod.com",  name: "Andres", avatar: "🏋️",   sex: "male",   goal: "hyrox",    hours: 7, level: "amateur" },
  { email: "juliaburtseva@gmail.com",    name: "Julia",  avatar: "🎽",   sex: "female", goal: "run-only", hours: 6, level: "beginner" },
  { email: "arlenramirez0425@gmail.com", name: "Arl",    avatar: "👟",   sex: "male",   goal: "run-only", hours: 6, level: "beginner" },
  { email: "m@jasmiamimethod.com",       name: "M",      avatar: "⚡",   sex: "male",   goal: "run-only", hours: 5, level: "amateur" },
];

(async () => {
  for (const t of TESTERS) {
    const hash = bcrypt.hashSync(PASSWORD, 10);
    await prisma.user.upsert({
      where: { email: t.email },
      create: {
        email: t.email, name: t.name, passwordHash: hash, role: "athlete", avatar: t.avatar,
        profile: { create: { sex: t.sex, goal: t.goal, weeklyHours: t.hours, experience: t.level } },
      },
      update: { name: t.name, role: "athlete", avatar: t.avatar },
    });
    // upsert update never rewrites passwordHash (trap) — set explicitly so one-tap login works
    await prisma.user.update({ where: { email: t.email }, data: { passwordHash: hash } });
    // sync profile goal if the tester already existed with empty profile
    const u = await prisma.user.findUnique({ where: { email: t.email }, select: { id: true } });
    await prisma.athleteProfile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, sex: t.sex, goal: t.goal, weeklyHours: t.hours, experience: t.level },
      update: { sex: t.sex, goal: t.goal, weeklyHours: t.hours, experience: t.level },
    });
    const chk = await prisma.user.findUnique({ where: { email: t.email }, select: { passwordHash: true } });
    console.log(`ok ${t.email} hash=${chk.passwordHash.slice(0, 4)}`);
  }
})().finally(() => prisma.$disconnect());
