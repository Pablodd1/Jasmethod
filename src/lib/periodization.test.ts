import test from "node:test";
import assert from "node:assert/strict";
import { goalFamily, resolvePhase, qualityFor, doseScale, repsFor, taperVolumeFactor, trainingIdeas, TAPER_DAYS } from "./periodization";
import { decidePerformance, selectStimulus, buildDensitySteps, type MetricRow, type LoadRow } from "./performance-engine";
import { buildCoachReply, extractLocalCandidates } from "./coach-conversation";

const NOW = new Date("2026-11-02T12:00:00Z");
const day = (n: number) => new Date(+NOW - n * 86400000);
const whoop: MetricRow[] = Array.from({ length: 60 }, (_, i) => 59 - i).map(n => ({ date: day(n), hrv: n < 7 ? 64 : 60 + ((n % 5) - 2) * 2, hrvType: "rmssd", restingHr: 50, sleepHours: 7.6, source: "whoop" }));
const easyLoad: LoadRow[] = Array.from({ length: 14 }, (_, i) => ({ date: day(27 - i * 2), sport: "bike", type: "endurance", intensity: "z2", rpe: 3, minutes: 60 }));
const good = { sleep: 5, soreness: 1, motivation: 5, energy: 5, stress: 1, mood: 5, sick: false, urgentSymptoms: false, newPain: false } as any;
const base = { verdict: "full", safetyStatus: "clear", score: 90, scoreAvailable: true };
const decide = (loadRows = easyLoad, quality?: any) => decidePerformance({ base, subjective: good, metrics: whoop, loadRows, pushEnabled: true, now: NOW, quality });

test("goal families and phases", () => {
  assert.equal(goalFamily("5k"), "short"); assert.equal(goalFamily("half"), "long"); assert.equal(goalFamily("full"), "ultra"); assert.equal(goalFamily("olympic"), "middle"); assert.equal(goalFamily("hyrox"), "hyrox");
  assert.equal(resolvePhase({ family: "long", daysToRace: 10 }), "taper");
  assert.equal(resolvePhase({ family: "short", daysToRace: 10 }), "specific", "short taper is 8 days");
  assert.equal(resolvePhase({ family: "long", daysToRace: 1 }), "race");
  assert.equal(resolvePhase({ family: "middle", coachingPhase: "foundation", daysToRace: 90 }), "base");
});

test("stimulus matches goal × phase: fast VO2 for short build, race pace for long specific, durability for ultra base", () => {
  const pick = (family: any, phase: any, availMin = 75, level: any = "advanced", daySeed = 0) => qualityFor({ family, phase, sport: "bike", level, availMin, daySeed }).kind;
  assert.equal(pick("short", "build"), "vo2");
  assert.equal(pick("long", "specific"), "race-pace");
  assert.equal(pick("ultra", "base", 150), "durability");
  assert.equal(pick("ultra", "base", 75), "sweetspot", "durability needs a long window");
  assert.equal(pick("middle", "taper"), "taper-primer");
  assert.equal(pick("short", "build", 75, "beginner"), "threshold", "beginners build threshold before VO2");
  assert.equal(pick("long", "build", 35), "threshold", "short window on long-course goal → dense threshold");
  assert.notEqual(pick("short", "build", 75, "advanced", 0), pick("short", "build", 75, "advanced", 1), "rotates between key sessions");
});

test("dose scales with level and progresses within phase; taper cuts volume not intensity", () => {
  assert.ok(doseScale({ level: "beginner", phase: "build" }) < doseScale({ level: "pro", phase: "build" }));
  assert.ok(doseScale({ level: "advanced", phase: "build", weekInPhase: 2 }) > doseScale({ level: "advanced", phase: "build", weekInPhase: 1 }));
  assert.ok(doseScale({ level: "advanced", phase: "taper" }) <= 0.5);
  for (const fam of ["short", "middle", "long", "ultra", "hyrox"] as const) {
    assert.equal(taperVolumeFactor(TAPER_DAYS[fam] + 1, fam), 1);
    const last = taperVolumeFactor(0, fam); assert.ok(last >= 0.4 && last <= 0.6, `Bosquet 41–60% cut (${fam})`);
  }
});

test("quality over quantity: beginner dose is smaller and the session ends early instead of padding", () => {
  const stim = (level: any) => ({ sport: "bike", kind: "threshold" as const, zone: "z4", reason: "", family: "middle" as const, reps: repsFor("threshold", doseScale({ level, phase: "build" })) });
  const beg = buildDensitySteps(stim("beginner"), 90)!, pro = buildDensitySteps(stim("pro"), 90)!;
  const work = (st: any[]) => st.filter(s => s.zone === "z4").length;
  assert.ok(work(beg) < work(pro));
  assert.ok(beg.reduce((a, s) => a + s.seconds, 0) < 90 * 60, "ends early rather than junk volume");
});

test("polarized guard: no back-to-back key days, weekly cap, no overload in taper", () => {
  const hardYesterday = [...easyLoad, { date: new Date(+NOW - 20 * 3600000), sport: "bike", type: "interval", intensity: "z5", rpe: 8, minutes: 60 }];
  assert.ok(decide(hardYesterday, { level: "advanced", phase: "build", plannedHard: true, nextDayKey: false }).pushBlockedBy.some(r => /back-to-back/.test(r)));
  const three = [...easyLoad, ...[6, 4, 2].map(d => ({ date: day(d), sport: "bike", type: "threshold", intensity: "z4", rpe: 7, minutes: 60 }))];
  assert.ok(decide(three, { level: "advanced", phase: "build", plannedHard: false, nextDayKey: false }).pushBlockedBy.some(r => /cap/.test(r)));
  assert.ok(decide(easyLoad, { level: "advanced", phase: "taper", plannedHard: true, nextDayKey: false }).pushBlockedBy.some(r => /taper/.test(r)));
  assert.ok(decide(easyLoad, { level: "advanced", phase: "build", plannedHard: false, nextDayKey: true }).pushBlockedBy.some(r => /tomorrow/.test(r)));
  assert.equal(decide(easyLoad, { level: "advanced", phase: "build", plannedHard: true, nextDayKey: false }).verdict, "push");
});

test("taper: a planned key session becomes a short race-pace primer, never a new stimulus", () => {
  const d = decide(easyLoad, { level: "advanced", phase: "taper", plannedHard: true, nextDayKey: false });
  const s = selectStimulus({ planned: { sport: "run", type: "interval", intensity: "z5", durationMin: 60 }, decision: d, availMin: 60, availableSports: ["run"], plan: { family: "middle", phase: "taper", level: "advanced", daySeed: 0 } });
  assert.equal(s.kind, "taper-primer");
  const steps = buildDensitySteps(s, 60)!;
  assert.ok(steps.reduce((a, x) => a + x.seconds, 0) < 60 * 60);
});

test("chat: brainstorm by goal/phase, explain today without personal data, equipment settings proposed not saved", () => {
  const ideas = buildCoachReply("training ideas for my 5k build phase", { localToday: "2026-11-02", language: "en" } as any);
  assert.equal(ideas.ruleId, "coach-conversation-v1:training-ideas"); assert.match(ideas.answer, /Fast VO2max/); assert.match(ideas.answer, /Nothing has been changed/);
  assert.equal(buildCoachReply("brainstorm", { localToday: "2026-11-02", language: "en" } as any).ruleId, "coach-conversation-v1:training-ideas-clarify");
  const why = buildCoachReply("why is today a bike session?", { localToday: "2026-11-02", language: "en" } as any);
  assert.equal(why.ruleId, "coach-conversation-v1:engine-explain"); assert.doesNotMatch(why.answer, /\d{2,}/);
  assert.equal(buildCoachReply("I have chest pain, give me training ideas for my 5k", { localToday: "2026-11-02", language: "en" } as any).ruleId, "coach-conversation-v1:urgent-symptoms", "safety first");
  const c = extractLocalCandidates("I have a smart trainer and I ride a gravel bike", { localToday: "2026-11-02" });
  assert.deepEqual(c.map(x => [x.field, x.value, x.status]), [["hasSmartTrainer", true, "proposed"], ["bikeType", "gravel", "proposed"]]);
  assert.equal(extractLocalCandidates("I have a road trip tomorrow", { localToday: "2026-11-02" }).length, 0);
  assert.ok(trainingIdeas("hyrox", "specific").some(i => /Compromised/.test(i)));
});
