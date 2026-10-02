import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_VERSION, parseCommunicationSettings, scheduledInstant, dueSchedule, newReplyToken, verifyReplyBinding,
  parseCoachingReply, validateCandidate, missingDataQuestions, mockTransport, mockCoachingEnabled, promptKey, validDate } from "./coaching-communication";
const settings = { primaryChannel: "telegram", paused: false, dailyPlan: true, sessionFeedback: true, missingData: true,
  timezone: "America/New_York", minuteOfDay: 90, quietStart: 23 * 60, quietEnd: 0, declinedOptional: [], consentVersion: CONSENT_VERSION };
const candidate = { status: "completed", minutes: 30, rpe: 5, sport: "run", declinedOptional: [] };
test("all communication purposes require explicit consent, valid timezone and strict scalar shapes", () => {
  assert.equal(parseCommunicationSettings(settings).primaryChannel, "telegram");
  for (const bad of [undefined, null, [], "true", 1]) assert.throws(() => parseCommunicationSettings({ ...settings, dailyPlan: bad }));
  for (const bad of [["telegram"], { toString: () => "telegram" }, true, 1, "all"]) assert.throws(() => parseCommunicationSettings({ ...settings, primaryChannel: bad }));
  assert.throws(() => parseCommunicationSettings({ ...settings, consentVersion: "old" }));
  assert.throws(() => parseCommunicationSettings({ ...settings, timezone: "invented" }));
  assert.throws(() => parseCommunicationSettings({ ...settings, quietStart: 20, quietEnd: 20 }));
  assert.throws(() => parseCommunicationSettings({ ...settings, minuteOfDay: "60" }));
  assert.throws(() => parseCommunicationSettings({ ...settings, declinedOptional: ["urgentSymptoms"] }));
  assert.throws(() => parseCommunicationSettings({ ...settings, telegramEnabled: true }));
});
test("DST fall-back has one earliest send identity and spring gap moves forward", () => {
  const s = parseCommunicationSettings(settings);
  assert.equal(scheduledInstant("2026-11-01", s).toISOString(), "2026-11-01T05:30:00.000Z");
  assert.equal(dueSchedule(s, new Date("2026-11-01T05:45Z"))?.day, "2026-11-01");
  assert.equal(dueSchedule(s, new Date("2026-11-01T06:45Z"))?.day, "2026-11-01");
  assert.equal(scheduledInstant("2026-03-08", { ...s, minuteOfDay: 150 }).toISOString(), "2026-03-08T07:00:00.000Z");
  assert.equal(promptKey("a", "sessionFeedback", "s", "2026-11-01"), promptKey("a", "sessionFeedback", "s", "2026-11-01"));
});
test("quiet hours defer overnight, protect manual attempts, and paused schedules never run", () => {
  const s = parseCommunicationSettings({ ...settings, minuteOfDay: 23 * 60, quietStart: 22 * 60, quietEnd: 7 * 60 });
  assert.equal(scheduledInstant("2026-10-02", s).toISOString(), "2026-10-03T11:00:00.000Z");
  assert.equal(dueSchedule(s, new Date("2026-10-03T09:00Z")), null);
  assert.equal(dueSchedule(s, new Date("2026-10-03T11:05Z"))?.day, "2026-10-02");
  assert.equal(dueSchedule({ ...s, paused: true }, new Date("2026-10-03T11:05Z")), null);
});
test("30-minute hashed tokens bind actor, chat, session, date, revision and timezone; reject replay", () => {
  const now = new Date("2026-10-02T17:00Z"), token = newReplyToken(now);
  const prompt = { userId: "a", sessionId: "s", observationDate: "2026-10-02", sourceRevision: "revision", timezone: "UTC",
    tokenHash: token.hash, tokenExpiresAt: token.expiresAt, tokenUsedAt: null, status: "simulated", replyStatus: "none", channel: "telegram" };
  const input = { userId: "a", sessionId: "s", observationDate: "2026-10-02", sourceRevision: "revision", timezone: "UTC", token: token.token,
    actorId: "1", chatId: "1", verifiedActorId: "1", verifiedChatId: "1" };
  assert.notEqual(token.hash, token.token); verifyReplyBinding(prompt, input, now);
  for (const k of ["userId", "sessionId", "observationDate", "sourceRevision", "timezone", "token", "actorId", "chatId"] as const) assert.throws(() => verifyReplyBinding(prompt, { ...input, [k]: "wrong" }, now));
  assert.throws(() => verifyReplyBinding(prompt, input, token.expiresAt));
  assert.throws(() => verifyReplyBinding({ ...prompt, tokenUsedAt: now }, input, now));
  assert.throws(() => verifyReplyBinding({ ...prompt, replyStatus: "pending" }, input, now));
  assert.throws(() => verifyReplyBinding({ ...prompt, status: "unknown" }, input, now));
});
test("bounded extraction keeps unknowns absent and never treats bare numeric/narrative as confirmation", () => {
  assert.deepEqual(parseCoachingReply("status=completed; minutes=30; rpe=5; sport=run"), candidate);
  assert.deepEqual(parseCoachingReply("status=unknown; minutes=unknown; rpe=unknown; sport=unknown"), { status: "unknown", minutes: null, rpe: null, sport: null, declinedOptional: [] });
  assert.deepEqual(parseCoachingReply("status=skipped"), { status: "skipped", minutes: null, rpe: null, sport: null, declinedOptional: [] });
  for (const text of ["2", "30 minutes felt fine", "no pain but fever", "status=completed; rpe=5; rpe=9", "status=completed; minutes=-3", "status=completed; rpe=11", "status=skipped; minutes=0", "estado=completado; minutos=30"]) assert.throws(() => parseCoachingReply(text), text);
  for (const bad of [["completed"], 1, true, {}, null]) assert.throws(() => validateCandidate({ ...candidate, status: bad }));
  for (const bad of [["run"], 1, true, {}]) assert.throws(() => validateCandidate({ ...candidate, sport: bad }));
  assert.throws(() => validateCandidate({ ...candidate, minutes: "30" }));
  assert.throws(() => validateCandidate({ ...candidate, newPain: false }));
});
test("missing inputs state exact consequences and decline suppresses optional re-asks only", () => {
  const q = missingDataQuestions({ sport: "run", missingSafety: ["sick", "availableMin"], planningMissing: ["goal"], declinedOptional: ["runBenchmark"] });
  assert.deepEqual(q.map(x => x.key), ["status", "minutes", "rpe", "sick", "availableMin", "setup:goal"]);
  assert.ok(q.every(x => x.question && x.consequence));
  assert.ok(q.filter(x => ["sick", "availableMin", "setup:goal"].includes(x.key)).every(x => x.appOnly));
  const complete = missingDataQuestions({ sport: "bike", feedbackStatus: "completed", actualDurationMin: 30, rpe: 5, hasAnchor: true, declinedOptional: [] });
  assert.deepEqual(complete, []);
  assert.deepEqual(missingDataQuestions({ sport: "strength", feedbackStatus: "skipped", declinedOptional: [] }), []);
});
test("mock outcomes distinguish simulated, failed and unknown; every external-capability default fails closed", () => {
  assert.equal(mockTransport().status, "simulated"); assert.match(mockTransport().receiptId!, /^mock:/);
  assert.equal(mockTransport("failed").status, "failed"); assert.equal(mockTransport("unknown").status, "unknown");
  assert.equal(mockCoachingEnabled({}), false);
  assert.equal(mockCoachingEnabled({ ENABLE_MOCK_COACHING: "true", COACHING_TRANSPORT: "telegram" }), false);
  assert.equal(mockCoachingEnabled({ ENABLE_MOCK_COACHING: "true", COACHING_TRANSPORT: "mock" }), true);
  assert.equal(mockCoachingEnabled({ ENABLE_MOCK_COACHING: "true", COACHING_TRANSPORT: "mock", VERCEL_ENV: "production" }), false);
  for (const date of ["2026-02-30", "invalid", "9999-99-99", "2026-01-01T00:00Z"]) assert.equal(validDate(date), false);
});
