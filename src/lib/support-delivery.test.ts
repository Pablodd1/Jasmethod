import { test } from "node:test";
import assert from "node:assert/strict";
import { deliverSupportMessage, parseSupportMessage, supportTelegramConfigured } from "./support-delivery";

const env = { ADMIN_BOT_TOKEN: "test-token", ADMIN_TELEGRAM_CHAT_ID: "123" };
const input = { category: "device" as const, message: "Workout has not arrived.", replyEmail: "athlete@example.com" };

test("support validates category and message bounds and controls", () => {
  for (const value of [null, [], { category: "__proto__", message: "hello there" }, { category: "login", message: "x" }, { category: "login", message: "x".repeat(1501) }, { category: "login", message: "Hello there\u0000" }]) assert.equal(parseSupportMessage(value), null);
  assert.deepEqual(parseSupportMessage(input), { category: "device", message: input.message });
  assert.equal(supportTelegramConfigured({ TELEGRAM_BOT_TOKEN: "test", ADMIN_TELEGRAM_CHAT_ID: "bad" }), false);
});

test("support confirms only Telegram receipt in the configured chat; no silent success", async () => {
  for (const body of [{ ok: false }, { ok: true }, { ok: true, result: { message_id: 45, chat: { id: 999 } } }]) {
    assert.equal(await deliverSupportMessage(input, env, async () => Response.json(body)), null);
  }
  let calls = 0;
  assert.equal(await deliverSupportMessage(input, {}, async () => { calls++; throw Error("not called"); }), null);
  assert.equal(calls, 0);
  const receipt = await deliverSupportMessage(input, env, async (url, init) => {
    assert.equal(url, "https://api.telegram.org/bottest-token/sendMessage");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.chat_id, "123");
    assert.equal(body.parse_mode, undefined);
    assert.equal(body.disable_web_page_preview, true);
    assert.match(body.text, /athlete@example.com/);
    return Response.json({ ok: true, result: { message_id: 45, chat: { id: 123 } } });
  });
  assert.equal(receipt, 45);
  assert.equal(await deliverSupportMessage(input, env, async () => { throw Error("provider secret"); }), null);
});
