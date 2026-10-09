import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { sendManualEmail } from "./manual-workout-email-transport";

test("manual email transport distinguishes matching SMTP acceptance, rejection and ambiguity without sending", async () => {
  const original = nodemailer.createTransport;
  const host = process.env.SMTP_HOST, from = process.env.SMTP_FROM;
  let result: any = { accepted: ["athlete@example.invalid"], rejected: [], messageId: "provider-id" };
  let fail = false, calls = 0, closed = 0;
  process.env.SMTP_HOST = "smtp.example.invalid"; process.env.SMTP_FROM = "sender@example.invalid";
  (nodemailer as any).createTransport = () => ({ sendMail: async () => { calls++; if (fail) throw Error("ambiguous timeout"); return result; }, close: () => { closed++; } });
  const message = { to: "athlete@example.invalid", subject: "Test", text: "Fixture", html: "<p>Fixture</p>" };
  try {
    assert.deepEqual(await sendManualEmail(message), { status: "accepted", receiptId: "provider-id" });
    result = { accepted: [], rejected: ["athlete@example.invalid"] };
    assert.equal((await sendManualEmail(message)).status, "rejected");
    result = { accepted: ["someone-else@example.invalid"], rejected: [] };
    assert.equal((await sendManualEmail(message)).status, "unknown");
    fail = true; assert.equal((await sendManualEmail(message)).status, "unknown");
    assert.equal(calls, 4); assert.equal(closed, 4);
    for (const to of ["one@example.invalid,two@example.invalid", "one@example.invalid\r\nBcc:two@example.invalid", "Display Name <one@example.invalid>"]) assert.equal((await sendManualEmail({ ...message, to })).status, "rejected");
    assert.equal(calls, 4);
    delete process.env.SMTP_HOST;
    assert.equal((await sendManualEmail(message)).status, "rejected"); assert.equal(calls, 4);
  } finally {
    (nodemailer as any).createTransport = original;
    if (host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = host;
    if (from === undefined) delete process.env.SMTP_FROM; else process.env.SMTP_FROM = from;
  }
});
