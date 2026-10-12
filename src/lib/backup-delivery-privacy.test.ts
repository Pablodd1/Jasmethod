import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { Decoder, Stream } from "@garmin/fitsdk";
import { canonicalSession } from "./canonical-session";
import { buildPrivateSafeSessionDownload } from "./fit-export";
import { CYCLE_MOVEMENT_GUIDANCE } from "./cycle-movement-guidance";

const session = (note = "PRIVATE_MEDICAL_NOTE", group = "PRIVATE_CONTEXT") => canonicalSession({
  athleteId: "synthetic-athlete", workout: { id: "synthetic-session", sport: "bike", title: "PRIVATE_TITLE", durationMin: 1 },
  prescription: { sport: "bike", durationMin: 1, verdict: "full", steps: [{ name: "PRIVATE_STEP_LABEL", phase: "active", zone: "z2", seconds: 60, note, group, target: { type: "power", low: 100, high: 120 } }] },
  dateLocal: "2026-10-11", timezone: "UTC",
});
test("provider FIT decodes without private notes or group; preserves approved revision, endpoints and targets", () => {
  const source = session(); const original = JSON.stringify(source);
  const file = buildPrivateSafeSessionDownload(source, new Date("2026-10-11T10:00Z"));
  const decoder = new Decoder(Stream.fromByteArray(file.bytes)); assert.equal(decoder.checkIntegrity(), true);
  const decoded = decoder.read(); assert.deepEqual(decoded.errors, []);
  const messages = decoded.messages as any;
  assert.doesNotMatch(JSON.stringify(messages), /PRIVATE_/);
  assert.equal(messages.workoutStepMesgs[0].durationTime, 60);
  assert.equal(messages.workoutStepMesgs[0].customTargetValueLow, 1100);
  assert.equal(messages.workoutStepMesgs[0].customTargetValueHigh, 1120);
  assert.equal(JSON.stringify(source), original);
  assert.match(file.filename, /\.fit$/);
});
test("provider FIT keeps allowlisted safety guidance only and refuses split artifacts", () => {
  const source = session(CYCLE_MOVEMENT_GUIDANCE);
  const file = buildPrivateSafeSessionDownload(source);
  const decoded = new Decoder(Stream.fromByteArray(file.bytes)).read().messages as any;
  assert.match(decoded.workoutStepMesgs[0].notes, /Practice only familiar coach-reviewed/);
  assert.throws(() => buildPrivateSafeSessionDownload({ ...source, capability: { ...source.capability, mode: "split", downloadFormat: "zip" } }), /single FIT/);
  assert.throws(() => buildPrivateSafeSessionDownload({ ...source, verdict: "blocked" }));
});
function transportFixture(secure: boolean, sourcePath = "src/lib/manual-workout-email-transport.ts") {
  const state = { options: null as any, closed: false, messages: [] as any[] };
  const deps: Record<string, any> = {
    nodemailer: { createTransport: (options: any) => { state.options = options; return { sendMail: async (message: any) => { state.messages.push(message); return { accepted: [message.to], messageId: "synthetic-receipt" }; }, close: () => { state.closed = true; } }; } },
    "./db": { prisma: {} },
  };
  const compiled = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} as any };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; }, process: { env: { SMTP_HOST: "smtp.example.invalid", SMTP_FROM: "sender@example.invalid", SMTP_SECURE: String(secure) } } });
  return { state, send: mod.exports.sendManualEmail || mod.exports.sendEmail };
}
test("all workout SMTP transports require STARTTLS or implicit TLS", async () => {
  for (const path of ["src/lib/manual-workout-email-transport.ts", "src/lib/email.ts"]) for (const secure of [false, true]) {
    const { state, send } = transportFixture(secure, path);
    await send({ to: "synthetic@example.invalid", subject: "Synthetic", text: "Synthetic", html: "Synthetic" });
    assert.equal(state.options.secure, secure); assert.equal(state.options.requireTLS, !secure);
    assert.equal(state.options.tls?.rejectUnauthorized ?? true, true);
    assert.equal(state.messages.length, 1);
  }
});
test("email service calls privacy-safe builder at attachment boundary", () => {
  const source = fs.readFileSync("src/lib/manual-workout-email-service.ts", "utf8");
  assert.match(source, /buildPrivateSafeSessionDownload\(actionable\.canonical\)/);
  assert.doesNotMatch(source, /\bbuildSessionDownload\(/);
});

test("email reconciliation sends sanitized FIT through injected transport and aborts stale revisions", async () => {
  for (const changeBeforeSend of [false, true]) {
    const canonical = session(); const now = new Date("2026-10-11T10:00Z");
    const pref = { userId: "synthetic-athlete", user: { id: "synthetic-athlete", email: "synthetic@example.invalid", timezone: "UTC", language: "en" }, recipient: "synthetic@example.invalid", enabled: true, daily: true, revisions: true, timezone: "UTC", minuteOfDay: 0, leadMinutes: 30 };
    const row = { id: "synthetic-outbox", status: "queued", revision: canonical.revision, recipient: pref.recipient };
    const statuses: string[] = []; const sent: any[] = []; let resolves = 0;
    const prisma = {
      manualWorkoutEmailOutbox: { updateMany: async () => ({ count: 1 }), findMany: async () => [], upsert: async () => row, update: async (q: any) => { statuses.push(q.data.status); return {}; } },
      manualWorkoutEmailPreference: { findMany: async () => [pref], findUnique: async () => pref },
      user: { findUnique: async () => pref.user },
      workout: { findMany: async () => [{ id: canonical.id }] },
      manualWorkoutEmailDispatch: { upsert: async () => ({}), updateMany: async () => ({ count: 1 }) },
    };
    const deps: Record<string, any> = {
      "./manual-workout-email-locale": { manualEmailLanguage: () => "en" }, "./db": { prisma },
      "./canonical-session": { SessionResolutionError: class extends Error {} }, "./workout-update": {},
      "./dates": { dayBounds: () => ({ key: "2026-10-11", start: new Date("2026-10-11"), end: new Date("2026-10-12") }) },
      "./effective-prescription": {}, "./fit-export": { buildPrivateSafeSessionDownload },
      "./manual-workout-email-template": { manualWorkoutEmail: () => ({ subject: "Synthetic", text: "Synthetic", html: "Synthetic" }) },
      "./manual-workout-email-content": { manualWorkoutEmailContent: () => ({ plan: {}, graphic: null }) },
      "./manual-workout-email": { manualEmailConfigured: () => true, manualEmailOrigin: () => "https://example.invalid", eligibleManualEmail: () => true, manualEmailChanged: () => false, manualEmailDue: () => true, manualEmailKey: () => "synthetic-key" },
      "./manual-workout-email-transport": {},
    };
    const compiled = ts.transpileModule(fs.readFileSync("src/lib/manual-workout-email-service.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} as any }; vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => { assert.ok(id in deps, id); return deps[id]; }, Buffer, Date });
    const result = await mod.exports.reconcileManualWorkoutEmails(now, pref.userId, {
      resolve: async () => { resolves++; return { kind: "ready", revision: changeBeforeSend && resolves >= 3 ? "changed" : canonical.revision, resolved: { canonical, nutrition: null }, workout: { startTime: null } }; },
      send: async (message: any) => { sent.push(message); return { status: "accepted", receiptId: "synthetic-receipt" }; }, clock: () => now,
    });
    if (changeBeforeSend) { assert.equal(sent.length, 0); assert.equal(result.accepted, 0); assert.ok(statuses.includes("superseded")); }
    else {
      assert.equal(sent.length, 1); assert.equal(result.accepted, 1); assert.deepEqual(statuses, ["accepted"]);
      const decoder = new Decoder(Stream.fromByteArray(sent[0].attachments[0].content)); assert.equal(decoder.checkIntegrity(), true);
      assert.doesNotMatch(JSON.stringify(decoder.read().messages), /PRIVATE_/);
    }
  }
});

function hyroxSession(stationId: string) {
  const structure = { schemaVersion: 1, kind: "hyrox", steps: [
    { kind: "run", name: "R", zone: "z2", endpoint: { type: "distance", meters: 100 } },
    { kind: "station", name: "S", stationId, zone: "z2", endpoint: { type: "reps", reps: 20 }, load: { value: 6, unit: "kg" } },
  ] };
  return canonicalSession({ athleteId: "synthetic-athlete", workout: { id: "synthetic-hyrox", sport: "hyrox", title: "Private title", durationMin: 10 },
    prescription: { sport: "hyrox", durationMin: 10, verdict: "full", sportStructure: structure }, dateLocal: "2026-10-11", timezone: "UTC" });
}
test("private-safe HYROX FIT retains complete reps/LAP endpoint with a long station identity", () => {
  const source = hyroxSession("a".repeat(80)); assert.equal(source.capability.available, true);
  const file = buildPrivateSafeSessionDownload(source);
  const decoded = new Decoder(Stream.fromByteArray(file.bytes)).read(); assert.deepEqual(decoded.errors, []);
  const station = (decoded.messages as any).workoutStepMesgs[1];
  assert.equal(station.durationType, "open"); assert.match(station.notes, /Complete 20 reps, then press LAP\./);
  assert.match(station.notes, /load 6 kg/); assert.ok(station.notes.includes("a".repeat(80)));
});
test("private-safe FIT revalidates UTF-8 companion budget after relabeling and fails closed", () => {
  const source = hyroxSession("é".repeat(60)); assert.equal(source.capability.available, true);
  assert.throws(() => buildPrivateSafeSessionDownload(source), /safe FIT note limit/);
});
