#!/usr/bin/env node
// One-time cleanup for plans generated BEFORE the day-grouping fix (Aug 2026).
//
// The old generator created one PlanDay per SESSION with `si % 7` slot math,
// which produced: (a) multiple PlanDay rows for the SAME plan + same date
// (e.g. two "Mondays" holding swim and recovery), and (b) weeks with more
// than 7 sessions wrapping back onto earlier dates.
//
// This script merges those duplicates: for every plan, dates that have more
// than one PlanDay keep ONE day and all sessions move onto it; the emptied
// duplicate days are deleted. It never touches titles, dates of sessions,
// completed workouts, or single-day dates. Idempotent — re-running is a no-op.
//
//   Dry run (default):   node scripts/fix-duplicate-plan-days.cjs
//   Apply for real:      APPLY=1 node scripts/fix-duplicate-plan-days.cjs
//
// Reads DATABASE_URL / DIRECT_URL from .env like create-beta-testers.cjs.

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const line = raw.split("\n").find((l) => l.trim().startsWith(key + "="));
    if (line) process.env[key] = line.substring(line.indexOf("=") + 1).trim().replace(/^"|"$/g, "");
  }
}

const APPLY = process.env.APPLY === "1";
const prisma = new PrismaClient({ log: ["error"] });

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

(async () => {
  const plans = await prisma.trainingPlan.findMany({
    include: { days: { include: { sessions: true }, orderBy: { date: "asc" } } },
  });

  let mergedGroups = 0, movedSessions = 0, deletedDays = 0;

  for (const plan of plans) {
    // Group this plan's days by calendar date.
    const byDate = new Map();
    for (const day of plan.days) {
      const k = dayKey(day.date);
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(day);
    }

    for (const [k, days] of byDate) {
      if (days.length < 2) continue;
      mergedGroups++;
      // Keep the earliest-created day; fold the rest into it.
      const sorted = [...days].sort((a, b) => a.id.localeCompare(b.id));
      const keep = sorted[0];
      const dupes = sorted.slice(1);
      console.log(`plan ${plan.id} (${plan.name}) — ${k}: ${days.length} days → keep ${keep.id}, merge ${dupes.length}`);
      for (const dup of dupes) {
        console.log(`  moving ${dup.sessions.length} session(s) from ${dup.id} (${dup.dayOff ? "dayOff " : ""}${dup.focus || ""}) → ${keep.id}`);
        movedSessions += dup.sessions.length;
        if (APPLY) {
          // Move sessions, preserving the keep-day's dayOff state only if the
          // keep day isn't already off (a session can't live on an OFF day).
          if (!keep.dayOff && dup.dayOff) {
            await prisma.planDay.update({ where: { id: keep.id }, data: { dayOff: false } });
            keep.dayOff = false;
          }
          await prisma.workout.updateMany({ where: { planDayId: dup.id }, data: { planDayId: keep.id } });
          await prisma.planDay.delete({ where: { id: dup.id } });
          deletedDays++;
        }
      }
    }
  }

  console.log(`\n${APPLY ? "APPLIED" : "DRY RUN"} — duplicate groups found: ${mergedGroups}, sessions to move: ${movedSessions}, days to delete: ${deletedDays}`);
  if (!APPLY && mergedGroups > 0) console.log("Run with APPLY=1 to apply for real.");
  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
