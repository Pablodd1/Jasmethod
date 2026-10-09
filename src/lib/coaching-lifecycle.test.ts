import { test } from "node:test";
import assert from "node:assert/strict";
import { boundedTelegramMessage, parseTelegramUpdate } from "./telegram-coaching-transport";
import { reconcileCoachingAttempts, finalizeTelegramAttempt, startTelegramPairing } from "./coaching-service";
import { prisma } from "./db";

test("native replies require original private bot receipt, reject forwarding/wrong chat and keep technical IDs internal", () => {
  const now = new Date("2026-10-02T21:00Z");
  const update = { update_id: 42, message: { date: now.getTime() / 1000, text: "status=completed; minutes=30; rpe=5", from: { id: 123, is_bot: false }, chat: { id: 123, type: "private" }, reply_to_message: { message_id: 91, from: { is_bot: true }, chat: { id: 123 } } } };
  assert.deepEqual(parseTelegramUpdate(update, now), { kind: "nativeReply", receiptId: "telegram:91", text: update.message.text, actorId: "123", chatId: "123", updateId: 42 });
  for (const reply of [{ ...update.message.reply_to_message, message_id: 0 }, { ...update.message.reply_to_message, chat: { id: 999 } }, { ...update.message.reply_to_message, from: { is_bot: false } }, { ...update.message.reply_to_message, forward_origin: { type: "user" } }]) assert.throws(() => parseTelegramUpdate({ ...update, message: { ...update.message, reply_to_message: reply } }, now));
  assert.throws(() => parseTelegramUpdate({ ...update, message: { ...update.message, forward_origin: { type: "user" } } }, now));
});
test("long notification truncation keeps whole target lines and full-app link with an explicit summary label", () => {
  const source = ["JMM bike · 2026-10-02", ...Array.from({ length: 100 }, (_, i) => `${i + 1}. active: 3 min · 180–200 W ${"x".repeat(50)}`), "Open authenticated app: https://example.invalid/daily?sessionId=one", "Pause or unsubscribe: https://example.invalid/reminders", "Provider acceptance does not establish reading or completion."].join("\n");
  const result = boundedTelegramMessage(source);
  assert.ok(result.length <= 4096); assert.match(result, /Concise summary shortened/); assert.match(result, /https:\/\/example.invalid\/daily\?sessionId=one/);
  assert.ok(result.startsWith("JMM bike")); assert.match(result, /180–200 W/);
});
test("interrupted pending attempts become unknown with no retry or reply capability", async () => {
  let captured: any;
  const now = new Date("2026-10-02T21:00Z");
  await reconcileCoachingAttempts(now, { coachingPrompt: { updateMany: async (arg: any) => { captured = arg; return { count: 1 }; } } } as any);
  assert.deepEqual(captured.where, { status: "pending", lastAttemptAt: { lt: new Date("2026-10-02T20:40Z") } });
  assert.equal(captured.data.status, "unknown"); assert.equal(captured.data.nextAttemptAt, null); assert.equal(captured.data.tokenHash, null);
});
test("late provider acceptance cannot revive a canceled reply capability", async () => {
  const original = prisma.$transaction;
  const writes: any[] = [], audits: any[] = [];
  (prisma as any).$transaction = async (fn: any) => fn({ coachingPrompt: {
    findFirst: async () => ({ id: "prompt", userId: "athlete", status: "cancelled", attempts: 1 }),
    updateMany: async (arg: any) => { writes.push(arg); return { count: arg.where.status === "pending" ? 0 : 1 }; },
    findUniqueOrThrow: async () => ({ id: "prompt", status: "cancelled", tokenHash: null }),
  }, auditLog: { create: async (arg: any) => { audits.push(arg); return {}; } } });
  try {
    const result = await finalizeTelegramAttempt("prompt", "athlete", { status: "sent", receiptId: "telegram:123", error: null });
    assert.equal(result.status, "cancelled"); assert.equal(writes[0].where.status, "pending");
    assert.equal(writes[1].data.tokenHash, null); assert.equal(writes[1].data.nextAttemptAt, null);
    assert.match(writes[1].data.error, /Provider accepted/); assert.equal(JSON.parse(audits[0].data.after).claimFinalized, false);
  } finally { (prisma as any).$transaction = original; }
});
test("finalization storage failure rejects instead of fabricating a persisted sent receipt", async () => {
  const original = prisma.$transaction;
  (prisma as any).$transaction = async () => { throw Error("synthetic storage interruption"); };
  try { await assert.rejects(finalizeTelegramAttempt("prompt", "athlete", { status: "sent", receiptId: "telegram:123", error: null }), /storage interruption/); }
  finally { (prisma as any).$transaction = original; }
});


test("Telegram pairing rejects missing or invalid usernames before creating a challenge", async () => {
  const keys = ["ENABLE_TELEGRAM_COACHING", "ENABLE_AUTOMATED_DELIVERY", "COACHING_TRANSPORT", "TELEGRAM_BOT_TOKEN", "TELEGRAM_COACHING_WEBHOOK_SECRET", "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME", "TELEGRAM_BOT_USERNAME"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const original = prisma.communicationPreference.upsert;
  let writes = 0;
  (prisma.communicationPreference as any).upsert = async () => { writes++; return {}; };
  Object.assign(process.env, { ENABLE_TELEGRAM_COACHING: "true", ENABLE_AUTOMATED_DELIVERY: "true", COACHING_TRANSPORT: "telegram", TELEGRAM_BOT_TOKEN: "synthetic-test-token", TELEGRAM_COACHING_WEBHOOK_SECRET: "synthetic-test-secret" });
  delete process.env.TELEGRAM_BOT_USERNAME;
  try {
    for (const username of ["", "@invalid", "bad/path", "https://example.invalid", "tiny"]) {
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = username;
      await assert.rejects(startTelegramPairing({ id: "athlete", email: "athlete@example.invalid", timezone: "UTC" }), (error: any) => error.status === 503 && /bot username/.test(error.message));
    }
    assert.equal(writes, 0);
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME = "ExampleWorkoutBot";
    const result = await startTelegramPairing({ id: "athlete", email: "athlete@example.invalid", timezone: "UTC" });
    assert.equal(writes, 1);
    assert.match(result.pairingUrl, /^https:\/\/t\.me\/ExampleWorkoutBot\?start=[A-Za-z0-9_-]{43}$/);
    assert.equal(result.enabled, false, "linking alone never opts in");
  } finally {
    (prisma.communicationPreference as any).upsert = original;
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});
