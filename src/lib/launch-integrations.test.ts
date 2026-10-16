import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTelegramWebhook, launchConfiguration, probeLaunchIntegrations, telegramWebhookTarget } from "./launch-integrations";
const env = { APP_URL: "https://example.test", DEEPSEEK_API_KEY: "synthetic-private-ai-key", EXTERNAL_AI_ENABLED: "true",
  SMTP_HOST: "smtp.example.test", SMTP_FROM: "no-reply@example.test", MANUAL_WORKOUT_EMAIL_ORIGIN: "https://example.test", ENABLE_MANUAL_WORKOUT_EMAIL: "true",
  TELEGRAM_BOT_TOKEN: "synthetic-private-bot-token", TELEGRAM_COACHING_WEBHOOK_SECRET: "synthetic_webhook_secret_with_32_characters",
  TELEGRAM_BOT_USERNAME: "Synthetic_JMM_bot", ENABLE_TELEGRAM_COACHING: "true", ENABLE_AUTOMATED_DELIVERY: "true", COACHING_TRANSPORT: "telegram" };
test("launch diagnostics never reveal secrets and distinguish configuration from provider verification", () => {
  const checks = launchConfiguration(env);
  assert.equal(checks.deepseek.state, "configured"); assert.equal(checks.email.state, "configured");
  assert.equal(checks.telegram.state, "configured");
  for (const secret of [env.DEEPSEEK_API_KEY, env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_COACHING_WEBHOOK_SECRET]) assert.ok(!JSON.stringify(checks).includes(secret));
  assert.ok(launchConfiguration({}).deepseek.missing?.includes("DEEPSEEK_API_KEY"));
});
test("webhook destination is server-owned HTTPS origin only", () => {
  for (const APP_URL of ["http://example.test", "https://user:password@example.test", "https://example.test/other", "https://example.test?next=other", "file:///tmp"]) assert.equal(telegramWebhookTarget({ APP_URL }), null);
  assert.equal(telegramWebhookTarget(env), "https://example.test/api/coaching/telegram/webhook");
});
test("a different existing Telegram integration is never overwritten", async () => {
  const calls: string[] = [];
  const result = await checkTelegramWebhook(true, env, async method => {
    calls.push(method); return method === "getMe" ? { is_bot: true, username: env.TELEGRAM_BOT_USERNAME } : { url: "https://another.example.test/webhook" };
  });
  assert.equal(result.state, "conflict"); assert.ok(!calls.includes("setWebhook")); assert.ok(!JSON.stringify(result).includes("another.example"));
});
test("webhook registration preserves pending messages and verifies the resulting URL", async () => {
  let registered = false;
  const result = await checkTelegramWebhook(true, env, async (method, body) => {
    if (method === "getMe") return { is_bot: true, username: env.TELEGRAM_BOT_USERNAME };
    if (method === "getWebhookInfo") return { url: registered ? telegramWebhookTarget(env) : "" };
    assert.equal(body?.drop_pending_updates, false); assert.deepEqual(body?.allowed_updates, ["message"]);
    assert.equal(body?.secret_token, env.TELEGRAM_COACHING_WEBHOOK_SECRET); registered = true; return true;
  });
  assert.equal(result.state, "verified"); assert.ok(registered);
});
test("an accepted setWebhook response alone is insufficient evidence", async () => {
  const result = await checkTelegramWebhook(true, env, async method => method === "getMe" ? { is_bot: true, username: env.TELEGRAM_BOT_USERNAME } : method === "setWebhook" ? true : { url: "" });
  assert.equal(result.state, "failed");
});
test("transport exceptions including token URLs are redacted", async () => {
  const result = await probeLaunchIntegrations(env, { smtp: async () => { throw new Error("private smtp password"); }, telegram: async () => { throw new Error(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}`); } });
  assert.equal(result.email.state, "failed"); assert.equal(result.telegram.state, "failed");
  assert.ok(!JSON.stringify(result).includes("private smtp")); assert.ok(!JSON.stringify(result).includes(env.TELEGRAM_BOT_TOKEN));
});
test("disabled integrations make no network requests", async () => {
  let called = false;
  const result = await probeLaunchIntegrations({}, { smtp: async () => { called = true; return true; }, telegram: async () => { called = true; return null; } });
  assert.equal(called, false); assert.equal(result.email.state, "missing"); assert.equal(result.telegram.state, "missing");
});
test("runtime readiness uses actual AI model and email-origin validators", () => {
  assert.equal(launchConfiguration({ ...env, DEEPSEEK_MODEL: "unsupported" }).deepseek.state, "missing");
  assert.equal(launchConfiguration({ ...env, MANUAL_WORKOUT_EMAIL_ORIGIN: "http://example.test/other" }).email.state, "missing");
});
test("verified bot identity must match the pairing username", async () => {
  let changed = false;
  const check = await checkTelegramWebhook(true, env, async method => {
    if (method === "getMe") return { is_bot: true, username: "Different_JMM_bot" };
    if (method === "setWebhook") changed = true;
    return { url: telegramWebhookTarget(env) };
  });
  assert.equal(check.state, "failed"); assert.equal(check.botUsername, "Different_JMM_bot"); assert.equal(changed, false);
});
