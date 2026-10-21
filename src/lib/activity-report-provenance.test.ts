import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as dates from "./dates";
import * as provenance from "./strava-provenance";
import * as reportEnvelope from "./activity-report-envelope";

function fixture(origin: Record<string, unknown> = { source: "garmin" }, restrictedHistory = false) {
  const queries: any[] = [], writes: any[] = [], sends: string[] = [];
  const date = new Date("2026-10-21T12:00:00Z");
  const activity = { id: "actual", userId: "owner", sport: "run", planned: false, completed: true, title: "Synthetic run", durationMin: 30, distanceKm: 6, avgHr: 140, date, ...origin };
  const history = Array.from({ length: 5 }, (_, i) => ({ id: `h${i}`, source: "manual", externalId: null, notes: null as string | null, date: new Date(date.getTime() - (i + 1) * 86400000), durationMin: 45, distanceKm: 6, avgHr: 150, tss: null }));
  if (restrictedHistory) history.push({ ...history[0], id: "restricted", source: "intervals", notes: "Original source: STRAVA", durationMin: 5, distanceKm: 100 });
  const snapshot = JSON.stringify(history);
  const prisma = {
    workout: {
      findFirst: async (args: any) => { queries.push(args); assert.equal(args.where.userId, "owner"); return args.where.id ? activity : null; },
      findMany: async (args: any) => { queries.push(args); assert.equal(args.where.userId, "owner"); for (const key of ["source", "externalId", "notes"]) assert.equal(args.select[key], true); return history; },
      update: async (args: any) => { writes.push(args); return activity; },
    },
    user: { findUnique: async () => ({ profile: { units: "metric" } }) },
    dailyMetrics: { findUnique: async () => null }, reminderPref: { findUnique: async () => ({ telegramEnabled: true, telegramChatId: "synthetic" }) },
  };
  const deps: Record<string, unknown> = {
    "./db": { prisma }, "./dates": dates, "./units": { unitsOf: () => "metric" }, "./strava-provenance": provenance, "./activity-report-envelope": reportEnvelope,
    "./notify": { sendTelegram: async (_: string, text: string) => { sends.push(text); return { ok: true }; } }, "./telemetry": { logEvent: async () => {} },
  };
  const mod: any = { exports: {} };
  const compiled = ts.transpileModule(fs.readFileSync("src/lib/activity-report.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Date, console, require: (id: string) => { if (id in deps) return deps[id]; throw Error(`Unmocked boundary: ${id}`); } });
  return { queries, writes, sends, history, snapshot, run: () => mod.exports.generateAndDeliverActivityReport("owner", "UTC", "actual") };
}

test("new restricted activity reports stop before comparisons, narrative writes or any send", async () => {
  for (const origin of [{ source: "strava" }, { source: "intervals", notes: "Original source: STRAVA" }, { source: "manual", externalId: "strava:123" }, { source: "uploaded_unknown" }, { source: null }]) {
    const f = fixture(origin); assert.equal(await f.run(), null);
    assert.equal(f.queries.length, 1); assert.equal(f.writes.length, 0); assert.equal(f.sends.length, 0);
  }
});

test("restricted history cannot produce a pace rank, baseline comparison or streak for a permitted import", async () => {
  const f = fixture({ source: "garmin" }, true), report = await f.run();
  assert.ok(report); assert.match(report.body, /Historical comparisons and activity streak are unavailable/);
  assert.match(report.body, /does not mean no training occurred/);
  assert.doesNotMatch(report.headline + report.body, /fastest|longest|30-day average|Day \d+ of/i);
  assert.equal(f.writes.length, 1); assert.equal(f.sends.length, 1);
  assert.equal(JSON.stringify(f.history), f.snapshot);
  assert.equal(f.sends[0].includes("Original source: STRAVA"), false);
});

test("known permitted history retains ordinary activity comparison behavior", async () => {
  const f = fixture(), report = await f.run();
  assert.match(report.headline, /Fastest run pace/); assert.match(report.body, /30-day average/);
  assert.equal(f.writes.length, 1); assert.equal(f.sends.length, 1);
  const stored = JSON.parse(f.writes[0].data.insights);
  assert.equal(stored.schemaVersion, 1); assert.equal(stored.provenanceReviewed, true); assert.equal(JSON.stringify(stored.report), JSON.stringify(report));
});
