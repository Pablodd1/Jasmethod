import test from "node:test";
import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { assertPilotCapacity, configuredPilotUserLimit, parsePilotUserLimit, PILOT_USER_LIMIT, PilotFullError } from "./pilot-limit";

test("pilot limit is finite, preserves the default and rejects invalid configuration", () => {
  assert.equal(parsePilotUserLimit(undefined), 50);
  assert.equal(parsePilotUserLimit(""), 50);
  for (const value of ["1", "59", "64", "100"]) assert.equal(parsePilotUserLimit(value), Number(value));
  for (const value of ["0", "-1", "101", "999999", "Infinity", "NaN", "59.5", "5e1", " 59", "59 ", "059", "unlimited"]) {
    assert.throws(() => parsePilotUserLimit(value), /PILOT_USER_LIMIT/);
    assert.equal(configuredPilotUserLimit(value), 0, "Invalid configuration closes enrollment instead of bypassing the cap");
  }
});

test("configured capacity is enforced at runtime, including a zero-seat invalid configuration", async () => {
  const source = ts.transpileModule(readFileSync("src/lib/pilot-limit.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [setting, expected] of [["64", 64], ["unlimited", 0]] as const) {
    const configured: any = {};
    vm.runInNewContext(source, { exports: configured, process: { env: { PILOT_USER_LIMIT: setting } } });
    assert.equal(configured.PILOT_USER_LIMIT, expected);
    for (const count of [expected, expected + 1]) {
      const tx = { $executeRaw: async () => {}, user: { count: async () => count } };
      await assert.rejects(configured.assertPilotCapacity(tx), (error: any) => error.code === "pilot_full");
    }
    if (expected) {
      await configured.assertPilotCapacity({ $executeRaw: async () => {}, user: { count: async () => expected - 1 } });
      assert.match(configured.PILOT_FULL_MESSAGE, /64-account/);
    } else assert.match(configured.PILOT_FULL_MESSAGE, /setting is invalid/);
  }
});

test("capacity reads every role only after obtaining the shared transaction lock", async () => {
  const calls: string[] = [];
  const tx = {
    $executeRaw: async (sql: TemplateStringsArray) => { assert.match(sql.join(""), /pg_advisory_xact_lock\(1246571856, 1\)/); calls.push("lock"); },
    user: { count: async (...args: unknown[]) => { assert.equal(args.length, 0); calls.push("count-all-roles"); return PILOT_USER_LIMIT - 1; } },
  } as unknown as Prisma.TransactionClient;
  await assertPilotCapacity(tx);
  assert.deepEqual(calls, ["lock", "count-all-roles"]);
});

test("capacity rejects at and above the configured total, without an unlimited bypass", async () => {
  for (const count of [PILOT_USER_LIMIT, PILOT_USER_LIMIT + 1, PILOT_USER_LIMIT + 100]) {
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
