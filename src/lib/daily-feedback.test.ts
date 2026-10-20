import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { canonicalSession } from "./canonical-session";
import { workoutRevision } from "./workout-update";
import { parseSessionObservations, observationsFromForm } from "./session-observations";
import { actualFuelingFromForm } from "./actual-fueling";

function compile(path: string, deps: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} as any };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; }, React, Response, Request, URL, ...globals });
  return mod.exports;
}
function findElement(root: any, type: unknown): any {
  if (!root || typeof root !== "object") return null;
  if (root.type === type) return root;
  for (const child of React.Children.toArray(root.props?.children)) { const found = findElement(child, type); if (found) return found; }
  return null;
}
function plan() { return JSON.parse(fs.readFileSync("src/components/daily-training/sample-session.json", "utf8")); }

test("daily debrief can submit an existing zero-RPE report; invalid ratings keep the draft without a write", async () => {
  for (const rating of [0, -1, 10.5, 11]) {
    const saved = plan(); saved.completion.actual = { durationMinutes: 30, actualSport: "run", sessionRpe: rating, comments: "Reported effort", status: "completed" };
    const errors: string[] = [], writes: any[] = [];
    const { DailyTrainingScreen } = compile("src/components/daily-training/DailyTrainingScreen.tsx", {
      react: { useState: (value: unknown) => [value, (next: unknown) => { if (typeof next === "string") errors.push(next); }], useRef: (value: unknown) => ({ current: value }), useEffect: () => {} },
      "./training-contract": { plannedSeconds: () => 0, endpointLabel: () => "" },
      "./FitDownloadActions": { FitDownloadActions: "fit-actions" },
      "./SavedWorkoutPreviewCard": { SavedWorkoutPreviewCard: "saved-card" },
      "./UniversalWorkoutCard": { UniversalWorkoutCard: "workout-card" },
      "./ActualFuelingFields": { ActualFuelingFields: "fueling-fields" },
      "./SessionMeasurementsFields": { SessionMeasurementsFields: "measurements-fields" },
      "@/lib/actual-fueling": { actualFuelingFromForm }, "@/lib/session-observations": { observationsFromForm },
    }, { FormData: class { get() { return null; } has() { return false; } } });
    const tree = DailyTrainingScreen({ plan: saved, onFocusReady: async () => {}, onCompletion: async (actual: unknown) => { writes.push(actual); } });
    const form = findElement(tree, "form"); assert.ok(form);
    await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
    if (rating === 0) { assert.equal(writes.length, 1); assert.equal(writes[0].sessionRpe, 0); }
    else { assert.equal(writes.length, 0); assert.ok(errors.some(error => /between 0 and 10/.test(error))); }
    const children = React.Children.toArray(form.props.children) as any[];
    const effort = children.find(child => child.type === "label" && String(React.Children.toArray(child.props.children)[0]).startsWith("Session effort"));
    assert.equal(findElement(effort, "input").props.min, "0");
  }
});

test("completion route accepts RPE zero and rejects invalid ratings before the audited writer", async () => {
  const writes: any[] = [];
  class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
  const workout = { id: "owned-session", userId: "athlete", date: new Date(), sport: "run", title: "Run", durationMin: 30, planned: true, completed: false };
  const { POST } = compile("src/app/api/v1/training/sessions/[sessionId]/completion/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/access": { ApiError, trainingAccess: async () => ({ actor: { id: "athlete" }, athlete: { id: "athlete" } }), errorResponse: (error: ApiError) => Response.json({ error: error.message }, { status: error.status ?? 500 }) },
    "@/lib/effective-prescription": { effectivePrescription: async () => ({ canonical: { revision: "current" }, workout }) },
    "@/lib/workout-update": { workoutRevision, updateWorkout: async (_actor: unknown, _athlete: unknown, data: unknown) => { writes.push(data); } },
    "@/lib/session-observations": { parseSessionObservations },
  });
  for (const rating of [0, -1, 10.5, 11, "0"]) {
    const response = await POST(new Request("https://example.invalid/completion", { method: "POST", body: JSON.stringify({ expectedRevision: "current", actual: { status: "completed", durationMinutes: 30, sessionRpe: rating } }) }), { params: Promise.resolve({ sessionId: workout.id }) });
    assert.equal(response.status, rating === 0 ? 200 : 400);
  }
  assert.equal(writes.length, 1); assert.equal(writes[0].rpe, 0); assert.equal(writes[0].expectedRevision, workoutRevision(workout));
});

test("daily feedback refresh waits for verified saving, uses the new revision, and never resubmits a failed write", async () => {
  const original = plan(); original.session.id = "owned-session"; original.session.sourceRevision = "old-revision";
  let current: any = { kind: "ready", plan: original }, readCount = 0, requests: any[] = [], response = Response.json({ ok: true });
  let releaseRead: (() => void) | undefined;
  const readGate = new Promise<void>(resolve => { releaseRead = resolve; });
  const DailyTrainingScreen = "daily-screen";
  const { default: Page } = compile("src/app/daily/page.tsx", {
    react: { useState: (value: any) => value?.kind === "loading" ? [current, (next: any) => { current = next; }] : [value, () => {}], useRef: (value: unknown) => ({ current: value }), useEffect: () => {}, useCallback: (callback: unknown) => callback },
    "@/components/auth": { useAuth: () => ({ user: { language: "en" } }) }, "next/link": { default: "a" },
    "@/components/daily-training/DailyEnvironmentCard": { DailyEnvironmentCard: "environment" },
    "@/components/daily-training/DailyTrainingScreen": { DailyTrainingScreen },
    "@/components/daily-training/training-read": { TrainingReadError: Error, readTrainingJson: async () => { readCount++; await readGate; return { ...original, session: { ...original.session, sourceRevision: "new-revision", revision: 2 } }; } },
    "@/components/daily-training/training-contract": { isDailyTraining: () => true },
    "@/components/daily-training/universal-workout-card.css": {}, "@/components/daily-training/daily-training.css": {},
  }, { AbortController, crypto: { randomUUID: () => "request-id" }, fetch: async (_path: unknown, options: any) => { requests.push(JSON.parse(options.body)); return response; } });
  const screen = findElement(Page(), DailyTrainingScreen); assert.ok(screen);
  const pending = screen.props.onCompletion({ status: "completed", sessionRpe: 0 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 1); assert.equal(requests[0].expectedRevision, "old-revision");
  assert.equal(readCount, 1); assert.equal(current.kind, "loading");
  releaseRead!(); await pending;
  assert.equal(current.kind, "ready"); assert.equal(current.plan.session.sourceRevision, "new-revision");
  const corrected = findElement(Page(), DailyTrainingScreen);
  response = Response.json({ error: "Could not save" }, { status: 409 });
  await assert.rejects(corrected.props.onCompletion({ status: "completed", sessionRpe: 3 }), /Could not save/);
  assert.equal(requests.length, 2); assert.equal(requests[1].expectedRevision, "new-revision"); assert.equal(readCount, 1);
  assert.equal(current.kind, "ready", "failed saves retain the mounted draft");
  response = Response.json({ ok: false });
  await assert.rejects(corrected.props.onCompletion({ status: "completed", sessionRpe: 3 }), /could not be verified/);
  assert.equal(requests.length, 3); assert.equal(readCount, 1);
});

test("saved actual feedback changes the canonical revision required by the next correction", () => {
  const workout = { id: "owned-session", title: "Run", sport: "run", durationMin: 30 };
  const input = { athleteId: "athlete", workout, dateLocal: "2026-10-20", timezone: "UTC", prescription: { sport: "run", durationMin: 30, verdict: "full", steps: [{ name: "Work", phase: "active", zone: "z2", seconds: 1800 }] } };
  const before = canonicalSession(input), after = canonicalSession({ ...input, workout: { ...workout, feedbackStatus: "completed", actualDurationMin: 30, rpe: 0 } });
  assert.notEqual(before.revision, after.revision);
});
