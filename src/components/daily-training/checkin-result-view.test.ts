import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { adaptSession } from "../../lib/adaptive";
import { resolveCheckinSafety } from "../../lib/checkin-safety";
import {
  CHECKIN_INPUT_IDS, CHECKIN_MISSING_INPUT_RULE, CHECKIN_NO_TIME_RULE, checkinAdaptationView, type CheckinAdaptationView,
} from "./checkin-result-view";
import { readinessFieldLabel, readinessReasonText } from "./readiness-copy";

const answered = { sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, newPain: false, urgentSymptoms: false };
const incomplete = (view: CheckinAdaptationView) => {
  assert.equal(view.kind, "incomplete");
  return view as Extract<CheckinAdaptationView, { kind: "incomplete" }>;
};
/** Every string an athlete can read in the view (internal keys and DOM ids are not displayed). */
const visibleText = (view: Extract<CheckinAdaptationView, { kind: "incomplete" }>) =>
  [view.heading, view.summary, view.explanation ?? "", ...view.missing.map((m) => m.label)].join(" | ");

test("an unanswered available-time question asks the athlete to complete the check-in", () => {
  const adaptation = adaptSession({ ...answered });
  assert.equal(adaptation.ruleId, CHECKIN_MISSING_INPUT_RULE);
  assert.equal(adaptation.safetyStatus, "unknown");
  for (const es of [false, true]) {
    const view = incomplete(checkinAdaptationView(adaptation, es));
    assert.equal(view.heading, es ? "Completa el check-in de hoy" : "Complete today's check-in");
    assert.deepEqual(view.missing.map((m) => m.key), ["availableMin"]);
    assert.equal(view.focusInputId, "answer-availableMinutes");
    assert.match(view.explanation ?? "", es ? /cuántos minutos/ : /how many minutes/);
    assert.match(view.summary, es ? /tiempo disponible para entrenar/ : /available training time/);
    // The athlete never sees the internal field name, the word "unavailable" or a REST verdict label.
    assert.doesNotMatch(visibleText(view), /availableMin|unavailable|\bREST\b|DESCANSO/);
  }
});

test("the friendly summary reuses readinessReasonText and the view does not modify the adaptation", () => {
  const adaptation = adaptSession({ ...answered });
  const before = JSON.stringify(adaptation);
  const view = incomplete(checkinAdaptationView(adaptation, false));
  assert.equal(view.summary, readinessReasonText(adaptation.message, false));
  assert.equal(JSON.stringify(adaptation), before);
  assert.equal(adaptation.verdict, "rest");
  assert.equal(adaptation.durationFactor, 0);
  assert.equal(adaptation.scoreAvailable, false);
});

test("zero available minutes is a real answer and is never treated as unanswered", () => {
  const zero = adaptSession({ ...answered, availableMin: 0 });
  const unknown = adaptSession({ ...answered });
  assert.equal(zero.ruleId, CHECKIN_NO_TIME_RULE);
  assert.equal(zero.safetyStatus, "clear");
  assert.equal(zero.verdict, "rest");
  assert.notEqual(zero.ruleId, unknown.ruleId);
  for (const es of [false, true]) {
    const view = checkinAdaptationView(zero, es);
    assert.equal(view.kind, "no-time");
    if (view.kind !== "no-time") return;
    assert.match(view.summary, /\b0\b/);
    assert.doesNotMatch(`${view.heading} ${view.summary}`, /Complete|Completa|unavailable|availableMin/);
  }
  assert.equal(checkinAdaptationView(unknown, false).kind, "incomplete");
});

test("illness, pain and urgent-symptom holds are never reworded as an incomplete check-in", () => {
  const cases = [
    adaptSession({ ...answered, sick: true }),
    adaptSession({ ...answered, newPain: true, availableMin: 30 }),
    adaptSession({ ...answered, urgentSymptoms: true, availableMin: 30 }),
    // A reported hold takes precedence over unanswered questions in the safety rules; the view must not change that.
    adaptSession({ sick: true }),
    adaptSession({ urgentSymptoms: true }),
  ];
  for (const adaptation of cases) {
    assert.notEqual(adaptation.ruleId, CHECKIN_MISSING_INPUT_RULE);
    for (const es of [false, true]) assert.deepEqual(checkinAdaptationView(adaptation, es), { kind: "standard" });
  }
  assert.ok(resolveCheckinSafety({ urgentSymptoms: true }).message.startsWith("Stop exercise"));
});

test("clear answers, setup holds and refresh-required records keep the standard presentation", () => {
  assert.deepEqual(checkinAdaptationView(adaptSession({ ...answered, availableMin: 45 }), false), { kind: "standard" });
  for (const ruleId of ["setup-gate-v1:incomplete", "checkin-safety-v1:refresh-required", "checkin-safety-v1:daily-budget"]) {
    assert.deepEqual(checkinAdaptationView({ safetyStatus: "unknown", ruleId, message: "Review setup." }, false), { kind: "standard" });
  }
  assert.deepEqual(checkinAdaptationView(null, false), { kind: "standard" });
  assert.deepEqual(checkinAdaptationView(undefined, true), { kind: "standard" });
});

test("several unanswered questions are listed in on-screen order and the first one receives focus", () => {
  const view = incomplete(checkinAdaptationView(adaptSession({}), false));
  assert.deepEqual(view.missing.map((m) => m.key), ["sleep", "soreness", "motivation", "energy", "stress", "sick", "urgentSymptoms", "availableMin", "newPain"]);
  assert.equal(view.focusInputId, "answer-sleep");
  // Labels are plain words (never a raw camelCase field name such as availableMin or urgentSymptoms).
  assert.ok(view.missing.every((m) => !/[a-z][A-Z]/.test(m.label) && m.inputId === CHECKIN_INPUT_IDS[m.key]));
  const partial = incomplete(checkinAdaptationView(adaptSession({ ...answered, stress: undefined, availableMin: undefined }), true));
  assert.deepEqual(partial.missing.map((m) => m.key), ["stress", "availableMin"]);
  assert.equal(partial.focusInputId, "answer-stress");
  assert.match(partial.summary, /estrés, tiempo disponible para entrenar/);
});

test("older saved adaptations without missingFields are still explained from the standard message", () => {
  const current = adaptSession({ ...answered });
  const legacy = { safetyStatus: current.safetyStatus, ruleId: current.ruleId, message: current.message };
  const view = incomplete(checkinAdaptationView(legacy, false));
  assert.deepEqual(view.missing.map((m) => m.key), ["availableMin"]);
  assert.equal(view.focusInputId, "answer-availableMinutes");
  // Unrecognised wording still gets a safe generic hold message, never raw text or an invented field.
  const odd = incomplete(checkinAdaptationView({ safetyStatus: "unknown", ruleId: CHECKIN_MISSING_INPUT_RULE, message: "Something else", missingFields: ["notAQuestion", 7] }, false));
  assert.deepEqual(odd.missing, []);
  assert.equal(odd.focusInputId, null);
  assert.match(odd.summary, /Training stays on hold/);
  assert.equal(odd.explanation, null);
});

test("every question the safety rules can report has a friendly label and an input id", () => {
  for (const [key, id] of Object.entries(CHECKIN_INPUT_IDS)) {
    assert.ok(readinessFieldLabel(key, false) && readinessFieldLabel(key, true), `label for ${key}`);
    assert.match(id, /^answer-[A-Za-z]+$/);
  }
  assert.equal(readinessFieldLabel("notAQuestion", false), null);
  // The checker and the view must agree on which fields can be missing.
  const reported = resolveCheckinSafety({}).missingFields;
  assert.deepEqual([...reported].sort(), Object.keys(CHECKIN_INPUT_IDS).sort());
});

test("the check-in page wires the view, the input ids and the focus request", () => {
  const source = readFileSync(join(process.cwd(), "src/app/checkin/page.tsx"), "utf8");
  assert.match(source, /checkinAdaptationView\(/);
  assert.match(source, /id="answer-availableMinutes"/);
  assert.match(source, /htmlFor="answer-availableMinutes"/);
  assert.match(source, /id="answer-newPain"/);
  assert.match(source, /id=\{`answer-\$\{key\}`\}/);
  assert.match(source, /focusRequest/);
  assert.match(source, /adaptationView\?\.kind !== "incomplete"/);
  // The raw safety message and the "— unavailable" label are only rendered for the standard presentation.
  assert.equal((source.match(/adaptation\.message/g) ?? []).length, 1);
  assert.match(source, /adaptationView\?\.kind === "no-time" \? adaptationView\.summary : adaptation\.message/);
  assert.match(source, /adaptationView\?\.kind === "no-time" \? adaptationView\.heading : adaptation\.scoreAvailable === false/);
});
