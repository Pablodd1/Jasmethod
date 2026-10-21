import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { addDaysKey, dayBounds, localDate } from "./dates";
import { parsePlanningSetup } from "./planning-setup";
import { ensureStarterWorkout } from "./starter-session-store";

test("starter schedules honor no-fixed-rest preference while preserving default and unavailable days off", async () => {
  const original = prisma.$transaction;
  const today = dayBounds("UTC");
  const weekday = new Date(`${today.key}T12:00Z`).getUTCDay();
  try {
    for (const scenario of [
      { level: "advanced", restPreference: "level_default", elapsed: 6, available: true, rest: true },
      { level: "advanced", restPreference: "no_fixed_rest", elapsed: 6, available: true, rest: false },
      { level: "beginner", restPreference: "level_default", elapsed: 2, available: true, rest: true },
      { level: "beginner", restPreference: "no_fixed_rest", elapsed: 2, available: true, rest: false },
      { level: "pro", restPreference: "level_default", elapsed: 6, available: true, rest: false },
      { level: "advanced", restPreference: "no_fixed_rest", elapsed: 6, available: false, rest: true },
    ] as const) {
      const setup = parsePlanningSetup({
        restPreference: scenario.restPreference,
        trainingDays: scenario.available ? [0, 1, 2, 3, 4, 5, 6] : [(weekday + 1) % 7],
      });
      const writes: any[] = [];
      const tx = {
        $executeRaw: async () => {},
        user: { findUnique: async () => ({ id: "athlete", timezone: "UTC", profile: { experience: scenario.level, goal: "olympic" } }) },
        trainingPlan: { findFirst: async () => null },
        race: { findFirst: async () => null },
        workout: {
          findFirst: async ({ where }: any) => where.source
            ? { date: localDate(addDaysKey(today.key, -scenario.elapsed), "UTC") }
            : null,
          create: async ({ data }: any) => { writes.push(data); return { id: "synthetic-starter", ...data }; },
        },
        auditLog: {
          findFirst: async () => ({ id: "setup", after: JSON.stringify(setup) }),
          create: async () => ({}),
        },
      };
      (prisma as any).$transaction = async (fn: any) => fn(tx);
      assert.equal((await ensureStarterWorkout("athlete")).created, true);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].source, scenario.rest ? "starter-rest" : "starter", JSON.stringify(scenario));
      assert.equal(writes[0].durationMin, scenario.rest ? 0 : 20);
      assert.equal(writes[0].approved, false, "a scheduling preference does not establish daily readiness");
    }
  } finally {
    (prisma as any).$transaction = original;
  }
});
