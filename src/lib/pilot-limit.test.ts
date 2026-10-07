import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { assertPilotCapacity, PILOT_USER_LIMIT, PilotFullError } from "./pilot-limit";

test("capacity reads every role only after obtaining the shared transaction lock", async () => {
  const calls: string[] = [];
  const tx = {
    $executeRaw: async (sql: TemplateStringsArray) => { assert.match(sql.join(""), /pg_advisory_xact_lock\(1246571856, 1\)/); calls.push("lock"); },
    user: { count: async (...args: unknown[]) => { assert.equal(args.length, 0); calls.push("count-all-roles"); return PILOT_USER_LIMIT - 1; } },
  } as unknown as Prisma.TransactionClient;
  await assertPilotCapacity(tx);
  assert.deepEqual(calls, ["lock", "count-all-roles"]);
});

test("capacity rejects at and above fifty, without an environment bypass", async () => {
  for (const count of [50, 51, 100]) {
    const tx = { $executeRaw: async () => {}, user: { count: async () => count } } as unknown as Prisma.TransactionClient;
    await assert.rejects(assertPilotCapacity(tx), error => error instanceof PilotFullError && error.code === "pilot_full");
  }
});

test("database lock failure fails closed before counting or inserting", async () => {
  let counted = false;
  const tx = { $executeRaw: async () => { throw new Error("lock unavailable"); }, user: { count: async () => { counted = true; return 0; } } } as unknown as Prisma.TransactionClient;
  await assert.rejects(assertPilotCapacity(tx), /lock unavailable/);
  assert.equal(counted, false);
});
