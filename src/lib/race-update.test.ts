import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as validation from "./race-update";

test("race updates refuse immutable owner, nested relation, provenance and measured course fields", () => {
  for (const field of ["userId", "user", "source", "sourceRecordId", "sourceRetrievedAt", "courseKm", "courseElevM", "elevProfile", "lat", "lng", "__proto__", "constructor"]) {
    assert.throws(() => validation.parseRaceUpdate(JSON.parse(JSON.stringify({ id: "owned-race", [field]: field === "user" ? { connect: { id: "victim" } } : "victim" }))), validation.RaceUpdateError);
  }
});

test("manual race updates validate finite numbers, calendar dates and scalar types", () => {
  for (const patch of [{ resultMin: "50oops" }, { resultMin: Infinity }, { resultMin: { increment: 1 } }, { humidity: 101 }, { priority: 1.5 }, { priority: 4 }, { date: "2026-02-30" }, { date: null }, { startTime: "25:60" }, { name: { set: "bad" } }, { name: " " }]) assert.throws(() => validation.parseRaceUpdate({ id: "race", ...patch }), validation.RaceUpdateError);
  const parsed = validation.parseRaceUpdate({ id: "race", resultMin: "49.5", notes: "", priority: "2", date: "2028-02-29", startTime: "07:30" });
  assert.equal(parsed.data.resultMin, 49.5);
  assert.equal(parsed.data.notes, null);
  assert.equal(parsed.data.priority, 2);
  assert.equal((parsed.data.date as Date).toISOString(), "2028-02-29T00:00:00.000Z");
});

function route(signedIn = true, ownsRace = true) {
  const calls: any[] = [];
  const output = ts.transpileModule(readFileSync("src/app/api/races/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const fixtureModule = { exports: {} };
  runInNewContext(output, { module: fixtureModule, exports: fixtureModule.exports, Response, Request, URL, Date, console, require: (name: string) => {
    if (name === "next/server") return { NextResponse: Response };
    if (name === "@/lib/auth") return { getCurrentUser: async () => signedIn ? { id: "owner" } : null };
    if (name === "@/lib/race-update") return validation;
    if (name === "@/lib/weather") return {};
    if (name === "@/lib/db") return { prisma: { race: {
      findFirst: async (args: any) => { calls.push({ read: args }); return ownsRace ? { id: "race", userId: "owner" } : null; },
      update: async (args: any) => { calls.push({ write: args }); return { id: "race", userId: "owner", ...args.data }; },
    } } };
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { put: (fixtureModule.exports as any).PUT, calls };
}
const request = (body: unknown) => new Request("https://jmm.test/api/races", { method: "PUT", body: JSON.stringify(body) });

test("race PUT rejects owner reassignment before any write and scopes valid writes to current owner", async () => {
  const blocked = route();
  assert.equal((await blocked.put(request({ id: "race", userId: "victim", resultMin: 40 }))).status, 400);
  assert.equal(blocked.calls.length, 0);
  const allowed = route();
  assert.equal((await allowed.put(request({ id: "race", resultMin: 40 }))).status, 200);
  assert.equal(allowed.calls[0].read.where.userId, "owner");
  assert.equal(allowed.calls[1].write.where.userId, "owner");
  assert.equal(allowed.calls[1].write.data.userId, undefined);
  const other = route(true, false);
  assert.equal((await other.put(request({ id: "not-owned", resultMin: 40 }))).status, 404);
  assert.equal(other.calls.some(call => call.write), false);
  const anonymous = route(false);
  assert.equal((await anonymous.put(request({ id: "race", resultMin: 40 }))).status, 401);
  assert.equal(anonymous.calls.length, 0);
});
