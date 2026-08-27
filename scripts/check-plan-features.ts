// Quick logic check for the new plan features (run: npx tsx scripts/check-plan-features.ts)
import { generatePlan, easyShareOf, enforceSplit } from "../src/lib/science";
import { dayOffProtocol, analyzeHydration, morningWeightTrend, adaptSession } from "../src/lib/adaptive";
import { buildDailyPlanMessage } from "../src/lib/notify";
import { parseCheckinTranscript } from "../src/lib/voice-parse";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok:", msg);
}

// 1. Default 70/30: base+build weeks (peak/taper intentionally untouched) ~70% easy
const plan = generatePlan({ level: "amateur", distance: "olympic", weeks: 12, startDate: new Date() });
const baseBuild = plan.filter((w) => w.week <= Math.floor(12 * 0.8));
const avgEasy = Math.round(baseBuild.reduce((a, w) => a + easyShareOf(w.sessions), 0) / baseBuild.length);
assert(avgEasy >= 67 && avgEasy <= 73, `default split lands near 70% easy (avg ${avgEasy}% over base+build)`);

// 2. Manual override 50/50 pulls the same plan toward 50
const hardPlan = generatePlan({ level: "amateur", distance: "olympic", weeks: 12, startDate: new Date(), easyPct: 50 });
const avgHard = Math.round(hardPlan.filter((w) => w.week <= Math.floor(12 * 0.8)).reduce((a, w) => a + easyShareOf(w.sessions), 0) / baseBuild.length);
assert(avgHard <= avgEasy, `manual 50% is easier-reduced than 70% (avg ${avgHard}%)`);

// 3. enforceSplit never loses sessions or breaks zones
const wk = plan[0].sessions;
const enforced = enforceSplit(wk, 70);
assert(enforced.length === wk.length, "enforceSplit keeps session count");
assert(enforced.every((s) => ["z1","z2","z3","z4","z5","z6","z7"].includes(s.zone)), "zones stay valid");

// 4. Day off protocol always carries 20 min Z1 + a breathing technique
const off = dayOffProtocol(new Date("2026-09-01T12:00:00"));
assert(off.minutes === 20 && off.zone === "z1", "day off = 20 min Z1");
assert(/breath|inhale|exhale|Breathe/i.test(off.description), "day off includes breathing technique");

// 5. Evening Telegram message: full detail for a training day, protocol for a day off
const msg = buildDailyPlanMessage({
  name: "Jasmel",
  dateLabel: "tomorrow",
  sessions: [{ title: "Run: Track Intervals", durationMin: 50, intensity: "z5", type: "interval", sport: "run", description: "6x800m at vVO2max", recovery: "Cool-down: 5 min Box Breathing." }],
  readiness: { score: 40, advice: "HRV trending down — keep it easy." },
});
assert(msg.text.includes("Run: Track Intervals") && msg.text.includes("6x800m") && msg.text.includes("HRV trending down"), "telegram message has full detail + readiness");
const offMsg = buildDailyPlanMessage({ name: "Jasmel", dateLabel: "tomorrow", sessions: [] });
assert(offMsg.text.includes("DAY OFF") && offMsg.text.includes("20 min Zone 1"), "telegram day-off message has protocol");

// 6. Hydration: 2%+ sweat loss flags, 3%+ severe
const h1 = analyzeHydration(80, 78.5); // 1.9% → ok
assert(h1.flag === "ok" && h1.lossKg === 1.5, "1.9% sweat loss = ok flag");
const h2 = analyzeHydration(80, 78.2); // 2.25% → high
assert(h2.flag === "high" && h2.advice.includes("1.5"), "2.25% sweat loss = high flag with rehydration advice");
const h3 = analyzeHydration(80, 77.4); // 3.25% → severe
assert(h3.flag === "severe" && h3.advice.includes("150%"), "3.25% sweat loss = severe flag");

// 7. Morning weight trend: >1.5% up flags, stable stays ok
const base = new Date("2026-09-01T00:00:00Z");
const days = (n: number) => ({ date: new Date(base.getTime() + n * 86400000), weightKg: null as number | null });
const stable = morningWeightTrend(Array.from({ length: 6 }, (_, i) => days(i)).map((d, i) => ({ ...d, weightKg: 74 })));
assert(stable !== null && stable.flag === "ok", "stable morning weight = ok");
const up = morningWeightTrend(Array.from({ length: 6 }, (_, i) => days(i)).map((d, i) => ({ ...d, weightKg: i < 3 ? 74 : 75.6 })));
assert(up !== null && up.flag === "up", "weight +2.1% flags up");

// 8. RHR elevation knocks readiness down (Plews 2013)
const normal = adaptSession({ sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false });
const lagging = adaptSession({ sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, rhr: 62, rhrBaseline: 52 });
assert(lagging.score < normal.score, "RHR +10 over baseline lowers readiness score");

// 9. Voice transcript → structured answers, every response acknowledged
const v1 = parseCheckinTranscript("sleep was 4, soreness 2, energy 3, motivation 4, stress 2, weight 74 point 2, resting heart rate 48");
assert(v1.sleep === 4 && v1.soreness === 2 && v1.energy === 3 && v1.motivation === 4 && v1.stress === 2, "voice: 1-5 scales parsed");
assert(v1.weightKg === 74.2 && v1.rhr === 48, "voice: weight decimal + RHR parsed");
const v2 = parseCheckinTranscript("I slept four hours, everything hurts, I'm not sick, and I weigh 80 kilos");
assert(v2.sleep === 4 && v2.sick === false && v2.weightKg === 80, "voice: word numbers + negation handled");
const v3 = parseCheckinTranscript("I feel sick with a cold and I'm on my period");
assert(v3.sick === true && v3.menstrual === true, "voice: sick + menstrual flags");
const v4 = parseCheckinTranscript("I don't feel well but I'm not injured");
assert(v4.sick === true && v4.menstrual === false, "voice: ill without injury flag");

console.log(process.exitCode ? "SOME CHECKS FAILED" : "ALL CHECKS PASSED");
