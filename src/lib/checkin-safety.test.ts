import assert from "node:assert/strict";
import { test } from "node:test";
import { adaptSession } from "./adaptive";
import { resolveCheckinSafety, optionalCheckinNumber, optionalCheckinBoolean, checkinSyncFreshness } from "./checkin-safety";
import { parseCheckinTranscript } from "./voice-parse";

const clear = { sleep: 5, soreness: 1, motivation: 5, energy: 5, stress: 1, sick: false, newPain: false, urgentSymptoms: false, availableMin: 45 };
test("untouched and partial answers never produce green readiness or a workout", () => {
  for (const input of [{}, { ...clear, sleep: undefined }, { ...clear, sick: undefined }, { ...clear, newPain: undefined }, { ...clear, urgentSymptoms: undefined }, { ...clear, availableMin: undefined }]) {
    const a = adaptSession(input);
    assert.equal(a.verdict, "rest"); assert.equal(a.durationFactor, 0); assert.equal(a.scoreAvailable, false); assert.equal(a.safetyStatus, "unknown");
  }
});
test("confirmed device-free self-report needs no HRV, resting pulse or anchors", () => {
  assert.equal(resolveCheckinSafety(clear).status, "clear");
  assert.equal(adaptSession(clear).verdict, "full");
});
test("current urgent symptoms override high recovery and pain", () => {
  const a = adaptSession({ ...clear, urgentSymptoms: true, newPain: true });
  assert.equal(a.safetyStatus, "urgent"); assert.equal(a.durationFactor, 0); assert.equal(a.scoreAvailable, false);
  assert.match(a.message, /Stop exercise/); assert.match(a.message, /emergency/); assert.doesNotMatch(a.message, /flush|Z1-Z2|2-3 days/);
});
test("new focal pain, movement pain and illness hold training without diagnosis", () => {
  for (const symptoms of [{ sick: true }, { newPain: true }, { painAffectsMovement: true }]) {
    const a = adaptSession({ ...clear, ...symptoms });
    assert.equal(a.safetyStatus, "hold"); assert.equal(a.verdict, "rest"); assert.equal(a.durationFactor, 0); assert.match(a.message, /cannot diagnose/);
  }
});
test("reported numbers are not fabricated from booleans, arrays or implausible values", () => {
  for (const bad of [true, [], {}, " ", NaN, Infinity, -1, 6, "3x"]) assert.throws(() => optionalCheckinNumber(bad, "sleep", 1, 5, true));
  for (const unknown of [undefined, null, "", "unknown", "prefer-not"]) assert.equal(optionalCheckinNumber(unknown, "sleep", 1, 5, true), undefined);
  assert.equal(optionalCheckinNumber("3", "sleep", 1, 5, true), 3);
  for (const bad of ["false", 0, 1, [], {}]) assert.throws(() => optionalCheckinBoolean(bad, "sick"));
});
test("voice extracts English and Spanish words, numbers and explicit units", () => {
  const en = parseCheckinTranscript("sleep quality four, soreness two, energy three, motivation five, stress one, weight seventy four point two kilograms, resting heart rate forty eight, HRV sixty two, sleep hours seven point five, available minutes forty five");
  assert.equal(en.sleep, 4); assert.equal(en.soreness, 2); assert.equal(en.energy, 3); assert.equal(en.weightKg, 74.2); assert.equal(en.rhr, 48); assert.equal(en.hrv, 62); assert.equal(en.sleepHours, 7.5); assert.equal(en.availableMinutes, 45);
  const es = parseCheckinTranscript("sueño cuatro, agujetas dos, energía tres, motivación cinco, estrés uno, peso setenta y cuatro punto dos kilos, pulso en reposo cuarenta y ocho, VFC sesenta y dos, dormí siete punto cinco horas, minutos disponibles cuarenta y cinco", "es");
  assert.equal(es.sleep, 4); assert.equal(es.soreness, 2); assert.equal(es.energy, 3); assert.equal(es.weightKg, 74.2); assert.equal(es.rhr, 48); assert.equal(es.hrv, 62); assert.equal(es.sleepHours, 7.5); assert.equal(es.availableMinutes, 45);
});
test("voice absence is unknown and never overwrites a confirmed negative", () => {
  const parsed = parseCheckinTranscript("sleep four");
  assert.equal(parsed.sick, undefined); assert.equal(parsed.newPain, undefined); assert.equal(parsed.urgentSymptoms, undefined); assert.equal(parsed.menstrual, undefined);
});
test("voice local negation cannot mask a later symptom or contradiction", () => {
  for (const [text, language] of [["not sick but I have fever", "en"], ["no estoy enfermo pero tengo fiebre", "es"], ["no pain and fever", "en"], ["sin dolor y fiebre", "es"]]) {
    assert.equal(parseCheckinTranscript(text, language).sick, true, text);
  }
  assert.equal(parseCheckinTranscript("no pain").newPain, false);
  assert.equal(parseCheckinTranscript("no chest pain but I fainted").urgentSymptoms, true);
  assert.equal(parseCheckinTranscript("sin dolor de pecho pero desmayo", "es").urgentSymptoms, true);
  assert.equal(parseCheckinTranscript("not sick but fever").conflicts.includes("sick"), true);
  assert.equal(parseCheckinTranscript("no fever and no cough").sick, false);
});
test("voice contradictory scales, unsupported language and pounds fall back to review", () => {
  assert.equal(parseCheckinTranscript("energy two, energy five").energy, undefined);
  assert.ok(parseCheckinTranscript("energy two, energy five").conflicts.includes("energy"));
  assert.equal(parseCheckinTranscript("sleep four", "fr").supportedLanguage, false);
  assert.equal(parseCheckinTranscript("weight 150 pounds").weightKg, undefined);
  assert.equal(parseCheckinTranscript("weight 74").weightKg, undefined);
  assert.equal(parseCheckinTranscript("sleep six").sleep, undefined);
  assert.ok(parseCheckinTranscript("yesterday chest pain").warnings.length);
});
test("sync only reports recent verified per-provider completion", () => {
  const now = Date.now();
  const connected = [{ provider: "oura", status: "connected", lastSyncAt: new Date(now - 1000) }];
  assert.equal(checkinSyncFreshness([], null, false, now).freshness, "not-connected");
  assert.equal(checkinSyncFreshness(connected, [{ provider: "oura", ok: false, imported: 0 }], true, now).freshness, "failed");
  assert.equal(checkinSyncFreshness(connected, [{ provider: "oura", ok: true, imported: 0 }], true, now).freshness, "synced-now");
  const stale = [{ ...connected[0], lastSyncAt: new Date(now - 24 * 3600000) }];
  assert.equal(checkinSyncFreshness(stale, [{ provider: "oura", ok: true, imported: 0 }], true, now).freshness, "stale");
  assert.equal(checkinSyncFreshness(stale, null, true, now).freshness, "pending");
  assert.equal(checkinSyncFreshness([...connected, { provider: "whoop", status: "error", lastSyncAt: null }], [{ provider: "oura", ok: true, imported: 0 }, { provider: "whoop", ok: false, imported: 0 }], true, now).freshness, "failed");
});

test("zero available time produces true rest", () => {
  const a = adaptSession({ ...clear, availableMin: 0 });
  assert.equal(a.verdict, "rest"); assert.equal(a.durationFactor, 0); assert.match(a.message, /No workout/);
});
