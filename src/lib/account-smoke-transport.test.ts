import test from "node:test";
import assert from "node:assert/strict";
import { sendSmokeTelegram, sendSmokeEmail, sendSmokeCalendar, SMOKE_CONTENT, isSmokeEmailAddress, sendSmokeEmailVerification } from "./account-smoke-transport";

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const telegramReceipt = { ok: true, result: { message_id: 17, chat: { id: 12345, type: "private" }, text: SMOKE_CONTENT } };
const telegramEnv = { TELEGRAM_BOT_TOKEN: "SYNTHETIC_ONLY", ENABLE_TELEGRAM_COACHING: "false", ENABLE_AUTOMATED_DELIVERY: "false" };
const calendarInput = { token: "synthetic-test-token", eventId: "jmmsmoke0123456789abcdef", start: new Date("2026-10-11T10:00:00Z") };
const calendarReceipt = { id: calendarInput.eventId, summary: SMOKE_CONTENT, description: SMOKE_CONTENT, status: "confirmed", visibility: "private", transparency: "transparent", reminders: { useDefault: false },
  start: { dateTime: calendarInput.start.toISOString() }, end: { dateTime: "2026-10-11T10:05:00.000Z" } };

test("Telegram sends one fixed private smoke message independently of scheduler flags", async () => {
  let calls = 0;
  const result = await sendSmokeTelegram("12345", { env: telegramEnv, fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.telegram.org/botSYNTHETIC_ONLY/sendMessage");
    assert.equal(init?.redirect, "error"); assert.ok(init?.signal); assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init?.body)), { chat_id: "12345", text: SMOKE_CONTENT, link_preview_options: { is_disabled: true } });
    return response(telegramReceipt);
  } });
  assert.deepEqual(result, { status: "provider_accepted", receiptId: "telegram:17" }); assert.equal(calls, 1);
});

test("Telegram rejects invalid configuration/private recipient before provider calls", async () => {
  const fetcher: typeof fetch = async () => { assert.fail("Unexpected network call"); };
  for (const chat of ["-123", "@group", "", "00123", "123/path", "9007199254740992"]) assert.equal((await sendSmokeTelegram(chat, { env: telegramEnv, fetcher })).status, "rejected");
  for (const env of [{}, { TELEGRAM_BOT_TOKEN: "bad/token" }]) assert.equal((await sendSmokeTelegram("12345", { env, fetcher })).status, "rejected");
});

test("Telegram never fabricates acceptance from incomplete/mismatched receipts", async () => {
  const valid = telegramReceipt.result;
  const bodies = [null, [], {}, { ok: true }, { ok: true, result: { ...valid, message_id: 0 } }, { ok: true, result: { ...valid, message_id: "17" } },
    { ok: true, result: { ...valid, chat: { id: 777, type: "private" } } }, { ok: true, result: { ...valid, chat: { id: 12345, type: "group" } } },
    { ok: true, result: { ...valid, text: "other" } }];
  for (const body of bodies) assert.deepEqual(await sendSmokeTelegram("12345", { env: telegramEnv, fetcher: async () => response(body) }), { status: "unknown", receiptId: null });
  assert.equal((await sendSmokeTelegram("12345", { env: telegramEnv, fetcher: async () => response({ ok: false, description: "private provider detail" }, 400) })).status, "rejected");
});

test("HTTP interruptions/malformed bodies are redacted unknowns with no retry", async () => {
  for (const send of [
    (fetcher: typeof fetch) => sendSmokeTelegram("12345", { env: telegramEnv, fetcher }),
    (fetcher: typeof fetch) => sendSmokeCalendar(calendarInput, { fetcher }),
  ]) {
    for (const broken of [async () => { throw new Error("SECRET PRIVATE PROVIDER DETAILS"); }, async () => new Response("not json")]) {
      let calls = 0;
      const result = await send(async () => { calls++; return broken(); });
      assert.deepEqual(result, { status: "unknown", receiptId: null }); assert.equal(calls, 1);
    }
  }
});

const emailEnv = { SMTP_HOST: "smtp.example.invalid", SMTP_FROM: "sender@example.invalid" };
const recipient = "owner@example.invalid";
test("Email uses fixed no-attachment content and requires exact acceptance and provider ID", async () => {
  let calls = 0, closed = 0;
  const result = await sendSmokeEmail(recipient, { env: emailEnv, createTransport: settings => {
    assert.equal((settings as { requireTLS: boolean }).requireTLS, true);
    assert.equal((settings as { socketTimeout: number }).socketTimeout, 15000);
    return { sendMail: async message => { calls++; assert.deepEqual(message, { from: emailEnv.SMTP_FROM, to: { address: recipient, name: "" }, subject: SMOKE_CONTENT, text: SMOKE_CONTENT, html: `<p>${SMOKE_CONTENT}</p>` });
      return { accepted: [{ address: recipient.toUpperCase() }], rejected: [], messageId: "<synthetic@example.invalid>" }; }, close: () => { closed++; } };
  } });
  assert.deepEqual(result, { status: "provider_accepted", receiptId: "<synthetic@example.invalid>" }); assert.equal(calls, 1); assert.equal(closed, 1);
});

test("Email rejects invalid input and treats incomplete/contradictory SMTP receipts as unknown", async () => {
  const createTransport = () => { assert.fail("Unexpected transport"); };
  for (const to of ["", "a@example.invalid,b@example.invalid", "a@example.invalid\r\nBcc:b@example.invalid", "Name <a@example.invalid>", "a\0@example.invalid"])
    assert.equal((await sendSmokeEmail(to, { env: emailEnv, createTransport })).status, "rejected");
  assert.equal((await sendSmokeEmail(recipient, { env: {}, createTransport })).status, "rejected");
  for (const result of [{ accepted: [recipient] }, { accepted: [recipient], messageId: "bad\nreceipt" }, { accepted: [recipient], rejected: [recipient], messageId: "id" },
    { accepted: ["wrong@example.invalid"], messageId: "id" }, { accepted: [recipient, "extra@example.invalid"], messageId: "id" }, {}]) {
    assert.deepEqual(await sendSmokeEmail(recipient, { env: emailEnv, createTransport: () => ({ sendMail: async () => result, close: () => {} }) }), { status: "unknown", receiptId: null });
  }
  assert.equal((await sendSmokeEmail(recipient, { env: emailEnv, createTransport: () => ({ sendMail: async () => ({ rejected: [recipient] }), close: () => {} }) })).status, "rejected");
  let calls = 0;
  assert.deepEqual(await sendSmokeEmail(recipient, { env: emailEnv, createTransport: () => ({ sendMail: async () => { calls++; throw new Error("SECRET"); }, close: () => {} }) }), { status: "unknown", receiptId: null });
  assert.equal(calls, 1);
});

test("Calendar inserts a fixed five-minute private transparent event without invitations or reminders", async () => {
  let calls = 0;
  const result = await sendSmokeCalendar(calendarInput, { fetcher: async (url, init) => {
    calls++; assert.equal(url, "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none");
    assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    assert.deepEqual(init?.headers, { Authorization: "Bearer synthetic-test-token", "Content-Type": "application/json" });
    assert.deepEqual(JSON.parse(String(init?.body)), { id: calendarInput.eventId, summary: SMOKE_CONTENT, description: SMOKE_CONTENT, visibility: "private", transparency: "transparent",
      start: calendarReceipt.start, end: calendarReceipt.end, reminders: { useDefault: false }, attendees: [], guestsCanInviteOthers: false, guestsCanModify: false, guestsCanSeeOtherGuests: false });
    return response(calendarReceipt);
  } });
  assert.deepEqual(result, { status: "provider_accepted", receiptId: calendarInput.eventId }); assert.equal(calls, 1);
});

test("Calendar validates inputs before provider calls", async () => {
  const fetcher: typeof fetch = async () => { assert.fail("Unexpected network call"); };
  for (const input of [{ ...calendarInput, token: "" }, { ...calendarInput, token: "bad\ntoken" }, { ...calendarInput, eventId: "bad-ID" }, { ...calendarInput, start: new Date(NaN) }, { ...calendarInput, start: new Date(8640000000000000) }])
    assert.equal((await sendSmokeCalendar(input, { fetcher })).status, "rejected");
});

test("Calendar acceptance requires matching ID, content, privacy, time and reminder receipt", async () => {
  for (const patch of [{ id: "other" }, { visibility: "public" }, { transparency: "opaque" }, { status: "cancelled" }, { summary: "other" }, { description: "other" },
    { attendees: [{ email: "guest@example.invalid" }] }, { attendees: null }, { reminders: { useDefault: true } }, { reminders: { useDefault: false, overrides: [{ method: "email", minutes: 5 }] } },
    { start: { dateTime: "2026-10-12T10:00:00Z" } }, { end: { dateTime: "2026-10-11T10:06:00Z" } }]) {
    assert.deepEqual(await sendSmokeCalendar(calendarInput, { fetcher: async () => response({ ...calendarReceipt, ...patch }) }), { status: "unknown", receiptId: null });
  }
  for (const status of [408, 409, 429, 500]) assert.equal((await sendSmokeCalendar(calendarInput, { fetcher: async () => response({}, status) })).status, "unknown");
  assert.equal((await sendSmokeCalendar(calendarInput, { fetcher: async () => response({}, 403) })).status, "rejected");
});


test("Shared email eligibility rejects all parser syntax and non-bare saved addresses before sending", async () => {
  const invalid = ["x:y@example.com", "x(y)@example.com", "x\\y@example.com", '"xy"@example.com', "x[y]@example.com", "[x]@example.com", "x@y@example.com",
    "x@example..com", ".x@example.com", "x.@example.com", "x..y@example.com", "x@-example.com", "x@example-.com", "x@exam_ple.com", "x@example.com.",
    "é@example.com", "x@exämple.com", "x@example.com\n", " x@example.com", "x@example.com ", "group:x@example.com;", "x@example.com,other@example.com",
    "x".repeat(65) + "@example.com", "x@" + "y".repeat(64) + ".com"];
  for (const to of invalid) {
    assert.equal(isSmokeEmailAddress(to), false, to);
    assert.deepEqual(await sendSmokeEmail(to, { env: emailEnv, createTransport: () => { assert.fail("Unsafe saved address reached SMTP"); } }), { status: "rejected", receiptId: null });
  }
  for (const to of ["first.last+smoke@example.com", "first_last@sub.example.com", "USER@EXAMPLE.COM", "x@xn--example-9za.com"]) assert.equal(isSmokeEmailAddress(to), true, to);
  assert.equal(isSmokeEmailAddress(null), false);
});


test("Unverified address gets one fixed combined verification and smoke email", async () => {
  const code = "A0123456789F";
  const text = "JMM SMOKE TEST\nVerification code: A0123456789F\nEnter this code in your signed-in JMM smoke-test page within 15 minutes. This verifies this one test only and does not enable workout emails.";
  let calls = 0, closed = 0;
  const result = await sendSmokeEmailVerification(recipient, code, { env: emailEnv, createTransport: () => ({
    sendMail: async message => {
      calls++;
      assert.deepEqual(message, { from: emailEnv.SMTP_FROM, to: { address: recipient, name: "" }, subject: SMOKE_CONTENT, text, html: text.split("\n").map(line => `<p>${line}</p>`).join("") });
      return { accepted: [recipient], rejected: [], messageId: "verification-test-id" };
    }, close: () => { closed++; },
  }) });
  assert.deepEqual(result, { status: "provider_accepted", receiptId: "verification-test-id" });
  assert.equal(calls, 1); assert.equal(closed, 1);
});

test("Verification codes cannot inject arbitrary text and invalid recipients never reach SMTP", async () => {
  const options = { env: emailEnv, createTransport: () => { assert.fail("Invalid verification message reached SMTP"); } };
  for (const code of ["", "A0123456789", "A0123456789F0", "a0123456789f", "G0123456789F", "A0123456789F\n", "<b>hello</b>", "012345\n6789F", "012345 6789F"])
    assert.deepEqual(await sendSmokeEmailVerification(recipient, code, options), { status: "rejected", receiptId: null });
  for (const to of ["x:y@example.com", "x(y)@example.com", "x@example.com,other@example.com"])
    assert.deepEqual(await sendSmokeEmailVerification(to, "A0123456789F", options), { status: "rejected", receiptId: null });
});

test("Combined verification email preserves strict SMTP receipts and never retries uncertainty", async () => {
  for (const result of [{ accepted: [recipient] }, { accepted: ["other@example.invalid"], messageId: "id" }, { accepted: [recipient], rejected: [recipient], messageId: "id" }]) {
    assert.deepEqual(await sendSmokeEmailVerification(recipient, "A0123456789F", { env: emailEnv, createTransport: () => ({ sendMail: async () => result, close: () => {} }) }), { status: "unknown", receiptId: null });
  }
  let calls = 0;
  assert.deepEqual(await sendSmokeEmailVerification(recipient, "A0123456789F", { env: emailEnv, createTransport: () => ({ sendMail: async () => { calls++; throw new Error("secret code and address"); }, close: () => {} }) }), { status: "unknown", receiptId: null });
  assert.equal(calls, 1);
});
