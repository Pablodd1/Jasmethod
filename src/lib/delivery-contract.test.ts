import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { Decoder, Stream } from "@garmin/fitsdk";
import { canonicalSession, type CanonicalSession } from "./canonical-session";
import { buildPrivateSafeSessionDownload, buildSessionDownload, fitWorkoutName } from "./fit-export";
import { buildTrainingBundle, buildTrainingCalendar, type TrainingExportData } from "./training-export";
import { manualEmailActionable, manualEmailChanged, manualEmailKey } from "./manual-workout-email";
import { manualWorkoutEmail } from "./manual-workout-email-template";
import { telegramWorkoutActionable, telegramWorkoutAttachments } from "./telegram-workout-attachments";
import { sendTelegramCoaching, type TelegramWorkoutAttachment } from "./telegram-coaching-transport";

/**
 * One approved workout revision, several channels. All synthetic: a mock fetch stands in for Telegram and
 * nodemailer's message composer stands in for SMTP, so NOTHING here contacts a real service or athlete.
 * What this proves: every channel carries the SAME revision and the SAME steps, and a stale, unapproved,
 * completed or cancelled workout is not actionable on any of them. What it cannot prove: that a mail server,
 * Telegram, a calendar or a watch accepted anything (those stay BLOCKED until a consenting athlete tests live).
 */
const require = createRequire(import.meta.url);
const MailComposer = require("nodemailer/lib/mail-composer") as new (options: Record<string, unknown>) => { compile(): { build(cb: (error: Error | null, message: Buffer) => void): void } };
const NOW = new Date("2026-10-20T11:00:00Z");
const step = (extra: Record<string, unknown> = {}) => ({ name: "Work", seconds: 600, phase: "active", zone: "z2", ...extra });
const steps = [step({ phase: "warmup", zone: "z1" }), step({ zone: "z4", seconds: 300 }), step({ phase: "cooldown", zone: "z1" })];
function make(extraSteps = steps, id = "w-1"): CanonicalSession {
  return canonicalSession({ athleteId: "athlete-a", workout: { id, userId: "athlete-a", sport: "run", title: "Tempo (private title)", durationMin: 25 },
    prescription: { sport: "run", durationMin: extraSteps.reduce((n, s) => n + s.seconds, 0) / 60, verdict: "full", steps: extraSteps }, profile: {}, dateLocal: "2026-10-20", timezone: "America/New_York" });
}
const row = (over: Record<string, unknown> = {}) => ({ approved: true, planned: true, completed: false, feedbackStatus: null as string | null, startTime: "07:30", ...over });
const decodeFit = (bytes: Uint8Array | Buffer) => {
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  assert.equal(decoder.checkIntegrity(), true);
  const { messages, errors } = decoder.read() as { messages: any; errors: unknown[] };
  assert.deepEqual(errors, []);
  return messages;
};
/** The identity every channel must share: JMM-<10 hex of athlete:session:revision>. */
const identity = (wktName: string) => /^JMM-([0-9a-f]{10})/.exec(wktName)![1];
const shape = (m: any) => m.workoutStepMesgs.map((s: any) => [s.durationType, s.durationValue, s.intensity]);

async function mimeFitAttachment(session: CanonicalSession): Promise<Buffer> {
  const download = buildPrivateSafeSessionDownload(session, NOW);
  const email = manualWorkoutEmail({ language: "en", kind: "ready", workoutSport: session.sport, dateLabel: session.dateLocal, revision: session.revision.slice(0, 8), workoutUrl: "https://app.example.invalid/daily?sessionId=w-1", settingsUrl: "https://app.example.invalid/workout-email/settings" } as any);
  const raw = await new Promise<Buffer>((resolve, reject) => new MailComposer({ from: "jmm@example.invalid", to: "athlete-a@example.invalid", subject: email.subject, text: email.text, html: email.html,
    attachments: [{ filename: download.filename, content: Buffer.from(download.bytes) }] }).compile().build((error, message) => (error ? reject(error) : resolve(message))));
  const text = raw.toString("latin1");
  const at = text.search(new RegExp(`filename="?${download.filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.ok(at > 0, "attachment part not found in the composed message");
  const body = text.slice(at).split(/\r\n\r\n/)[1].split(/\r\n--/)[0];
  return Buffer.from(body.replace(/\r\n/g, ""), "base64");
}

test("email, Telegram, ZIP bundle and direct download all carry the same revision identity and the same steps", async () => {
  const session = make();
  const expected = identity(fitWorkoutName(session));
  const direct = decodeFit(buildSessionDownload(session, NOW).bytes);
  const email = decodeFit(await mimeFitAttachment(session));
  const telegramFit = telegramWorkoutAttachments(session).find(a => a.kind === "fit")!;
  const telegram = decodeFit(telegramFit.bytes);
  assert.equal(identity(direct.workoutMesgs[0].wktName), expected);
  assert.equal(identity(email.workoutMesgs[0].wktName), expected);
  assert.equal(identity(telegram.workoutMesgs[0].wktName), expected);
  assert.deepEqual(shape(email), shape(direct));
  assert.deepEqual(shape(telegram), shape(direct));
  assert.equal(direct.workoutStepMesgs.length, session.steps.length);
  // Telegram's caption names the same revision a human can compare, and states what is NOT confirmed.
  assert.match(telegramFit.caption, new RegExp(`revision ${session.revision.slice(0, 8)}`));
  assert.match(telegramFit.caption, /watch delivery unverified/);
  // The private-safe FIT leaves the athlete's title out of the file.
  assert.doesNotMatch(String(email.workoutMesgs[0].wktName), /private title/i);
});

test("the ICS entry and the ZIP bundle reference the same session and revision", () => {
  const session = make();
  const data: TrainingExportData = { athlete: { name: "Example Athlete", email: "athlete-a@example.invalid", timezone: "America/New_York", language: "en" }, workouts: [], metrics: [], sleep: [], checkins: [],
    plan: { name: "Plan", days: [{ date: new Date("2026-10-20T12:00:00Z"), week: 1, dayOff: false, sessions: [{ id: session.id, date: new Date("2026-10-20T12:00:00Z"), title: session.title, sport: "run", durationMin: 25, startTime: "07:30" }] }] },
    resolvedSessions: { [session.id]: session } };
  assert.match(buildTrainingCalendar(data), new RegExp(`UID:${session.id}@jasmiamimethod`));
  const zip = Buffer.from(buildTrainingBundle(data, NOW));
  assert.ok(zip.includes(Buffer.from("encoded-device-unverified")));
  assert.ok(zip.includes(Buffer.from(session.revision)));
});

test("a stale approval, an unapproved edit, a completed or cancelled workout is not actionable on email or Telegram", () => {
  const approvedRevision = make().revision;
  const edited = make([...steps.slice(0, 1), step({ zone: "z4", seconds: 360 }), ...steps.slice(2)]);
  assert.notEqual(edited.revision, approvedRevision);
  const can = (session: CanonicalSession, workout = row(), confirmed: string | null = approvedRevision) => [manualEmailActionable(session, workout, confirmed), telegramWorkoutActionable(session, workout, confirmed, NOW)];
  assert.deepEqual(can(make()), [true, true]);
  assert.deepEqual(can(edited), [false, false]);                                  // approval was for the previous revision
  assert.deepEqual(can(make(), row(), null), [false, false]);                      // no approval evidence at all
  assert.deepEqual(can(make(), row({ approved: false })), [false, false]);
  assert.deepEqual(can(make(), row({ completed: true })), [false, false]);
  assert.deepEqual(can(make(), row({ feedbackStatus: "skipped" })), [false, false]);
  assert.deepEqual(can(make(), row({ planned: false })), [false, false]);
  assert.deepEqual(can({ ...make(), verdict: "blocked" as const }), [false, false]);
  assert.deepEqual(can({ ...make(), verdict: "rest" as const }), [false, false]);
  assert.deepEqual(telegramWorkoutAttachments({ ...make(), verdict: "blocked" as const }), []);  // nothing is even built for a held session
});

test("a revision change or cancellation after sending is detected, and the dedupe key never repeats an old revision", () => {
  const first = make(), edited = make([...steps.slice(0, 1), step({ zone: "z4", seconds: 360 }), ...steps.slice(2)]);
  const sent = { revision: first.revision, kind: "ready" };
  assert.equal(manualEmailChanged(sent, { revision: first.revision, kind: "ready" }), false);   // same revision: nothing to resend
  assert.equal(manualEmailChanged(sent, { revision: edited.revision, kind: "ready" }), true);   // new revision: a revised message
  assert.equal(manualEmailChanged(sent, { revision: "cancelled", kind: "cancelled" }), true);   // cancelled after sending: a cancellation
  assert.equal(manualEmailChanged(undefined, { revision: first.revision, kind: "ready" }), false);
  const key = (s: CanonicalSession) => manualEmailKey("athlete-a", s.id, s.revision, "ready:initial:en");
  assert.equal(key(first), key(make()));        // idempotent
  assert.notEqual(key(first), key(edited));
  assert.notEqual(manualEmailKey("athlete-b", first.id, first.revision, "ready:initial:en"), key(first));   // per-athlete
});

test("the email template never claims inbox, watch or device delivery", () => {
  for (const language of ["en", "es"] as const) for (const kind of ["ready", "revised", "held", "cancelled"] as const) {
    const m = manualWorkoutEmail({ language, kind, workoutSport: "run", dateLabel: "2026-10-20", revision: "abcdef12", workoutUrl: "https://app.example.invalid/daily?sessionId=w-1", settingsUrl: "https://app.example.invalid/s" } as any);
    const all = `${m.subject}\n${m.text}`;
    assert.doesNotMatch(all, /\b(delivered|entregado) (to|en) (your |tu )?(watch|reloj|garmin|device|dispositivo)\b/i);
    assert.doesNotMatch(all, /\b(synced|sincronizado) (to|con|en) (your |tu )?(watch|reloj)\b/i);
  }
});

// ------------------------------------------------------------------------------- Telegram, against a mock fetch
const env = { ENABLE_TELEGRAM_COACHING: "true", ENABLE_AUTOMATED_DELIVERY: "true", COACHING_TRANSPORT: "telegram", TELEGRAM_BOT_TOKEN: "TEST-ONLY-NOT-A-SECRET", TELEGRAM_COACHING_WEBHOOK_SECRET: "t".repeat(40) };
function mockTelegram(plan: Array<"ok" | "rejected" | "garbled" | "throw"> = []) {
  const calls: { method: string; body: unknown }[] = [];
  let next = 100;
  const fetcher = (async (url: string, init: RequestInit) => {
    const method = String(url).split("/").pop()!;
    calls.push({ method, body: init.body });
    const mode = plan[calls.length - 1] ?? "ok";
    if (mode === "throw") throw new Error(`network down for ${url}`);                 // would leak the token if surfaced
    if (mode === "garbled") return new Response("<html>nope</html>", { status: 502 });
    if (mode === "rejected") return Response.json({ ok: false, error_code: 400, description: `Bad Request: chat ${env.TELEGRAM_BOT_TOKEN}` }, { status: 400 });
    return Response.json({ ok: true, result: { message_id: next++, chat: { id: 555111 } } });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

test("Telegram (mock): text, FIT document and PNG chart go out as three separate accepted parts with receipts", async () => {
  const mock = mockTelegram();
  const attachments = telegramWorkoutAttachments(make());
  assert.deepEqual(attachments.map(a => a.kind), ["fit", "graphic"]);
  const result = await sendTelegramCoaching("555111", "Today's approved workout. Review it in the app before training.", { fetcher: mock.fetcher, env, attachments });
  assert.equal(result.status, "sent");
  assert.deepEqual(mock.calls.map(c => c.method), ["sendMessage", "sendDocument", "sendPhoto"]);
  assert.deepEqual(result.parts!.map(p => [p.kind, p.status]), [["text", "sent"], ["fit", "sent"], ["graphic", "sent"]]);
  assert.ok(result.parts!.every(p => /^telegram:\d+$/.test(p.receiptId ?? "")));
  const doc = (mock.calls[1].body as FormData).get("document") as File;
  assert.match(doc.name, /\.fit$/);
  assert.equal(identity(decodeFit(new Uint8Array(await doc.arrayBuffer())).workoutMesgs[0].wktName), identity(fitWorkoutName(make())));
  assert.equal(((mock.calls[2].body as FormData).get("photo") as File).type, "image/png");
});

test("Telegram (mock): a failure or an ambiguous answer on any part stops the bundle and is never auto-retried; no secret is returned", async () => {
  const attachments = telegramWorkoutAttachments(make());
  for (const [plan, expectedStatus, expectedCalls] of [[["ok", "rejected"], "partial", 2], [["ok", "ok", "garbled"], "unknown", 3], [["throw"], "unknown", 1], [["rejected"], "failed", 1]] as const) {
    const mock = mockTelegram([...plan]);
    const result = await sendTelegramCoaching("555111", "Approved workout", { fetcher: mock.fetcher, env, attachments });
    assert.equal(result.status, expectedStatus, JSON.stringify(plan));
    assert.equal(mock.calls.length, expectedCalls, "no automatic resend of an accepted or ambiguous part");
    assert.doesNotMatch(JSON.stringify(result), /TEST-ONLY-NOT-A-SECRET|network down|Bad Request/);
  }
});

test("Telegram (mock): the pre-send guard blocks every request when the approval or revision changed", async () => {
  const mock = mockTelegram();
  const result = await sendTelegramCoaching("555111", "Approved workout", { fetcher: mock.fetcher, env, attachments: telegramWorkoutAttachments(make()), beforeSend: async () => { throw new Error("revision changed"); } });
  assert.equal(result.status, "failed");
  assert.equal(mock.calls.length, 0);
});

test("Telegram (mock): disabled configuration, a group chat id, or oversized/invalid attachments send nothing", async () => {
  const mock = mockTelegram();
  const off = await sendTelegramCoaching("555111", "x", { fetcher: mock.fetcher, env: { ...env, ENABLE_TELEGRAM_COACHING: "false" } });
  const group = await sendTelegramCoaching("-100123", "x", { fetcher: mock.fetcher, env });
  const huge: TelegramWorkoutAttachment = { kind: "fit", bytes: new Uint8Array(5_000_001), filename: "w.fit", caption: "c" };
  const big = await sendTelegramCoaching("555111", "x", { fetcher: mock.fetcher, env, attachments: [huge] });
  const badName = await sendTelegramCoaching("555111", "x", { fetcher: mock.fetcher, env, attachments: [{ ...huge, bytes: new Uint8Array(10), filename: "../w.fit" }] });
  assert.deepEqual([off.status, group.status, big.status, badName.status], ["failed", "failed", "failed", "failed"]);
  assert.equal(mock.calls.length, 0);
});
