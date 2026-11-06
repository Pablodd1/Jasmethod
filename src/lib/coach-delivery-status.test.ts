import assert from "node:assert/strict";
import { test } from "node:test";
import { asksGarminDeliveryStatus, readCoachGarminStatus } from "./coach-delivery-status";

const receipt = {
  sessionId: "owned-bike",
  date: "2026-11-05",
  status: "published",
  stage: "schedule_verified",
  deviceReceived: false,
};

test("Garmin delivery questions are local in both languages and distinct from activity imports", () => {
  for (const question of [
    "My approved workout isn’t in Garmin.",
    "Did my bike workout sync to Garmin Connect?",
    "Mi sesión no aparece en Garmin.",
    "¿Se publicó mi entrenamiento en Garmin?",
  ]) assert.ok(asksGarminDeliveryStatus(question), question);

  for (const question of [
    "What Garmin should I buy for my workout?",
    "Why is my Garmin activity missing from JMM?",
    "Show my Garmin heart rate from yesterday.",
  ]) assert.equal(asksGarminDeliveryStatus(question), false, question);
});

test("Garmin status is scoped to the selected session and strips private response fields", () => {
  const status = readCoachGarminStatus({
    available: true,
    receipts: [
      { ...receipt, sessionId: "another-workout", status: "failed" },
      { ...receipt, providerUserId: "internal-account", revision: "internal-revision" },
    ],
  }, "owned-bike");

  assert.deepEqual(status, {
    available: true,
    receipt: { date: receipt.date, status: "schedule_verified" },
  });
  assert.deepEqual(readCoachGarminStatus({ available: false, receipts: [receipt] }, "missing"), {
    available: false,
    receipt: null,
  });
});

test("Garmin calendar acceptance requires the verified schedule stage and watch claims fail closed", () => {
  assert.deepEqual(readCoachGarminStatus({
    available: true,
    receipts: [{ ...receipt, stage: "created" }],
  }, receipt.sessionId), { available: true, receipt: { date: receipt.date, status: "unknown" } });
  assert.equal(readCoachGarminStatus({
    available: true,
    receipts: [{ ...receipt, deviceReceived: true }],
  }, receipt.sessionId), null);
  assert.deepEqual(readCoachGarminStatus({
    available: true,
    receipts: [{ ...receipt, status: "working", stage: "scheduling" }],
  }, receipt.sessionId), { available: true, receipt: { date: receipt.date, status: "workout_created" } });
});
