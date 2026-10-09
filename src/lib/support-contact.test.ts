import { test } from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_CONTACT_EMAIL } from "./public-contact";
import { supportContacts, supportEmailDraft } from "./support-contact";

test("support configuration uses the public mailbox without exposing credentials", () => {
  for (const SUPPORT_EMAIL of [undefined, "", "  "]) {
    assert.equal(supportContacts({ SUPPORT_EMAIL }).email, PUBLIC_CONTACT_EMAIL);
  }
  assert.deepEqual(supportContacts({ SMTP_USER: "private@example.com", TELEGRAM_BOT_TOKEN: "secret" }), { email: PUBLIC_CONTACT_EMAIL, telegramUsername: null });
  assert.deepEqual(supportContacts({ SUPPORT_EMAIL: " help@example.com ", SUPPORT_TELEGRAM_USERNAME: " @jmm_support " }), { email: PUBLIC_CONTACT_EMAIL, telegramUsername: "jmm_support" });
  for (const value of ["coach@jasmiamimethod.com", "jasmelacosta@gmail.com", "help@example.com", "help@example.com\r\nBcc:other@example.com", "help@example.com?bcc=other@example.com", "javascript:alert(1)"]) {
    assert.equal(supportContacts({ SUPPORT_EMAIL: value }).email, PUBLIC_CONTACT_EMAIL);
  }
  for (const value of ["https://evil.example/path", "foo?start=secret", "../other", "a"]) {
    assert.equal(supportContacts({ SUPPORT_TELEGRAM_USERNAME: value }).telegramUsername, null);
  }
});

test("support email draft includes selected topic and no automatic sending", () => {
  const url = new URL(supportEmailDraft("help+team@example.com", "device"));
  assert.equal(url.protocol, "mailto:");
  assert.equal(decodeURIComponent(url.pathname), "help+team@example.com");
  assert.equal(url.searchParams.get("subject"), "JMM support: Device connection or workout delivery");
  assert.match(url.searchParams.get("body") || "", /do not include passwords/i);
  assert.equal(url.searchParams.has("bcc"), false);
});
