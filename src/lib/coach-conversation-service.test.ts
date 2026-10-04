import { test } from "node:test";
import sharp from "sharp";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { ApiError } from "./access";
import { profileRevision } from "./profile-service";
import { workoutRevision } from "./workout-update";
import { confirmConversation, cancelConversationProposal, clearConversation, readConversationBody, validateSelectedCandidates, parseAssistantInput, appendConversation } from "./coach-conversation-service";
import type { CoachCandidate } from "./coach-conversation";

const today = new Date().toISOString().slice(0, 10);
const actor = { id: "athlete-a", timezone: "UTC", language: "en" };
function candidate(changes: Partial<CoachCandidate> = {}): CoachCandidate {
  return { id: "candidate-weight", kind: "profile", field: "weightKg", value: 75, unit: "kg", observedDate: today, source: "text", evidence: "My weight is 75 kg", status: "proposed", ...changes };
}

test("confirmation permits values only and rejects expanded field/date/session/source provenance", () => {
  const stored = [candidate()];
  assert.equal(validateSelectedCandidates(stored, [{ ...stored[0], value: 76 }], today)[0].value, 76);
  for (const changed of [{ field: "weeklyHours", unit: "h/week" }, { observedDate: "2020-01-01" }, { source: "image" }, { evidence: "fabricated" }, { sessionId: "other" }, { userId: "other" }, { status: "saved" }]) {
    assert.throws(() => validateSelectedCandidates(stored, [{ ...stored[0], ...changed }], today));
  }
  for (const value of [true, {}, [], "75", Number.NaN, 1000]) assert.throws(() => validateSelectedCandidates(stored, [{ ...stored[0], value }], today));
  assert.throws(() => validateSelectedCandidates(stored, [], today));
  assert.throws(() => validateSelectedCandidates(stored, [stored[0], stored[0]], today));
  assert.throws(() => validateSelectedCandidates([candidate({ kind: "workout_feedback", field: "actualDurationMin", unit: "min" })], [candidate({ kind: "workout_feedback", field: "actualDurationMin", unit: "min" })], today), /session/);
});

test("assistant JSON boundary rejects malformed, scalar and oversized streaming bodies", async () => {
  for (const body of ["null", "[]", "{invalid"]) await assert.rejects(readConversationBody(new Request("http://test", { method: "POST", body })), ApiError);
  await assert.rejects(readConversationBody(new Request("http://test", { method: "POST", body: JSON.stringify({ message: "x".repeat(300) }) }), 100), (e: unknown) => e instanceof ApiError && e.status === 413);
  assert.deepEqual(await readConversationBody(new Request("http://test", { method: "POST", body: '{"message":"hello"}' })), { message: "hello" });
});

function fixture(candidates = [candidate()]) {
  const profile = { id: "profile-a", userId: actor.id, weightKg: 70, weeklyHours: 6, goal: "5k", experience: "amateur" };
  const workout = { id: "session-a", userId: actor.id, date: new Date(`${today}T12:00Z`), title: "Original interval", sport: "run", type: "interval", durationMin: 40, intensity: "z4", notes: "Keep historical prescription", planned: true, completed: true, approved: true, feedbackStatus: "completed", actualDurationMin: 40, rpe: 5, originalPlan: '{"title":"Original interval","durationMin":40}', prescription: '{"steps":[]}', planDay: null };
  const proposal = { id: "proposal-a", userId: actor.id, conversationId: "conversation-a", generation: 0, revision: 1, status: "pending", timezone: "UTC", sourceMessageId: "message-source", candidates: JSON.stringify(candidates), baseRevisions: JSON.stringify({ profile: profileRevision(profile), workouts: { "session-a": { revision: workoutRevision(workout), date: today } } }), idempotencyKey: null, requestHash: null, receipt: null, createdAt: new Date(), updatedAt: new Date(), confirmedAt: null };
  let state: any = { profile, workout, proposal, conversation: { id: "conversation-a", userId: actor.id, generation: 0, revision: 0 }, messages: [{ id: "message-source", userId: actor.id, conversationId: "conversation-a", role: "user", source: "text", content: "report", createdAt: new Date() }], audits: [], writes: [], requests: [] };
  const originalTransaction = prisma.$transaction;
  const matches = (row: any, where: any) => !where || Object.entries(where).every(([key, value]: any) => {
    if (key === "OR") return value.some((condition: any) => matches(row, condition));
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if (value.in) return value.in.includes(row[key]);
      if (value.contains !== undefined) return typeof row[key] === "string" && row[key].includes(value.contains);
      if (value.gte !== undefined && !(row[key] >= value.gte)) return false;
      if (value.lt !== undefined && !(row[key] < value.lt)) return false;
      if (value.gte !== undefined || value.lt !== undefined) return true;
    }
    return row[key] === value;
  });
  const update = (row: any, data: any) => { for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === "object" && "increment" in value ? row[key] + (value as any).increment : value; return row; };
  (prisma as any).$transaction = async (callback: any, options: any) => {
    assert.equal(options.isolationLevel, "Serializable");
    const draft = structuredClone(state);
    const tx: any = {
      coachConversationRequest: {
        findFirst: async ({ where }: any) => draft.requests.find((row: any) => matches(row, where)) ?? null,
        count: async ({ where }: any) => draft.requests.filter((row: any) => matches(row, where)).length,
        create: async ({ data }: any) => { const row = { id: `request-${draft.requests.length}`, createdAt: new Date(), status: "processing", ...data }; draft.requests.push(row); return row; },
        updateMany: async ({ where, data }: any) => { let count = 0; for (const row of draft.requests) if (matches(row, where)) { update(row, data); count++; } return { count }; },
      },
      coachConversation: { upsert: async ({ where, update: data }: any) => { assert.ok(matches(draft.conversation, where)); return update(draft.conversation, data); }, findUnique: async ({ where }: any) => matches(draft.conversation, where) ? draft.conversation : null, update: async ({ where, data }: any) => { assert.ok(matches(draft.conversation, where)); return update(draft.conversation, data); } },
      coachConversationProposal: {
        create: async ({ data }: any) => { draft.proposal = { id: "new-image-proposal", status: "pending", revision: 1, receipt: null, idempotencyKey: null, requestHash: null, createdAt: new Date(), updatedAt: new Date(), ...data }; return draft.proposal; },
        findFirst: async ({ where }: any) => matches(draft.proposal, where) ? draft.proposal : null,
        findMany: async ({ where }: any) => matches(draft.proposal, where) ? [draft.proposal] : [],
        update: async ({ where, data }: any) => { assert.ok(matches(draft.proposal, where)); return update(draft.proposal, data); },
        updateMany: async ({ where, data }: any) => { if (matches(draft.proposal, where)) update(draft.proposal, data); },
      },
      coachConversationMessage: {
        findFirst: async ({ where }: any) => [...draft.messages].reverse().find((row: any) => matches(row, where)) ?? null,
        updateMany: async ({ where, data }: any) => { let count = 0; for (const row of draft.messages) if (matches(row, where)) { update(row, data); count++; } return { count }; },
        findMany: async ({ where }: any) => draft.messages.filter((row: any) => matches(row, where)).reverse(),
        create: async ({ data }: any) => { const row = { id: `message-${draft.messages.length}`, createdAt: new Date(), ...data }; draft.messages.push(row); return row; },
        deleteMany: async ({ where }: any) => { draft.messages = draft.messages.filter((row: any) => !matches(row, where)); },
      },
      athleteProfile: { findUnique: async ({ where }: any) => matches(draft.profile, where) ? draft.profile : null, upsert: async ({ where, update: data }: any) => { assert.equal(where.userId, actor.id); draft.writes.push("profile"); return update(draft.profile, data); } },
      workout: { findMany: async ({ where, select }: any) => { if (select?.matchedPlanId === true) { assert.equal(where.userId, actor.id); assert.equal(where.matchedPlanId, null); assert.equal(select.tss, undefined); draft.loadQuery = where; return (draft.loadWorkouts || []).filter((row: any) => matches(row, where)); } return select?.planDay ? draft.todayRecoverySessions || [] : []; }, findFirst: async ({ where }: any) => matches(draft.workout, where) ? draft.workout : null, update: async ({ where, data }: any) => { assert.equal(where.id, draft.workout.id); draft.writes.push("workout"); return update(draft.workout, data); } },
      metricObservation: { findMany: async ({ where }: any) => { assert.equal(where.userId, actor.id); draft.restQuery = where; return (draft.restObservations || []).filter((row: any) => matches(row, where)); } },
      planDay: { findFirst: async ({ where }: any) => { assert.equal(where.plan.userId, actor.id); assert.equal(where.plan.status, "active"); assert.equal(where.dayOff, true); return draft.plannedRestDay ?? null; } },
      dailyCheckin: { findUnique: async () => draft.checkin ?? null },
      auditLog: { findFirst: async () => null, create: async ({ data }: any) => { draft.audits.push(data); return data; } },
    };
    const result = await callback(tx); state = draft; return result;
  };
  return { get state() { return state; }, restore() { (prisma as any).$transaction = originalTransaction; }, input: { proposalId: proposal.id, expectedRevision: 1, candidates, idempotencyKey: "confirmation-a", confirmed: true } };
}

test("real service confirmation saves atomically, records provenance, and replays original receipt only", async () => {
  const feedback = candidate({ id: "candidate-minutes", kind: "workout_feedback", field: "actualDurationMin", value: 25, unit: "min", sessionId: "session-a" });
  const f = fixture([candidate(), feedback]);
  try {
    const beforePrescription = f.state.workout.prescription;
    const result = await confirmConversation(actor, f.input);
    assert.equal(result.applied, true);
    assert.equal(result.receipt.applied.length, 2);
    assert.equal(result.pendingAction, "review_checkin");
    assert.equal(f.state.profile.weightKg, 75);
    assert.equal(f.state.workout.actualDurationMin, 25);
    assert.equal(f.state.workout.durationMin, 40);
    assert.equal(f.state.workout.title, "Original interval");
    assert.equal(f.state.workout.prescription, beforePrescription);
    assert.deepEqual(f.state.writes, ["profile", "workout"]);
    assert.equal(f.state.audits.filter((a: any) => a.action === "coach.conversation.confirmed").length, 1);
    const replay = await confirmConversation(actor, f.input);
    assert.deepEqual(replay.receipt, result.receipt);
    assert.deepEqual(f.state.writes, ["profile", "workout"]);
    await assert.rejects(confirmConversation(actor, { ...f.input, candidates: [{ ...candidate(), value: 76 }, feedback] }), /different confirmation/);
    await assert.rejects(confirmConversation(actor, { ...f.input, idempotencyKey: "other-key" }), /different confirmation/);
  } finally { f.restore(); }
});

test("stale workout or profile rolls the entire profile+actual confirmation back", async () => {
  for (const target of ["workout", "profile"] as const) {
    const f = fixture([candidate(), candidate({ id: "actual", kind: "workout_feedback", field: "actualDurationMin", value: 25, unit: "min", sessionId: "session-a" })]);
    try {
      if (target === "workout") f.state.workout.actualDurationMin = 39;
      else f.state.profile.weightKg = 71;
      await assert.rejects(confirmConversation(actor, f.input), (e: unknown) => e instanceof ApiError && e.status === 409);
      assert.deepEqual(f.state.writes, []);
      assert.equal(f.state.proposal.status, "pending");
      assert.equal(f.state.audits.length, 0);
    } finally { f.restore(); }
  }
});

test("cross-athlete proposal and session, changed source revision, and unconfirmed writes fail closed", async () => {
  const f = fixture();
  try {
    await assert.rejects(confirmConversation({ ...actor, id: "athlete-b" }, f.input), (e: unknown) => e instanceof ApiError && e.status === 404);
    await assert.rejects(confirmConversation(actor, { ...f.input, confirmed: false }), /confirmation/);
    await assert.rejects(confirmConversation(actor, { ...f.input, expectedRevision: 2 }), /no longer current/);
    await assert.rejects(confirmConversation(actor, { ...f.input, athleteId: "athlete-b" }), (e: unknown) => e instanceof ApiError && e.status === 403);
    assert.deepEqual(f.state.writes, []);
  } finally { f.restore(); }
});

test("review-only check-in stays unsaved; cancellation and clear never delete health or audits", async () => {
  const f = fixture([candidate({ kind: "checkin", field: "availableMinutes", value: 30, unit: "min" })]);
  try {
    const reviewed = await confirmConversation(actor, f.input);
    assert.equal(reviewed.applied, false);
    assert.equal(reviewed.proposal?.status, "review_required");
    assert.equal(reviewed.receipt.applied.length, 0);
    assert.deepEqual(f.state.writes, []);
    await cancelConversationProposal(actor, { proposalId: "proposal-a" });
    await cancelConversationProposal(actor, { proposalId: "proposal-a" });
    await assert.rejects(confirmConversation(actor, f.input), /no longer pending/);
    f.state.audits.push({ id: "preserve-existing-audit" });
    const health = structuredClone({ profile: f.state.profile, workout: f.state.workout });
    await assert.rejects(clearConversation(actor, {}), /Confirm clearing/);
    await clearConversation(actor, { confirmed: true });
    assert.equal(f.state.messages.length, 0);
    assert.equal(f.state.conversation.generation, 1);
    assert.equal(f.state.audits.length, 1);
    assert.deepEqual({ profile: f.state.profile, workout: f.state.workout }, health);
  } finally { f.restore(); }
});

test("health audit and cleared confirmed history retain only saved facts, never unselected chat text", async () => {
  const evidence = "My weight is 75 kg. Private unrelated thought which was never confirmed.";
  const f = fixture([candidate({ evidence }), candidate({ id: "deferred", kind: "checkin", field: "availableMinutes", value: 30, unit: "min", evidence })]);
  try {
    const result = await confirmConversation(actor, f.input);
    assert.equal(result.receipt.checkinDraft.length, 1);
    assert.ok(!JSON.stringify(f.state.audits).includes("Private unrelated thought"));
    assert.ok(!JSON.stringify(f.state.audits).includes('"candidateId":"deferred"'));
    await clearConversation(actor, { confirmed: true });
    assert.equal(f.state.proposal.status, "confirmed");
    assert.equal(JSON.parse(f.state.proposal.candidates).length, 1);
    assert.deepEqual(JSON.parse(f.state.proposal.receipt).checkinDraft, []);
    assert.ok(!JSON.stringify(f.state).includes("Private unrelated thought"));
    assert.equal(f.state.profile.weightKg, 75);
  } finally { f.restore(); }
});

test("clear removes evidence from cancelled and superseded proposals as well as pending ones", async () => {
  for (const status of ["cancelled", "superseded", "pending", "review_required"]) {
    const f = fixture([candidate({ evidence: "Private conversation evidence" })]);
    try {
      f.state.proposal.status = status;
      await clearConversation(actor, { confirmed: true });
      assert.equal(f.state.proposal.candidates, "[]");
      assert.equal(f.state.proposal.baseRevisions, "{}");
      assert.equal(f.state.proposal.receipt, null);
      assert.ok(!JSON.stringify(f.state).includes("Private conversation evidence"));
    } finally { f.restore(); }
  }
});


test("legacy question alias shares strict message parsing without accepting conflicting or unknown properties", () => {
  assert.deepEqual(parseAssistantInput({ question: "How was my last session?", externalConsent: false }), { message: "How was my last session?", source: "text", externalConsent: false, imageConsent: false });
  for (const body of [{ question: "old", message: "new" }, { question: "old", message: "old" }, { question: {} }, { question: "hello", admin: true }, { question: "x".repeat(4001) }]) assert.throws(() => parseAssistantInput(body), ApiError);
});


test("late provider output cannot resurrect a cleared chat or replace a newer conversation turn", async () => {
  for (const action of ["clear", "new-message"] as const) for (const providerMode of ["selection", "invalid"] as const) {
    const f = fixture();
    const previousFetch = globalThis.fetch;
    const priorEnv = { enabled: process.env.EXTERNAL_AI_ENABLED, key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL };
    let resolveFetch!: (response: Response) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>(resolve => { signalStarted = resolve; });
    globalThis.fetch = async () => { signalStarted(); return new Promise<Response>(resolve => { resolveFetch = resolve; }); };
    process.env.EXTERNAL_AI_ENABLED = "true";
    process.env.GEMINI_API_KEY = "synthetic-test-only";
    process.env.GEMINI_MODEL = "synthetic-model";
    try {
      const pending = appendConversation(actor, { message: "Why is easy endurance useful?", clientRequestId: "pending-text-request", source: "text", externalConsent: true, textProviderConsent: "gemini" });
      await started;
      if (action === "clear") await clearConversation(actor, { confirmed: true });
      else await appendConversation(actor, { message: "A newer message", source: "text", externalConsent: false });
      resolveFetch(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(providerMode === "selection" ? { topic: "endurance", paragraphIds: ["endurance_definition"] } : { answer: "Delayed provider explanation" }) }] } }] }));
      const result = await pending;
      assert.equal(result.mode, "coach_local");
      assert.equal(result.externalStatus, "unavailable");
      assert.ok(!f.state.messages.some((m: any) => m.source === "gemini" || m.content.includes("Delayed provider")));
      if (action === "clear") { assert.equal(result.conversation.messages.length, 0); assert.equal(result.answer, ""); }
      else assert.ok(result.conversation.messages.some((m: any) => m.content === "A newer message"));
    } finally {
      globalThis.fetch = previousFetch;
      for (const [name, value] of [["EXTERNAL_AI_ENABLED", priorEnv.enabled], ["GEMINI_API_KEY", priorEnv.key], ["GEMINI_MODEL", priorEnv.model]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; }
      f.restore();
    }
  }
});


test("service wires configured vision only for named per-image consent and preserves unchecked proposals", async () => {
  const data = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const image = { mimeType: "image/png", dataBase64: data.toString("base64") };
  const previousFetch = globalThis.fetch;
  const prior = Object.fromEntries(["COACH_VISION_ENABLED", "OPENAI_API_KEY", "EXTERNAL_AI_ENABLED"].map(key => [key, process.env[key]]));
  process.env.COACH_VISION_ENABLED = "true"; process.env.OPENAI_API_KEY = "synthetic-vision-test"; process.env.EXTERNAL_AI_ENABLED = "false";
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(String(url), "https://api.openai.com/v1/responses");
    const body = String(options?.body);
    assert.ok(!body.includes(actor.id)); assert.ok(!body.includes("profile-a"));
    return Response.json({ status: "completed", error: null, incomplete_details: null, output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ candidates: [candidate({ id: "image-weight", source: "image", evidence: "Visible weight 75 kg" })] }) }] }] });
  };
  try {
    for (const consent of [{ externalConsent: true, textProviderConsent: "gemini", imageConsent: false }, { imageConsent: true }, { imageConsent: true, imageProviderConsent: "openai" }]) {
      const f = fixture();
      try {
        const result = await appendConversation(actor, { message: "Review this screenshot", clientRequestId: "image-request", image, ...consent });
        assert.equal(result.capabilities.imageUnderstanding, true);
        assert.equal(result.capabilities.imageProvider, "OpenAI");
        if (consent.imageProviderConsent === "openai") {
          assert.equal(result.imageStatus, "extracted");
          assert.equal(result.proposal?.status, "pending");
          assert.equal(result.proposal?.candidates[0].source, "image");
          assert.equal(result.receipt, null);
          assert.equal(calls, 1);
        } else { assert.equal(result.imageStatus, "not_requested"); assert.equal(calls, 0); }
        assert.deepEqual(f.state.writes, []);
        assert.equal(f.state.profile.weightKg, 70);
        assert.ok(!JSON.stringify(f.state).includes(image.dataBase64));
      } finally { f.restore(); }
    }
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});


test("duplicate profile destinations with different dates cannot overwrite a value or fabricate two receipts", async () => {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const a = candidate({ source: "image" });
  const b = candidate({ id: "older-weight", source: "image", value: 70, observedDate: yesterday });
  assert.throws(() => validateSelectedCandidates([a, b], [a, b], today), /only one value/);
  const f = fixture([a, b]);
  try { await assert.rejects(confirmConversation(actor, f.input), /only one value/); assert.deepEqual(f.state.writes, []); assert.equal(f.state.audits.length, 0); }
  finally { f.restore(); }
});

test("request id replay is owner-scoped, does not append twice, and cannot be rebound to changed content", async () => {
  const f = fixture();
  const body = { message: "Hello coach", clientRequestId: "stable-local-request" };
  try {
    await appendConversation(actor, body);
    const messageCount = f.state.messages.length;
    const second = await appendConversation(actor, body);
    assert.equal(second.replayed, true);
    assert.equal(f.state.messages.length, messageCount);
    assert.equal(f.state.requests.length, 1);
    await assert.rejects(appendConversation(actor, { ...body, message: "Different message" }), /different content/);
    assert.equal(f.state.messages.length, messageCount);
    const persisted = JSON.stringify(f.state.requests);
    assert.ok(!persisted.includes(body.message));
    assert.match(f.state.requests[0].requestHash, /^[0-9a-f]{64}$/);
  } finally { f.restore(); }
});

test("rate budgets and active request lock apply before image decoding or provider dispatch", async () => {
  const image = { mimeType: "image/png", dataBase64: "AAAA" };
  for (const kind of ["all", "metered", "active"] as const) {
    const f = fixture();
    try {
      const count = kind === "all" ? 30 : kind === "metered" ? 6 : 1;
      f.state.requests = Array.from({ length: count }, (_, index) => ({ id: `old-${index}`, userId: actor.id, clientRequestId: `old-${index}`, requestHash: "hash", status: kind === "active" ? "processing" : "completed", activeKey: kind === "active" ? actor.id : null, metered: kind !== "all", createdAt: new Date() }));
      await assert.rejects(appendConversation(actor, { message: "Review screenshot", clientRequestId: "budget-request", image }), (e: unknown) => e instanceof ApiError && e.status === (kind === "active" ? 409 : 429));
      assert.equal(f.state.messages.length, 1);
      assert.deepEqual(f.state.writes, []);
    } finally { f.restore(); }
  }
});

test("stale uncertain request releases its active slot but its original key can never dispatch again", async () => {
  const f = fixture();
  const body = { message: "Hello", clientRequestId: "old-request" };
  try {
    await appendConversation(actor, body);
    f.state.requests[0].status = "processing";
    f.state.requests[0].activeKey = actor.id;
    f.state.requests[0].createdAt = new Date(Date.now() - 120000);
    await assert.rejects(appendConversation(actor, body), /previous attempt|still processing/);
    // A rejected transaction does not release the slot itself. A different new
    // request safely commits expiry, while the old id stays unusable.
    await appendConversation(actor, { message: "New local request", clientRequestId: "new-request" });
    assert.equal(f.state.requests[0].status, "unknown");
    assert.equal(f.state.requests[0].activeKey, null);
    await assert.rejects(appendConversation(actor, body), /previous attempt/);
  } finally { f.restore(); }
});

test("deferred vision followed by clear cannot recreate chat or proposals", async () => {
  const data = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
  const f = fixture();
  const previousFetch = globalThis.fetch;
  const prior = { enabled: process.env.COACH_VISION_ENABLED, key: process.env.OPENAI_API_KEY };
  process.env.COACH_VISION_ENABLED = "true"; process.env.OPENAI_API_KEY = "synthetic-vision-test";
  let resolveFetch!: (response: Response) => void;
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  let calls = 0;
  globalThis.fetch = async () => { calls++; started(); return new Promise<Response>(resolve => { resolveFetch = resolve; }); };
  const body = { message: "Read screenshot", clientRequestId: "delayed-image", image: { mimeType: "image/png", dataBase64: data.toString("base64") }, imageConsent: true, imageProviderConsent: "openai" };
  try {
    const pending = appendConversation(actor, body);
    await start;
    await assert.rejects(appendConversation(actor, { ...body, clientRequestId: "other-image" }), /still processing/);
    assert.equal(calls, 1);
    await clearConversation(actor, { confirmed: true });
    resolveFetch(Response.json({ status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify({ candidates: [candidate({ id: "new-image", source: "image" })] }) }] }] }));
    await assert.rejects(pending, (e: unknown) => e instanceof ApiError && e.status === 409);
    assert.equal(f.state.messages.length, 0);
    assert.equal(f.state.proposal.status, "cancelled");
    assert.equal(f.state.requests[0].status, "failed");
    await assert.rejects(appendConversation(actor, body), /previous attempt/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (prior.enabled === undefined) delete process.env.COACH_VISION_ENABLED; else process.env.COACH_VISION_ENABLED = prior.enabled;
    if (prior.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prior.key;
    f.restore();
  }
});


test("unreviewed available-time updates persist a safety review marker until clear or newer authoritative check-in", async () => {
  for (const resolution of ["clear", "checkin"] as const) {
    const f = fixture();
    try {
      await appendConversation(actor, { message: "Today I have 15 minutes available", clientRequestId: "availability-report" });
      const marker = f.state.messages.find((m: any) => m.role === "assistant" && JSON.parse(m.metadata || "{}").requiresCheckinReview);
      assert.ok(marker);
      marker.createdAt = new Date(Date.now() - 3000);
      const held = await appendConversation(actor, { message: "Why is easy endurance useful?", clientRequestId: "followup-held" });
      assert.ok(held.pendingActions.includes("review_checkin"));
      assert.match(held.answer, /recently|check-in/);
      if (resolution === "clear") await clearConversation(actor, { confirmed: true });
      else {
        for (const m of f.state.messages) if (m.role === "assistant") m.createdAt = new Date(Date.now() - 3000);
        f.state.checkin = { answers: JSON.stringify({ sleep: 4, soreness: 1, motivation: 4, energy: 4, stress: 1, sick: false, newPain: false, urgentSymptoms: false, availableMin: 15, inputMetadata: { recordedAt: new Date(Date.now() - 1000).toISOString() } }) };
      }
      const resolved = await appendConversation(actor, { message: "Why is easy endurance useful?", clientRequestId: "followup-resolved" });
      assert.ok(!resolved.answer.includes("You recently mentioned"));
      const latest = f.state.messages.at(-1);
      assert.notEqual(JSON.parse(latest.metadata).ruleId, "coach-conversation-v1:clarify-prior-safety");
    } finally { f.restore(); }
  }
});


test("conversation reads owner-only actual JStress and explicit rest without legacy substitution", async () => {
  const f = fixture();
  try {
    const recordedAt = new Date(); recordedAt.setUTCDate(recordedAt.getUTCDate() - 1);
    const recorded = { id: "actual-a", userId: actor.id, date: recordedAt, completed: true, planned: false, matchedPlanId: null, durationMin: 25, actualDurationMin: null, rpe: 4, tss: 999 };
    f.state.loadWorkouts = [recorded, { ...recorded, id: "other", userId: "athlete-b" }, { ...recorded, id: "matched-plan", matchedPlanId: "actual-a" }, { ...recorded, id: "incomplete", completed: false }, { ...recorded, id: "partial", completed: false, feedbackStatus: "partial", actualDurationMin: 10, rpe: 3 }];
    f.state.restObservations = [{ userId: actor.id, metricType: "jmm_rest_day", source: "manual", value: 1, qualityFlag: "ok", measurementMethod: "athlete_reported_rest", observedAt: new Date(`${today}T00:00Z`) }];
    const result = await appendConversation(actor, { message: "What is my JStress?" });
    assert.match(result.answer, /Recorded-session total: 130 AU/);
    assert.match(result.answer, /2\/2 performed sessions/);
    assert.match(result.answer, new RegExp(`JStress \\(${today}\\): 0 AU`));
    assert.match(result.answer, /88 days are unknown/);
    assert.doesNotMatch(result.answer, /999/);
    assert.equal(f.state.loadQuery.userId, actor.id);
    assert.equal(f.state.restQuery.measurementMethod, "athlete_reported_rest");
    assert.equal(f.state.loadQuery.date.gte.toISOString().slice(11), "00:00:00.000Z");
  } finally { f.restore(); }
});


test("stored legacy RPE proposals keep their exact units and reject zero or unit changes", () => {
  const old = candidate({ id: "legacy-rpe", kind: "workout_feedback", field: "rpe", value: 4, unit: "1-10", sessionId: "session-a" });
  assert.deepEqual(validateSelectedCandidates([old], [old], today), [old]);
  assert.deepEqual(validateSelectedCandidates([old], [{ ...old, value: 1 }], today), [{ ...old, value: 1 }]);
  assert.throws(() => validateSelectedCandidates([old], [{ ...old, value: 0 }], today));
  assert.throws(() => validateSelectedCandidates([old], [{ ...old, value: 11 }], today));
  assert.throws(() => validateSelectedCandidates([old], [{ ...old, value: "4" }], today));
  assert.throws(() => validateSelectedCandidates([old], [{ ...old, unit: "0-10" }], today));
  const otherField = { ...old, field: "actualDurationMin" };
  assert.throws(() => validateSelectedCandidates([otherField], [otherField], today));
});


test("coach service identifies an explicit sessionless rest day and suppresses movement after actual activity", async () => {
  const f = fixture();
  try {
    f.state.plannedRestDay = { id: "rest-day" };
    f.state.checkin = { answers: JSON.stringify({ sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, newPain: false, urgentSymptoms: false, availableMin: 30 }) };
    const first = await appendConversation(actor, { message: "Explain my recovery day" });
    assert.match(first.answer, /20 min very easy Z1/);
    f.state.loadWorkouts = [{ id: "actual-today", userId: actor.id, date: new Date(), completed: true, planned: false, matchedPlanId: null, durationMin: 20, rpe: 2 }];
    const afterActivity = await appendConversation(actor, { message: "Explain my recovery day now" });
    assert.doesNotMatch(afterActivity.answer, /20 min very easy Z1/);
  } finally { f.restore(); }
  const unknown = fixture();
  try {
    const response = await appendConversation(actor, { message: "Explain my recovery day" });
    assert.match(response.answer, /do not have a confirmed planned rest day/);
    assert.doesNotMatch(response.answer, /20 min very easy Z1/);
  } finally { unknown.restore(); }
});
