import test from "node:test";
import assert from "node:assert/strict";
import { Decoder, Stream } from "@garmin/fitsdk";
import { canonicalSession, normalizeSteps, requireSessionRevision, fitFilename, FIT_STEP_LIMIT, SPORTS, type CanonicalSession } from "./canonical-session";
import { buildFitWorkout, fitWorkoutName, workoutToFitSpec } from "./fit-export";
import { effectiveSessionFromRecords } from "./effective-prescription";
import { evidencedTargetProfile } from "./anchor-evidence";

const now = new Date("2026-10-02T12:00:00Z");
const step = (extra: Record<string, any> = {}) => ({ name: "Work", seconds: 60, phase: "active", zone: "z2", ...extra });
const make = (sport = "run", steps: any[] = [step()], profile: any = {}, extras: Record<string, any> = {}) => canonicalSession({
  athleteId: "athlete-a", workout: { id: "workout-a", userId: "athlete-a", sport, title: "Workout 🏁", durationMin: 1, ...extras },
  prescription: { sport, durationMin: steps.reduce((n, s) => n + (s.seconds || 0), 0) / 60 || 1, verdict: "full", steps },
  profile, dateLocal: "2026-10-02", timezone: "UTC",
});
function decode(session: CanonicalSession) {
  const bytes = buildFitWorkout(session, now);
  const decoder = new Decoder(Stream.fromByteArray(bytes));
  assert.equal(decoder.checkIntegrity(), true);
  const { messages, errors } = decoder.read();
  assert.deepEqual(errors, []);
  const m = messages as any;
  assert.equal(m.fileIdMesgs[0].type, "workout");
  assert.equal(m.workoutMesgs[0].wktName, fitWorkoutName(session));
  assert.equal(m.workoutMesgs[0].numValidSteps, session.steps.length);
  assert.equal(m.workoutMesgs[0].sport, session.capability.fitSport);
  assert.equal(m.workoutMesgs[0].subSport, "generic");
  assert.deepEqual(m.workoutStepMesgs.map((s: any) => s.messageIndex), session.steps.map((_, i) => i));
  return m;
}
const answers = { sleep: 3, soreness: 3, motivation: 3, energy: 3, stress: 3, sick: false, newPain: false, urgentSymptoms: false, availableMin: 60 };
const record = (extra: Record<string, any> = {}) => ({ planning: { ready: true, missing: [], review: [], ruleId: "fixture" }, userId: "athlete-a", timezone: "UTC", now,
  workout: { id: "workout-a", userId: "athlete-a", date: new Date("2026-10-02T00:00:00Z"), title: "Bike", sport: "bike", durationMin: 1, intensity: "z2", type: "endurance", prescription: JSON.stringify({ sport: "bike", verdict: "full", durationMin: 1, steps: [step()] }) },
  profile: { ftp: 200 }, checkin: { date: new Date("2026-10-02T00:00:00Z"), answers: JSON.stringify(answers), adaptation: JSON.stringify({ verdict: "full", intensityCap: "z7", durationFactor: 1 }) }, ...extra });

test("FIT run pace bounds invert to speed, distance stays distance and lap stays open", () => {
  const c = make("run", [step({ endpoint: { type: "distance", meters: 1609.344 }, target: { type: "pace", low: 240, high: 300 } }), step({ name: "Lap recovery", seconds: undefined, phase: "recovery", endpoint: { type: "lap" }, target: { type: "open" } })]);
  const m = decode(c), [s, lap] = m.workoutStepMesgs;
  assert.equal(s.durationType, "distance"); assert.equal(s.durationValue, 160934); assert.equal(s.durationDistance, 1609.34);
  assert.equal(s.targetType, "speed"); assert.equal(s.customTargetSpeedLow, 3.333); assert.equal(s.customTargetSpeedHigh, 4.167);
  assert.equal(s.targetValue, 0); assert.equal(s.durationTime, undefined);
  assert.equal(lap.durationType, "open"); assert.equal(lap.durationValue, 0);
  assert.equal(c.exactTimeSeconds, null);
});
test("FIT exact times, phases, notes and power raw fields use the shared FTP convention", () => {
  const c = make("bike", [step({ phase: "warmup", zone: "z1", seconds: 30 }), step({ zone: "z4", seconds: 90, note: "Stay seated", group: "Main" }), step({ phase: "cooldown", zone: "z1", seconds: 30 })], { ftp: 200 });
  const m = decode(c), steps = m.workoutStepMesgs;
  assert.equal(steps.reduce((n: number, s: any) => n + s.durationTime, 0), c.exactTimeSeconds);
  assert.equal(c.exactTimeSeconds, 150);
  assert.deepEqual(steps.map((s: any) => s.intensity), ["warmup", "active", "cooldown"]);
  assert.equal(steps[1].targetType, "power"); assert.equal(steps[1].customTargetValueLow, 1000); assert.equal(steps[1].customTargetValueHigh, 1210);
  assert.equal(c.steps[1].target.high, 210); assert.match(c.steps[1].target.label, /210 W/); assert.match(steps[1].notes, /Main.*Stay seated/);
});
test("explicit power and absolute HR use numeric custom fields", () => {
  const power = decode(make("bike", [step({ target: { type: "power", low: 190, high: 210 } })], { ftp: 300 }));
  assert.equal(power.workoutStepMesgs[0].customTargetPowerLow, 1190); assert.equal(power.workoutStepMesgs[0].customTargetPowerHigh, 1210);
  const hr = decode(make("run", [step({ target: { type: "heartRate", low: 140, high: 155 } })], { runPaceBase: 300 }));
  assert.equal(hr.workoutStepMesgs[0].targetType, "heartRate"); assert.equal(hr.workoutStepMesgs[0].customTargetValueLow, 240); assert.equal(hr.workoutStepMesgs[0].customTargetValueHigh, 255);
});
test("explicit speed fields round-trip metres per second", () => {
  const m = decode(make("run", [step({ target: { type: "speed", low: 2.5, high: 3.25 } })]));
  assert.equal(m.workoutStepMesgs[0].customTargetSpeedLow, 2.5); assert.equal(m.workoutStepMesgs[0].customTargetSpeedHigh, 3.25);
});
test("explicit open wins over FTP, LTHR and pace; absent benchmarks stay open", () => {
  for (const sport of ["run", "bike"]) {
    const c = make(sport, [step({ target: { type: "open" } })], { ftp: 250, lthr: 170, runPaceBase: 300 });
    const s = decode(c).workoutStepMesgs[0]; assert.equal(s.targetType, "open"); assert.equal(s.customTargetValueHigh, undefined); assert.equal(c.steps[0].target.source, "explicit");
    const missing = make(sport); assert.equal(missing.steps[0].target.type, "open"); assert.ok(missing.steps[0].target.missingReason);
  }
});
test("derived pace display changes units without changing encoded speed", () => {
  const metric = make("run", [step()], { runPaceBase: 300, units: "metric" });
  const imperial = make("run", [step()], { runPaceBase: 300, units: "imperial" });
  assert.match(metric.steps[0].target.label, /6:00\/km/); assert.match(imperial.steps[0].target.label, /9:39\/mi/);
  assert.equal(decode(metric).workoutStepMesgs[0].customTargetSpeedLow, decode(imperial).workoutStepMesgs[0].customTargetSpeedLow);
});
test("every sport has honest explicit export scope; rest never gets a workout", () => {
  for (const sport of SPORTS) {
    const c = make(sport, [step({ target: { type: "open" } })]);
    assert.equal(c.capability.deviceTested, false);
    if (["swim", "strength", "hyrox", "brick"].includes(sport)) { assert.equal(c.capability.available, false); assert.throws(() => buildFitWorkout(c)); }
    else { assert.equal(c.capability.mode, ["run", "bike"].includes(sport) ? "native" : "generic"); decode(c); }
  }
});
test("boxing rounds and recoveries are exact generic timed steps, never boxing-native claims", () => {
  const c = make("boxing", [step({ name: "Round 1", seconds: 180 }), step({ name: "Rest", seconds: 60, phase: "recovery", zone: "z1" }), step({ name: "Round 2", seconds: 180 })], { ftp: 250, lthr: 170 });
  const m = decode(c); assert.equal(m.workoutMesgs[0].sport, "generic"); assert.deepEqual(m.workoutStepMesgs.map((s: any) => s.durationTime), [180, 60, 180]); assert.ok(m.workoutStepMesgs.every((s: any) => s.targetType === "open"));
});
test("pool metres/yards retain real distance but pool/send-off and open-water export are gated", () => {
  for (const meters of [25, 22.86]) {
    const c = make("swim", [step({ endpoint: { type: "distance", meters }, note: "Explicit pool length; rest after touch" })]);
    assert.equal(c.steps[0].endpoint.type, "distance"); assert.equal((c.steps[0].endpoint as any).meters, meters); assert.equal(c.capability.available, false);
  }
});
test("individual strength reps/rest survive canonical validation without fabricated native support", () => {
  const c = make("strength", [step({ name: "Squat set 1", reps: 5, seconds: 20 }), step({ name: "Rest", phase: "recovery", seconds: 120 })]);
  assert.deepEqual(c.steps[0].endpoint, { type: "reps", reps: 5 }); assert.equal(c.steps[0].seconds, 20); assert.equal(c.exactTimeSeconds, null); assert.equal(c.capability.available, false);
});
test("repeat blocks expand in exact order and keep group semantics", () => {
  const steps = normalizeSteps([{ repeat: 3, group: "Three sets", steps: [step({ name: "Work", seconds: 30 }), step({ name: "Rest", phase: "recovery", seconds: 15 })] }], "bike");
  assert.deepEqual(steps.map(s => s.name), ["Work", "Rest", "Work", "Rest", "Work", "Rest"]); assert.ok(steps.every(s => s.group === "Three sets"));
  const c = make("bike", steps.map(s => ({ ...s, target: { type: "open" } }))); assert.deepEqual(decode(c).workoutStepMesgs.map((s: any) => s.durationTime), [30, 15, 30, 15, 30, 15]);
});
test("conservative step limit is explicit and never truncates", () => {
  const good = make("bike", Array.from({ length: FIT_STEP_LIMIT }, () => step())); decode(good);
  const over = make("bike", Array.from({ length: FIT_STEP_LIMIT + 1 }, () => step())); assert.equal(over.steps.length, 51); assert.equal(over.capability.available, false); assert.throws(() => buildFitWorkout(over), /50/);
  assert.throws(() => normalizeSteps([{ repeat: 10000, steps: [step()] }], "run"), /repeat count/);
});
test("malformed numbers, endpoints, phases and targets fail closed", () => {
  const invalid = [step({ seconds: -1 }), step({ seconds: 0 }), step({ seconds: NaN }), step({ seconds: Infinity }), step({ reps: 1.5 }), step({ phase: "unknown" }), step({ zone: "banana" }), step({ endpoint: { type: "distance", meters: 0 } }), step({ target: { type: "power", low: 200, high: 100 } }), step({ target: { type: "open", high: 100 } }), step({ target: { type: "watts", low: 100, high: 200 } }), step({ target: { type: "speed", low: -1, high: 3 } }), step({ endpoint: { type: "lap" }, reps: 5 })];
  for (const bad of invalid) { const c = make("run", [bad]); assert.equal(c.verdict, "blocked", JSON.stringify(bad)); assert.deepEqual(c.steps, []); assert.throws(() => buildFitWorkout(c)); }
  assert.throws(() => make("other"), /Unsupported/);
});
test("missing, malformed, empty and saved rest prescriptions are never reconstructed", () => {
  for (const prescription of [null, "{", "{}", JSON.stringify({ steps: [] }), JSON.stringify({ verdict: "rest", steps: [step()] })]) {
    const c = workoutToFitSpec({ title: "Unsafe fallback", sport: "run", durationMin: 1, prescription, originalPlan: JSON.stringify({ steps: [step()] }) });
    assert.notEqual(c.verdict, "ready"); assert.deepEqual(c.steps, []); assert.throws(() => buildFitWorkout(c));
  }
});
test("revision changes with same-length edits, anchors, safety and athlete identity", () => {
  const a = make("bike", [step({ name: "AB" })], { ftp: 200 });
  for (const b of [make("bike", [step({ name: "CD" })], { ftp: 200 }), make("bike", [step({ name: "AB" })], { ftp: 201 }), make("bike", [step({ name: "AB" })], { ftp: 200, injured: true })]) { assert.notEqual(a.revision, b.revision); assert.throws(() => requireSessionRevision(b, a.revision), /changed/); }
  assert.ok(Number.isSafeInteger(a.revisionNumber)); requireSessionRevision(a, a.revision);
  assert.throws(() => canonicalSession({ athleteId: "athlete-b", workout: { id: "a", userId: "athlete-a", sport: "run", title: "Private", durationMin: 1 }, prescription: { steps: [step()] }, dateLocal: "2026-10-02", timezone: "UTC" }), /belong/);
});
test("identity prefix avoids first-15-character collisions and filenames are safe", () => {
  const a = make("run", [step()], {}, { title: "🏁 漢字 / 💨 " + "Long title ".repeat(30), id: "a" });
  const b = make("run", [step()], {}, { title: a.title, id: "b" });
  assert.notEqual(fitWorkoutName(a).slice(0, 15), fitWorkoutName(b).slice(0, 15)); assert.ok(Buffer.byteLength(fitWorkoutName(a)) <= 80);
  assert.match(fitFilename(a), /^2026-10-02-run-[a-z0-9-]+\.fit$/); assert.ok(!fitFilename(a).includes("/")); decode(a);
});
test("long notes remain intact on the canonical session and FIT discloses truncation", () => {
  const note = "技術 cue ".repeat(100);
  const c = make("run", [step({ note })]); assert.equal(c.steps[0].note, note); const notes = decode(c).workoutStepMesgs[0].notes; assert.match(notes, /Truncated; full guidance in JMM/); assert.ok(Buffer.byteLength(notes) <= 240);
});
test("effective session demands current explicit check-in and validated adaptation", () => {
  const good = effectiveSessionFromRecords(record()); assert.equal(good.canonical.verdict, "ready");
  for (const input of [record({ checkin: null }), record({ checkin: { ...record().checkin, answers: "{}" } }), record({ checkin: { ...record().checkin, adaptation: "{}" } }), record({ checkin: { ...record().checkin, date: new Date("2026-10-01") } }), record({ now: new Date("2026-10-03T12:00:00Z") })]) {
    const r = effectiveSessionFromRecords(input); assert.notEqual(r.canonical.verdict, "ready"); assert.deepEqual(r.prescription.steps, []); assert.equal(r.prescription.durationMin, 0);
  }
});
test("injury/day off/zero, saved rest and newly reported illness override old steps", () => {
  const base = record();
  const cases = [record({ profile: { injured: true } }), record({ workout: { ...base.workout, planDay: { dayOff: true } } }), record({ workout: { ...base.workout, durationMin: 0 } }), record({ workout: { ...base.workout, prescription: JSON.stringify({ verdict: "rest", steps: [step()] }) } }), record({ checkin: { ...base.checkin, answers: JSON.stringify({ ...answers, sick: true }) } })];
  for (const input of cases) { const r = effectiveSessionFromRecords(input); assert.equal(r.canonical.verdict, "rest"); assert.deepEqual(r.prescription.steps, []); assert.throws(() => buildFitWorkout(r.canonical)); }
});
test("updated readiness cap cannot be bypassed by a stale saved high-intensity prescription", () => {
  const base = record();
  const r = effectiveSessionFromRecords(record({ workout: { ...base.workout, prescription: JSON.stringify({ durationMin: 1, steps: [step({ zone: "z5" })] }) }, checkin: { ...base.checkin, adaptation: JSON.stringify({ verdict: "easy", durationFactor: .6, intensityCap: "z2" }) } }));
  assert.equal(r.canonical.verdict, "blocked"); assert.match(r.canonical.reason, /intensity\/time/);
});


test("nested repeat cannot hide high-intensity steps from current safety cap", () => {
  const base = record();
  const result = effectiveSessionFromRecords(record({ workout: { ...base.workout, prescription: JSON.stringify({ durationMin: 1, steps: [{ repeat: 2, steps: [step({ seconds: 30, zone: "z5" })] }] }) }, checkin: { ...base.checkin, adaptation: JSON.stringify({ verdict: "easy", durationFactor: .6, intensityCap: "z2" }) } }));
  assert.equal(result.canonical.verdict, "blocked"); assert.deepEqual(result.canonical.steps, []); assert.match(result.canonical.reason, /Expanded steps/);
});
test("missing eligibility/setup evidence blocks an otherwise clear workout", () => {
  const result = effectiveSessionFromRecords(record({ planning: undefined })); assert.equal(result.canonical.verdict, "blocked"); assert.match(result.canonical.reason, /athlete setup/);
});


test("live numeric anchors require recent dated matching and explicitly applied evidence", () => {
  const profile = { ftp: 250, runPaceBase: 318, lthr: 170 };
  const ftp = { id: "ftp-test", type: "ftp", date: new Date("2026-10-01"), result: 250, skipped: false, completed: true };
  const run = { ...ftp, id: "run-test", type: "run5k", result: 1500 };
  assert.equal(evidencedTargetProfile(profile, [ftp, run], [ftp.id, run.id], now).ftp, 250);
  assert.equal(evidencedTargetProfile(profile, [ftp, run], [ftp.id, run.id], now).runPaceBase, 318);
  assert.equal(evidencedTargetProfile(profile, [ftp], [], now).ftp, null);
  assert.equal(evidencedTargetProfile({ ftp: 251 }, [ftp], [ftp.id], now).ftp, null);
  for (const bad of [{ ...ftp, completed: false }, { ...ftp, skipped: true }, { ...ftp, date: new Date("2025-10-01") }, { ...ftp, date: new Date("2026-10-03") }]) assert.equal(evidencedTargetProfile(profile, [bad], [bad.id], now).ftp, null);
  assert.equal(evidencedTargetProfile(profile, [ftp], [ftp.id], now).lthr, null, "sport-unspecified LTHR is not an exact run/bike anchor");
});
test("fueling context changes invalidate the shared content revision", () => {
  const a = make("run", [step()], { weightKg: 60, sweatRateMlH: 500, gutTrained: false });
  const b = make("run", [step()], { weightKg: 61, sweatRateMlH: 500, gutTrained: false });
  assert.notEqual(a.revision, b.revision);
});


test("saved low-zone volume and explicit targets cannot bypass a readiness reduction", () => {
  const base = record();
  const reduced = { ...base.checkin, adaptation: JSON.stringify({ verdict: "easy", durationFactor: .6, intensityCap: "z2" }) };
  const volume = effectiveSessionFromRecords(record({ workout: { ...base.workout, durationMin: 10, prescription: JSON.stringify({durationMin:10,steps:[step({seconds:600})]}), originalPlan: JSON.stringify({ durationMin: 10 }) }, checkin: reduced }));
  assert.equal(volume.canonical.verdict, "blocked");
  const numeric = effectiveSessionFromRecords(record({ workout: { ...base.workout, prescription: JSON.stringify({ durationMin: 1, steps: [step({ zone: "z1", target: { type: "power", low: 200, high: 300 } })] }) }, checkin: reduced }));
  assert.equal(numeric.canonical.verdict, "blocked");
});


test("existing easy mobility substitution for paused strength stays explicit and faithful", () => {
  const session = canonicalSession({ athleteId: "athlete-a", workout: {id:"sub",userId:"athlete-a",title:"Paused strength",sport:"strength",durationMin:1}, prescription:{sport:"mobility",durationMin:1,verdict:"easy",steps:[step({zone:"z1",target:{type:"open"}})]}, dateLocal:"2026-10-02",timezone:"UTC" });
  assert.equal(session.verdict,"ready");assert.equal(session.sport,"mobility");assert.equal(session.capability.mode,"generic");decode(session);
});


test("read/export does not regenerate a missing prescription or spend the daily budget again", () => {
  const base = record();
  const r = effectiveSessionFromRecords(record({ workout: { ...base.workout, prescription: null } }));
  assert.equal(r.canonical.verdict, "blocked");assert.deepEqual(r.canonical.steps, []);
  const capped = effectiveSessionFromRecords(record({maxDailyMinutes: .5})); assert.equal(capped.canonical.verdict, "blocked");
});

test("real content revision changes after an actual feedback correction and rejects the prior SHA", () => {
  const base = record();
  const initial = effectiveSessionFromRecords(base);
  const corrected = effectiveSessionFromRecords(record({ workout: { ...base.workout, feedbackStatus: "partial", feedbackAt: new Date("2026-10-02T11:00:00Z"), actualDurationMin: 15, actualSport: "bike", actualDetails: JSON.stringify({ values: { distanceKm: 5 }, enteredAt: "2026-10-02T11:00:00Z" }), rpe: 6 } }));
  assert.notEqual(initial.canonical.revision, corrected.canonical.revision);
  assert.throws(() => requireSessionRevision(corrected.canonical, initial.canonical.revision), /changed/);
  const later = effectiveSessionFromRecords(record({ workout: { ...base.workout, feedbackStatus: "partial", feedbackAt: new Date("2026-10-02T11:05:00Z"), actualDurationMin: 25, actualSport: "run", rpe: 7 } }));
  assert.notEqual(later.canonical.revision, corrected.canonical.revision);
});
test("new same-day activity immediately holds other sessions until check-in reassessment", () => {
  const base = record();
  const checkin = { ...base.checkin, answers: JSON.stringify({ ...answers, inputMetadata: { recordedAt: "2026-10-02T09:00:00Z" } }) };
  const initial = effectiveSessionFromRecords(record({ checkin, reportedActivity: [] }));
  assert.equal(initial.canonical.verdict, "ready");
  const actual = { id: "manual-other", userId: "athlete-a", date: new Date("2026-10-02"), createdAt: new Date("2026-10-02T10:00:00Z"), feedbackAt: new Date("2026-10-02T10:00:00Z"), feedbackStatus: "completed", completed: true, planned: false, actualDurationMin: 40, actualSport: "run", rpe: 7 };
  const held = effectiveSessionFromRecords(record({ checkin, reportedActivity: [actual] }));
  assert.equal(held.canonical.verdict, "blocked"); assert.deepEqual(held.canonical.steps, []); assert.match(held.canonical.reason, /after this check-in/);
  assert.notEqual(initial.canonical.revision, held.canonical.revision);
  assert.throws(() => requireSessionRevision(held.canonical, initial.canonical.revision), /changed/);
  assert.throws(() => buildFitWorkout(held.canonical), /Update today's check-in/);
  const reviewed = effectiveSessionFromRecords(record({ checkin: { ...checkin, answers: JSON.stringify({ ...answers, inputMetadata: { recordedAt: "2026-10-02T11:00:00Z" } }) }, reportedActivity: [actual] }));
  assert.equal(reviewed.canonical.verdict, "ready");
  const corrected = effectiveSessionFromRecords(record({ checkin: { ...checkin, answers: JSON.stringify({ ...answers, inputMetadata: { recordedAt: "2026-10-02T11:00:00Z" } }) }, reportedActivity: [{ ...actual, feedbackAt: new Date("2026-10-02T11:30:00Z"), actualDurationMin: 55 }] }));
  assert.equal(corrected.canonical.verdict, "blocked"); assert.notEqual(reviewed.canonical.revision, corrected.canonical.revision);
});
test("unknown actuals and unverified check-in timestamps do not bypass the activity hold", () => {
  const actual = { id: "unknown-activity", userId: "athlete-a", date: new Date("2026-10-02"), feedbackAt: new Date("2026-10-02T10:00:00Z"), feedbackStatus: "unknown", actualDurationMin: null, rpe: null };
  assert.equal(effectiveSessionFromRecords(record({ reportedActivity: [actual] })).canonical.verdict, "blocked");
  const isolated = effectiveSessionFromRecords(record({ reportedActivity: [{ ...actual, userId: "athlete-b" }] }));
  assert.equal(isolated.canonical.verdict, "ready");
  assert.equal(isolated.canonical.revision, effectiveSessionFromRecords(record()).canonical.revision);
});
