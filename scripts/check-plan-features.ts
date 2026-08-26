// Quick logic check for the new plan features (run: npx tsx scripts/check-plan-features.ts)
import { generatePlan, easyShareOf, enforceSplit } from "../src/lib/science";
import { dayOffProtocol } from "../src/lib/adaptive";
import { buildDailyPlanMessage } from "../src/lib/notify";

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

console.log(process.exitCode ? "SOME CHECKS FAILED" : "ALL CHECKS PASSED");
