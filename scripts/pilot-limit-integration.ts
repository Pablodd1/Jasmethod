/** Actual Postgres lock/concurrency verification. Local disposable CI DB ONLY. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPilotCapacity, PILOT_USER_LIMIT, PilotFullError } from "../src/lib/pilot-limit";

const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/[a-z0-9_]*integration_test$/i.test(url.pathname) || !["postgres:", "postgresql:"].includes(url.protocol)) {
  throw new Error("Pilot concurrency check requires a localhost disposable *_integration_test database.");
}
const db = new PrismaClient();
const prefix = `pilot-${randomUUID()}-`;
let before: number | undefined;
const account = (suffix: string, role = "athlete") => ({ email: `${prefix}${suffix}@example.invalid`, name: "Synthetic pilot boundary", passwordHash: "not-a-login", role });

async function main() {
  before = await db.user.count();
  assert.ok(before < PILOT_USER_LIMIT, "Disposable test database must have fewer than 50 existing fixture accounts");
  await db.user.createMany({ data: Array.from({ length: PILOT_USER_LIMIT - 1 - before }, (_, index) => account(`seed-${index}`, index % 2 ? "coach" : "athlete")) });
  assert.equal(await db.user.count(), 49);

  // Rollback must not consume a seat or leave a session-level lock behind.
  await assert.rejects(db.$transaction(async tx => {
    await assertPilotCapacity(tx);
    await tx.user.create({ data: account("rollback") });
    throw new Error("deliberate synthetic rollback");
  }, { isolationLevel: "ReadCommitted" }), /deliberate synthetic rollback/);
  assert.equal(await db.user.count(), 49);

  const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => db.$transaction(async tx => {
    await assertPilotCapacity(tx);
    return tx.user.create({ data: account(`concurrent-${index}`, index % 2 ? "admin" : "athlete") });
  }, { isolationLevel: "ReadCommitted", maxWait: 20000, timeout: 20000 })));
  assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1, "Exactly one request takes the final seat");
  for (const result of attempts) if (result.status === "rejected") assert.ok(result.reason instanceof PilotFullError, "Other requests must return pilot_full, not leak through or time out");
  assert.equal(await db.user.count(), 50);
  console.log("PILOT_CONCURRENCY_PASSED: total-role cap, rollback, eight requests for one remaining seat");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Pilot concurrency test failed"); process.exitCode = 1; })
  .finally(async () => {
    try {
      await db.user.deleteMany({ where: { email: { startsWith: prefix, endsWith: "@example.invalid" } } });
      if (before !== undefined) assert.equal(await db.user.count(), before, "Synthetic fixture cleanup restored the initial count");
    } finally { await db.$disconnect(); }
  });
