import { test } from "node:test";
import assert from "node:assert";
import {
  sportIcon,
  zoneDot,
  telegramPlan,
  gmailPlanHtml,
  calendarDescription,
  type PlanFormatSession,
} from "./plan-formats";

const session: PlanFormatSession = {
  title: "Run: Tempo",
  sport: "run",
  durationMin: 60,
  intensity: "z4",
  startTime: "07:00",
  steps: [
    { name: "Warm up", seconds: 540, zone: "z1", phase: "warmup" },
    { name: "Tempo block", seconds: 2400, zone: "z4", phase: "active", note: "hold threshold effort" },
    { name: "Cool down", seconds: 660, zone: "z1", phase: "cooldown" },
  ],
  fuel: {
    preSession: { carbsG: 140, timingLabel: "2-3 h before" },
    carbsPerHourG: 60,
    fluidMlPerHour: 750,
    sodiumMgPerHour: 500,
  },
  post: { carbsG: 84, proteinG: 21 },
};

test("icons + zone dots: sport mapped, effort readable at a glance", () => {
  assert.strictEqual(sportIcon("swim"), "🏊");
  assert.strictEqual(sportIcon("boxing"), "🥊");
  assert.strictEqual(sportIcon("unknown-sport"), "🏃");
  assert.strictEqual(zoneDot("z1"), "🟢");
  assert.strictEqual(zoneDot("z4"), "🟠");
  assert.strictEqual(zoneDot("z6"), "🔴");
});

test("telegram plan: compact, emoji-led, fuel + post included, steps truncated", () => {
  const t = telegramPlan("Jasmel", "Tuesday, Sep 22", [session]);
  assert.match(t, /⚡️ Jasmel — Tuesday, Sep 22/);
  assert.match(t, /🏃 07:00 · Run: Tempo — 60 min 🟠Z4/);
  assert.match(t, /never force fluids or overdrink/);
  assert.match(t, /⛽ 60g\/h \+ up to 750ml\/h/);
  assert.match(t, /🍚 post: 84g carbs \+ 21g protein/);
  // Only the first 2 active steps appear (chat stays scannable)
  const bullets = t.split("\n").filter((l) => l.startsWith("   •"));
  assert.strictEqual(bullets.length, 1); // only one active step in fixture
});

test("telegram plan: empty or held day never prescribes exercise", () => {
  const t = telegramPlan("Jasmel", "Sunday", []);
  assert.match(t, /No exercise is cleared/);
  assert.doesNotMatch(t, /20 min/);
});

test("gmail html: styled cards with zones, fuel strip and escaped content", () => {
  const { subject, html } = gmailPlanHtml("Jasmel", "Tuesday, Sep 22", [
    { ...session, title: "Run: <Tempo> & intervals" },
  ]);
  assert.match(subject, /Jasmel — Tuesday, Sep 22's plan/);
  assert.match(html, /⛽ 60g carbs\/h · 750ml\/h · 500mg sodium\/h/);
  assert.match(html, /&lt;Tempo&gt; &amp; intervals/); // XSS-safe escaping
  assert.match(html, /🍚 Post: 84g carbs \+ 21g protein/);
});

test("calendar description: icons, key steps with notes, fuel, plain-text safe", () => {
  const d = calendarDescription(session);
  assert.match(d, /🏃 Run: Tempo — 60 min 🟠Z4/);
  assert.match(d, /• 40 min Tempo block \(hold threshold effort\)/);
  assert.match(d, /⛽ Pre: 140g 2-3 h before/);
  assert.match(d, /never force fluids or overdrink/);
  assert.match(d, /⛽ During: 60g\/h \+ up to 750ml\/h/);
  assert.match(d, /🍚 Post: 84g carbs \+ 21g protein/);
  // ICS-safe: no raw newlines get through icsText at the call site; here just structure
  assert.ok(d.includes("\n"));
});


test("distance, reps and lap endpoints remain distinct from estimated time", () => {
  const steps: NonNullable<PlanFormatSession["steps"]> = [
    { name: "Distance", seconds: 240, zone: "z2", phase: "active", endpoint: { type: "distance", meters: 1000 } },
    { name: "Lift", seconds: 60, zone: "z2", phase: "active", endpoint: { type: "reps", reps: 5 } },
    { name: "Technique", seconds: 300, zone: "z2", phase: "active", endpoint: { type: "lap" } },
  ];
  const msg = calendarDescription({ ...session, steps });
  assert.match(msg, /1000 m Distance/);
  assert.match(msg, /5 reps Lift/);
  assert.match(msg, /Lap\/manual end Technique/);
  assert.doesNotMatch(msg, /4 min Distance|1 min Lift|5 min Technique/);
});


test("unknown body mass is not rendered as numeric grams", () => {
  const msg = telegramPlan("Athlete", "Today", [{ ...session, post: { carbsG: null, proteinG: null, note: "Body mass unknown; use a familiar mixed meal." } }]);
  assert.match(msg, /Body mass unknown/);
  assert.doesNotMatch(msg, /nullg|undefinedg|84g/);
});
