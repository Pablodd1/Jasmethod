import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackBriefing, getCoachBriefing, type CoachContext } from "./coach";

const context: CoachContext = {
  name: "Test athlete", profile: {}, zones: null, readiness: null,
  latestMetric: null, todaySession: null, planName: null,
  bloodFlags: [], dnaHighlights: [],
};

test("a readiness score cannot create training on an unprescribed day", () => {
  for (const language of ["en", "es", "ht", "fr", "ru", "unknown"]) {
    for (const score of [0, 60, 100]) {
      const result = fallbackBriefing({ ...context, language, readiness: { score, advice: "" } });
      assert.equal(result.headline, "CHECK PLAN");
      assert.doesNotMatch(result.briefing + result.adaptation, /40|Z[1-7]|GREEN|AMBER|RED/);
      assert.deepEqual(result.sources, []);
    }
  }
});

test("missing readiness also preserves the no-session hold", () => {
  assert.equal(fallbackBriefing(context).headline, "CHECK PLAN");
});

test("the public briefing entry point preserves the local no-session hold", () => {
  assert.equal(getCoachBriefing("test-athlete", { ...context, readiness: { score: 100, advice: "" } }).headline, "CHECK PLAN");
});

test("external AI eligibility cannot bypass the no-session hold", () => {
  const previous = process.env.EXTERNAL_AI_ENABLED;
  process.env.EXTERNAL_AI_ENABLED = "true";
  try {
    const result = getCoachBriefing("test-external-athlete", { ...context, externalAiEligible: true, readiness: { score: 100, advice: "" } });
    assert.equal(result.mode, "fallback");
    assert.equal(result.headline, "CHECK PLAN");
    assert.deepEqual(result.sources, []);
  } finally {
    if (previous === undefined) delete process.env.EXTERNAL_AI_ENABLED;
    else process.env.EXTERNAL_AI_ENABLED = previous;
  }
});

test("existing saved prescriptions and rest instructions are preserved", () => {
  for (const verdict of ["planned", "rest"]) {
    const prescription = { title: "Saved session", verdict, detail: { main: "Saved instruction" }, sources: ["saved source"] };
    for (const stored of [prescription, JSON.stringify(prescription)]) {
      const result = fallbackBriefing({ ...context, todaySession: { title: "Saved session", prescription: stored } });
      assert.equal(result.adaptation, "Saved instruction");
      assert.deepEqual(result.sources, ["saved source"]);
      assert.match(result.headline, new RegExp(verdict.toUpperCase()));
    }
  }
});

test("injury handling still takes precedence", () => {
  assert.equal(fallbackBriefing({ ...context, profile: { injured: true } }).headline, "RECOVERY REVIEW");
});
