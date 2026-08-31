// Run: npx tsx src/lib/adaptive.test.ts
import assert from "node:assert";
import {
  recoveryFor, RECOVERY_TECHNIQUES,
  temperatureAdjustment,
  scheduleTests,
  adaptSession,
  recommendFuel,
  recommendErgogenics, applySupplementFeedback, ERGOGENIC_LIBRARY,
  hydrationFromWeight,
  venueAdjustment,
} from "./adaptive";
import { generateHyroxPlan, HYROX_STATIONS } from "./science";

// --- recovery rotation: deterministic + varies daily ---
const d1 = recoveryFor(new Date("2026-08-26T00:00:00Z"));
const d2 = recoveryFor(new Date("2026-08-27T00:00:00Z"));
assert.notEqual(d1.dailyKey, d2.dailyKey, "technique should rotate daily");
assert.ok(RECOVERY_TECHNIQUES.some((t) => t.key === d1.dailyKey));
assert.ok(d1.cooldownNote.includes(d1.technique.name));
assert.ok(d1.weeklyTheme && d1.monthlyFocus);
// deterministic: same date → same technique
assert.equal(recoveryFor(new Date("2026-08-26T12:00:00Z")).dailyKey, d1.dailyKey);

// --- temperature adjustment monotonic in heat ---
const mild = temperatureAdjustment(15);
const hot = temperatureAdjustment(28);
const extreme = temperatureAdjustment(35);
assert.equal(mild.category, "mild");
assert.equal(mild.paceFactor, 1);
assert.equal(hot.category, "hot");
assert.ok(hot.paceFactor > mild.paceFactor, "hot should slow pace");
assert.ok(hot.volumeFactor < mild.volumeFactor, "hot should cut volume");
assert.ok(extreme.hydrationFactor > hot.hydrationFactor);

// --- test scheduling: ~every 2 months, skip near race, stop at block end ---
const races = [{ date: new Date("2026-10-04T08:00:00Z") }]; // race ~5.5 weeks out
const tests = scheduleTests(new Date("2026-08-26T00:00:00Z"), 12, races);
assert.ok(tests.length > 0, "should schedule some tests");
const ftp = tests.filter((t) => t.type === "ftp");
assert.ok(ftp.length >= 1 && ftp.length <= 3, `expected 1-3 FTP tests, got ${ftp.length}`);
assert.ok(tests.every((t) => !t.skipped || t.reason), "skipped tests carry a reason");
const nearRace = tests.find((t) => Math.abs(t.date.getTime() - races[0].date.getTime()) < 14 * 86400000);
if (nearRace) {
  assert.ok(nearRace.skipped, "test within 2 weeks of race must be skipped");
  assert.ok((nearRace.reason || "").startsWith("skipped"), "skipped tests carry the 'skipped' reason, not a note");
}
// no tests before start or after block end
const start = new Date("2026-08-26T00:00:00Z").getTime();
const end = start + 12 * 7 * 86400000;
assert.ok(tests.every((t) => t.date.getTime() >= start && t.date.getTime() <= end));

// --- questionnaire adaptation ---
const green = adaptSession({ sleep: 5, soreness: 1, motivation: 5, energy: 5, stress: 1, sick: false });
assert.equal(green.verdict, "full");
assert.equal(green.durationFactor, 1);
const trashed = adaptSession({ sleep: 1, soreness: 5, motivation: 1, energy: 1, stress: 5, sick: true });
assert.equal(trashed.verdict, "rest");
assert.equal(trashed.durationFactor, 0);
assert.ok(trashed.score < green.score, "rest score < green score");
const mid = adaptSession({ sleep: 3, soreness: 3, motivation: 3, energy: 3, stress: 3, sick: false });
assert.ok(mid.verdict === "trim" || mid.verdict === "easy");

// --- fuel ---
const short = recommendFuel({ durationMin: 30, intensity: "z2" });
assert.equal(short.carbsPerHourG, 0);
const long = recommendFuel({ durationMin: 120, intensity: "z4", heatFactor: 1.5 });
assert.equal(long.carbsPerHourG, 60);
assert.ok(long.fluidMlPerHour >= 750);
assert.ok(long.caffeineMg && long.caffeineMg > 0, "hard long session should recommend caffeine");

// --- ergogenics: opt-out respected ---
let prefs: import("./adaptive").SupplementPrefs = { enabled: true, likes: [], dislikes: [], optsOut: [] };
const rec = recommendErgogenics(prefs, { sport: "run", type: "interval", durationMin: 60, intensity: "z6" });
assert.ok(rec.recommended.some((e) => e.key === "caffeine"));
prefs = applySupplementFeedback(prefs, "caffeine", "stop");
const rec2 = recommendErgogenics(prefs, { sport: "run", type: "interval", durationMin: 60, intensity: "z6" });
assert.ok(!rec2.recommended.some((e) => e.key === "caffeine"), "opted-out caffeine must not reappear");
// master off
prefs = { enabled: false, likes: [], dislikes: [], optsOut: [] };
assert.equal(recommendErgogenics(prefs, { sport: "run", type: "interval", durationMin: 60, intensity: "z6" }).recommended.length, 0);
// library evidence grades are sane
assert.ok(ERGOGENIC_LIBRARY.every((e) => ["A", "B", "C"].includes(e.evidence)));

// --- weight → hydration ---
const ok = hydrationFromWeight(74, 73.6, 60, 500); // 0.4kg loss + 0.5L drunk
assert.equal(ok.status, "ok");
const severe = hydrationFromWeight(74, 71.0, 90, 0); // 3kg loss
assert.equal(severe.status, "severe");
assert.ok(severe.fluidToReplaceMl > 3000);
assert.ok(severe.sweatRateLPerH > 1.5);

// --- venue adjustment: terrain / elevation / water ---
const v = venueAdjustment({ targetTempC: 31, bikeTerrain: "hilly", bikeElevM: 900, runTerrain: "trail", runElevM: 400, swimVenue: "ocean", waterTempC: 20, swimCurrent: "strong" });
assert.equal(v.heat?.category, "extreme");
assert.ok(v.bike.detail.includes("Hilly"), "bike terrain detected");
assert.ok(v.bike.training.toLowerCase().includes("hill"), "bike training adjusts for hills");
assert.ok(v.run.detail.includes("Trail"), "run terrain detected");
assert.ok(v.swim.detail.includes("ocean") && v.swim.detail.includes("strong"), "ocean + current detected");
assert.equal(v.wetsuit.legal, true, "20°C → wetsuit mandatory");
assert.ok(v.overall.length > 20);
const warm = venueAdjustment({ swimVenue: "pool", waterTempC: 26 });
assert.equal(warm.wetsuit.legal, false, "26°C → wetsuit not permitted");
assert.equal(warm.swim.detail, "Pool swim — controlled conditions.");

// --- HYROX plan generator ---
assert.equal(HYROX_STATIONS.length, 8, "8 stations");
assert.equal(HYROX_STATIONS[0].name, "SkiErg");
assert.equal(HYROX_STATIONS[7].name, "Wall Balls");
const hy = generateHyroxPlan({ level: "amateur", weeks: 12, startDate: new Date("2026-08-26T00:00:00Z") });
assert.equal(hy.length, 12, "12 weeks generated");
assert.ok(hy.every((w) => w.sessions.length >= 4), "every week has a session slate (taper is lighter)");
// 6-week mesocycle: weeks 1-5 are base/build (full slate), week 6 is the
// taper + test week by design (run + strength + race sim + recovery = 4).
assert.ok(hy.slice(0, 5).every((w) => w.sessions.length >= 6), "base/build weeks are full");
assert.ok(hy[5].sessions.length >= 4, "week 6 taper is lighter but complete");
assert.ok(hy.some((w) => w.sessions.some((s) => s.sport === "hyrox")), "compromised running / race sim present");
assert.ok(hy.some((w) => w.sessions.some((s) => s.sport === "run")), "run sessions present");
assert.ok(hy.some((w) => w.sessions.some((s) => s.sport === "strength")), "station strength present");
// hyrox test scheduling: 1km TT + erg + strength, not triathlon ftp/swim
const ht = scheduleTests(new Date("2026-08-26T00:00:00Z"), 12, [{ date: new Date("2026-10-04T00:00:00Z") }], { hyrox: true });
assert.ok(ht.length > 0 && ht.every((t) => ["run1k", "erg", "strengthBench"].includes(t.type)), "hyrox tests use hyrox types");

console.log("✓ adaptive.test.ts — all assertions passed");
