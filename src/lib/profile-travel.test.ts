import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import ts from "typescript";
import * as planning from "./planning-setup";
import * as travel from "./travel-context";

function fixture() {
  const before = { id: "profile", userId: "owner", weightKg: 70 };
  const setup = { ...planning.parsePlanningSetup({ restrictions: "present", targetGoal: { metric: "completion", sport: "run", targetDate: "2020-01-01" } }, new Date(), "UTC", { allowPastTarget: true }), confirmedAt: "2020-01-01T12:00:00.000Z", source: "coach_set" };
  const audits: any[] = [];
  const tx = { athleteProfile: { findUnique: async () => before, upsert: async () => before }, auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } } };
  class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const output = ts.transpileModule(readFileSync("src/lib/profile-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixtureModule = { exports: {} };
  runInNewContext(output, { module: fixtureModule, exports: fixtureModule.exports, Date, require: (name: string) => {
    if (name === "./planning-setup") return planning;
    if (name === "./travel-context") return travel;
    if (name === "./planning-setup-store") return { readPlanningSetup: async () => ({ setup, revision: "setup-v1" }) };
    if (name === "node:crypto") return { createHash };
    if (name === "./db") return { prisma: { $transaction: async (fn: any) => fn(tx) } };
    if (name === "./access") return { ApiError };
    if (name === "./profile-update") return { profilePatch: (fields: Record<string, unknown>) => { assert.equal(Object.keys(fields).length, 0); return {}; } };
    throw Error(`Unexpected dependency ${name}`);
  } });
  const api = fixtureModule.exports as any;
  return { api, setup, audits, body: { expectedRevision: api.profileRevision(before), expectedSetupRevision: "setup-v1", setupSection: "travel", setup: { travel: { destinationTimezone: "Asia/Tokyo" }, restrictions: "none", confirmedAt: new Date().toISOString(), source: "athlete_reported", targetGoal: null } } };
}

test("travel-only server merge ignores forged confirmation, restrictions and source and preserves past target", async () => {
  const f = fixture(); await f.api.saveProfile("owner", { id: "owner", timezone: "UTC" }, f.body);
  const saved = JSON.parse(f.audits.find(row => row.action === "profile.setup").after);
  assert.equal(saved.confirmedAt, f.setup.confirmedAt); assert.equal(saved.source, "coach_set"); assert.equal(saved.restrictions, "present"); assert.deepEqual(saved.targetGoal, f.setup.targetGoal); assert.equal(saved.travel.destinationTimezone, "Asia/Tokyo");
});

test("travel scope rejects extra profile writes and stale setup without auditing a change", async () => {
  const f = fixture();
  await assert.rejects(f.api.saveProfile("owner", { id: "owner", timezone: "UTC" }, { ...f.body, weightKg: 99 }), /only travel/);
  await assert.rejects(f.api.saveProfile("owner", { id: "owner", timezone: "UTC" }, { ...f.body, expectedSetupRevision: "stale" }), /setup changed/);
  assert.equal(f.audits.length, 0);
});
