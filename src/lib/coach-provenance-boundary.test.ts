import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as activityEvidence from "./activity-evidence";
import { readActivityDecisions } from "./activity-reconciliation";

function load(file: string, dependencies: Record<string, unknown>, extras = {}) {
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Response, Date, require: (name: string) => { if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`); return dependencies[name]; }, ...extras });
  return exports;
}

test("rich briefing with unverified derived provenance stays local even when external AI is configured", () => {
  let calls = 0;
  const forbidden = () => { calls++; throw Error("Unverified context must not reach a model or cache key"); };
  const coach = load("src/lib/coach.ts", {
    "./metric-language": {}, "node:crypto": { createHash: forbidden }, "./protocols": {}, "./gemini-response": {},
  }, { process: { env: { EXTERNAL_AI_ENABLED: "true", GEMINI_API_KEY: "synthetic-key" } }, fetch: forbidden });
  for (const externalAiEligible of [false, undefined, true]) {
    const briefing = coach.getCoachBriefing("synthetic-athlete", {
      name: "Synthetic", profile: { weightKg: 70, weightSource: "strava" },
      todaySession: { title: "Matched planned session", source: "plan", completed: true, prescription: { title: "Saved", verdict: "rest", detail: { main: "Saved instruction" } } },
      historyDigest: "Adherence derived from a matched imported activity", externalAiEligible,
    });
    assert.equal(briefing.mode, "fallback");
  }
  assert.equal(calls, 0);
});

test("legacy coach route explicitly withholds eligibility after gathering mixed-source context", async () => {
  let captured: any;
  const date = new Date("2026-10-13T12:00:00Z");
  const planned = { id: "synthetic-plan", date, planned: true, source: "plan", completed: true, durationMin: 30, matchedPlanId: "synthetic-import" };
  const data: any = {
    athleteProfile: { findUnique: async () => ({ weightKg: 70, weightSource: "strava" }) },
    dailyMetrics: { findMany: async () => [] }, trainingPlan: { findMany: async () => [] },
    bloodResult: { findMany: async () => [] }, geneticVariant: { findMany: async () => [] },
    workout: { findMany: async () => [planned] }, dailyCheckin: { findMany: async () => [] }, benchmarkTest: { findMany: async () => [] },
    auditLog: { findMany: async ({ where }: any) => { assert.equal(where.subjectId, "synthetic-athlete"); assert.equal(where.action, "activity.reconcile"); return []; } },
  };
  const route = load("src/app/api/coach/route.ts", {
    "next/server": { NextResponse: { json: (value: unknown, init?: ResponseInit) => Response.json(value, init) } },
    "@/lib/db": { prisma: data }, "@/lib/auth": { getCurrentUser: async () => ({ id: "synthetic-athlete", timezone: "UTC", name: "Synthetic" }) },
    "@/lib/coach-readiness": { currentHrvReadiness: () => null },
    "@/lib/dates": { dayBounds: () => ({ start: date, end: new Date(+date + 86400000) }), dateKey: (value: Date) => value.toISOString().slice(0, 10), addDaysKey: (value: string) => value },
    "@/lib/adaptive": {}, "@/lib/prescription": {},
    "@/lib/activity-evidence": activityEvidence,
    "@/lib/activity-reconciliation": { readActivityDecisions: (id: string) => readActivityDecisions(id, data) },
    "@/lib/coach": { getCoachBriefing: (_id: string, context: unknown) => { captured = context; return { mode: "fallback" }; } },
  });
  assert.equal((await route.GET()).status, 200);
  assert.equal(captured.externalAiEligible, false);
  assert.equal(captured.profile.weightSource, "strava", "Existing saved records are preserved, not silently erased");
  assert.match(captured.historyDigest, /adherence/);
});
