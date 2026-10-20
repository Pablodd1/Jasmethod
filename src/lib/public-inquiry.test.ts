import test from "node:test";
import assert from "node:assert/strict";
import { inquiryEmailText, parsePublicInquiry } from "./public-inquiry";
import { verifiedBookingUrl } from "./public-booking";

const base = { name: "Test Athlete", email: "athlete@example.test", topic: "demo", message: "I'd like to see a daily-coaching demonstration.", website: "", consent: true };
test("public inquiry requires consent and bounded validated fields", () => {
  assert.deepEqual(parsePublicInquiry(base)?.topic, "demo");
  for (const wrong of [
    { ...base, consent: false }, { ...base, website: "spam" }, { ...base, email: "not-an-email" },
    { ...base, topic: "unknown" }, { ...base, message: "Too short" }, { ...base, name: "a" },
    { ...base, message: "x".repeat(1501) }, { ...base, name: "x\nInjected header" },
  ]) assert.equal(parsePublicInquiry(wrong), null);
  const parsed = parsePublicInquiry(base)!;
  assert.match(inquiryEmailText(parsed), /athlete@example.test/);
});
test("booking calendar accepts only an explicitly configured HTTPS Cal.com event URL", () => {
  assert.equal(verifiedBookingUrl("https://cal.com/test-coach/intro"), "https://cal.com/test-coach/intro");
  for (const bad of [undefined, "", "https://cal.com", "https://cal.com/test", "https://cal.com.evil.com/a/b", "http://cal.com/a/b", "javascript:alert(1)", "https://cal.com/a/b?token=secret", "https://cal.com/a/b#hash"])
    assert.equal(verifiedBookingUrl(bad), null);
});
