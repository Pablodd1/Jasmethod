import test from "node:test";
import assert from "node:assert/strict";
import { telegramPairingCode, matchesTelegramPairing } from "./telegram-pairing";
test("private Telegram pairing is athlete-bound, secret-bound and short-lived", () => {
  const now = 1_800_000;
  const code = telegramPairingCode("fixture-athlete", "fixture-secret", now);
  const message = { text: `/start ${code}`, date: now / 1000, chat: { id: 123, type: "private" } };
  assert.equal(matchesTelegramPairing(message, "fixture-athlete", "fixture-secret", now), true);
  assert.equal(matchesTelegramPairing(message, "other", "fixture-secret", now), false);
  assert.equal(matchesTelegramPairing(message, "fixture-athlete", "other-secret", now), false);
  assert.equal(matchesTelegramPairing(message, "fixture-athlete", "fixture-secret", now + 600_001), false);
  assert.equal(matchesTelegramPairing({ ...message, date: now / 1000 + 1 }, "fixture-athlete", "fixture-secret", now), false);
  assert.equal(matchesTelegramPairing({ ...message, chat: { id: 123, type: "group" } }, "fixture-athlete", "fixture-secret", now), false);
  assert.equal(matchesTelegramPairing({ ...message, text: `prefix ${code}` }, "fixture-athlete", "fixture-secret", now), false);
});
test("pairing remains usable across a window boundary without accepting an old message", () => {
  const created = 1_799_000, now = 1_801_000;
  const message = { text: telegramPairingCode("fixture", "secret", created), date: created / 1000, chat: { id: 1, type: "private" } };
  assert.equal(matchesTelegramPairing(message, "fixture", "secret", now), true);
  assert.throws(() => telegramPairingCode("fixture", ""));
});
