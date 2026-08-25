import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  // Demo athlete account
  const demo = await prisma.user.upsert({
    where: { email: "demo@jasmiamimethod.com" },
    create: {
      email: "demo@jasmiamimethod.com",
      passwordHash: hashPassword("demo1234"),
      name: "Demo Athlete",
      role: "athlete",
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
      motivation: { create: { dailyQuote: true, emailDigest: false, style: "coach" } },
    },
    update: {},
  });

  // A bit of sample metric history
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dayStart = new Date(d); dayStart.setHours(0, 0, 0, 0);
    const hrv = 55 + Math.round(Math.sin(i / 3) * 12) + Math.round(Math.random() * 4);
    const existing = await prisma.dailyMetrics.findUnique({ where: { date: dayStart } });
    if (!existing) {
      await prisma.dailyMetrics.create({
        data: {
          userId: demo.id,
          date: dayStart,
          hrv,
          restingHr: 46 + Math.round(Math.random() * 4),
          recoveryScore: 55 + Math.round(Math.random() * 35),
          sleepHours: 6.5 + Math.random() * 1.8,
          source: "whoop",
        },
      });
    }
  }

  console.log(`Seeded demo athlete: ${demo.email} / demo1234`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
