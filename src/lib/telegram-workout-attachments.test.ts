import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSession } from "./canonical-session";
import { telegramWorkoutActionable, telegramWorkoutAttachments } from "./telegram-workout-attachments";
import { sendTelegramCoaching, type TelegramWorkoutAttachment } from "./telegram-coaching-transport";
const env = { ENABLE_TELEGRAM_COACHING: "true", ENABLE_AUTOMATED_DELIVERY: "true", COACHING_TRANSPORT: "telegram", TELEGRAM_BOT_TOKEN: "SYNTHETIC_ONLY", TELEGRAM_COACHING_WEBHOOK_SECRET: "SYNTHETIC_ONLY" };
const now = new Date("2026-10-11T12:00:00Z");
const session = () => canonicalSession({ athleteId: "fixture-athlete", workout: { id: "fixture-session", sport: "bike", title: "Fixture", durationMin: 10 }, prescription: { sport: "bike", durationMin: 10, verdict: "full", steps: [{ name: "Steady", seconds: 600, zone: "z2", phase: "active", note: "PRIVATE_HISTORY" }] }, profile: { ftp: 200 }, dateLocal: "2026-10-11", timezone: "UTC" });
const workout = { approved: true, planned: true, completed: false, feedbackStatus: null, startTime: "15:00" };
const attachments: TelegramWorkoutAttachment[] = [{ kind: "fit", bytes: new Uint8Array([1]), filename: "workout.fit", caption: "Manual transfer required" }, { kind: "graphic", bytes: new Uint8Array([2]), filename: "profile.png", caption: "Time profile" }];
const accepted = (id: number, chat = 123) => new Response(JSON.stringify({ ok: true, result: { message_id: id, chat: { id: chat } } }));

test("Telegram files require athlete approval of the exact ready revision, current day and unstarted session", () => {
  const s = session();
  assert.equal(telegramWorkoutActionable(s, workout, s.revision, now), true);
  for (const patch of [{ approved: false }, { planned: false }, { completed: true }, { feedbackStatus: "partial" }, { startTime: "11:00" }]) assert.equal(telegramWorkoutActionable(s, { ...workout, ...patch }, s.revision, now), false);
  for (const revision of [null, "old"]) assert.equal(telegramWorkoutActionable(s, workout, revision, now), false);
  for (const patch of [{ verdict: "blocked" as const }, { dateLocal: "2026-10-12" }, { capability: { ...s.capability, downloadFormat: "zip" as const } }]) assert.equal(telegramWorkoutActionable({ ...s, ...patch }, workout, s.revision, now), false);
});
test("artifact builder emits FIT and PNG, strips private notes and omits dishonest non-time graphics", () => {
  const s = session(), result = telegramWorkoutAttachments(s);
  assert.deepEqual(result.map(a => a.kind), ["fit", "graphic"]);
  assert.equal(Buffer.from(result[0].bytes).includes(Buffer.from("PRIVATE_HISTORY")), false);
  assert.equal(Buffer.from(result[0].bytes).toString("ascii", 8, 12), ".FIT");
  assert.equal(Buffer.from(result[1].bytes).toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.match(result[0].caption, /watch delivery unverified/);
  assert.equal(telegramWorkoutAttachments({ ...s, verdict: "blocked" }).length, 0);
  const distance = { ...s, steps: s.steps.map(step => ({ ...step, endpoint: { type: "distance" as const, meters: 1000 } })) };
  assert.deepEqual(telegramWorkoutAttachments(distance).map(a => a.kind), ["fit"]);
});
test("bundle uses official multipart APIs and verifies each accepted recipient and receipt", async () => {
  const methods: string[] = []; let guards = 0;
  const result = await sendTelegramCoaching("123", "Workout", { env, attachments, beforeSend: async () => { guards++; }, fetcher: (async (url, init) => {
    methods.push(new URL(String(url)).pathname.split("/").pop()!);
    if (methods.length > 1) { assert.ok(init?.body instanceof FormData); assert.equal(init.body.get("chat_id"), "123"); const field = methods.length === 2 ? "document" : "photo"; assert.ok(init.body.get(field) instanceof Blob); assert.equal(init.headers, undefined); }
    return accepted(methods.length);
  }) as typeof fetch });
  assert.deepEqual(methods, ["sendMessage", "sendDocument", "sendPhoto"]); assert.equal(guards, 3);
  assert.equal(result.status, "sent"); assert.equal(result.receiptId, "telegram:1"); assert.deepEqual(result.parts?.map(p => p.receiptId), ["telegram:1", "telegram:2", "telegram:3"]);
});
test("FIT rejection leaves partial text receipt; interrupted or wrong-recipient FIT is unknown and never retried", async () => {
  for (const mode of ["reject", "interrupt", "wrong-recipient"]) {
    let calls = 0;
    const result = await sendTelegramCoaching("123", "Workout", { env, attachments, fetcher: (async () => { calls++; if (calls === 1) return accepted(1); if (mode === "interrupt") throw Error("PRIVATE_CREDENTIAL"); return mode === "reject" ? new Response(JSON.stringify({ ok: false, error_code: 400 })) : accepted(2, 456); }) as typeof fetch });
    assert.equal(calls, 2); assert.equal(result.status, mode === "reject" ? "partial" : "unknown"); assert.equal(result.receiptId, "telegram:1"); assert.equal(result.parts?.[1].receiptId, null); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CREDENTIAL/);
  }
});
test("revoked consent or changed revision after text prevents all remaining uploads", async () => {
  let calls = 0, checks = 0;
  const result = await sendTelegramCoaching("123", "Workout", { env, attachments, beforeSend: async () => { if (++checks > 1) throw Error("revoked"); }, fetcher: (async () => { calls++; return accepted(calls); }) as typeof fetch });
  assert.equal(calls, 1); assert.equal(result.status, "partial"); assert.equal(result.parts?.[0].receiptId, "telegram:1");
});
test("invalid files and disabled transport never make a network request", async () => {
  let calls = 0; const fetcher = (async () => { calls++; throw Error("must not send"); }) as typeof fetch;
  for (const invalid of [[{ ...attachments[0], filename: "../private.fit" }], [{ ...attachments[0], bytes: new Uint8Array() }], [...attachments, attachments[0]]]) assert.equal((await sendTelegramCoaching("123", "Workout", { env, attachments: invalid, fetcher })).status, "failed");
  assert.equal((await sendTelegramCoaching("123", "Workout", { env: {}, attachments, fetcher })).status, "failed"); assert.equal(calls, 0);
});
test("photo rejection preserves both text and FIT receipts without resending either", async () => {
  let calls = 0;
  const result = await sendTelegramCoaching("123", "Workout", { env, attachments, fetcher: (async () => {
    calls++; return calls < 3 ? accepted(calls) : new Response(JSON.stringify({ ok: false, error_code: 400 }));
  }) as typeof fetch });
  assert.equal(calls, 3); assert.equal(result.status, "partial");
  assert.deepEqual(result.parts?.map(p => p.receiptId), ["telegram:1", "telegram:2", null]);
});
