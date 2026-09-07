import test from "node:test";
import assert from "node:assert/strict";
import { geminiAnswer } from "./gemini-response";

test("Gemini answers exclude thought summaries and retain every final text part", () => {
  const data = {
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [
            { thought: true, text: "Check the word limit." },
            { text: "Speed, power, strength, " },
            { text: "hypertrophy and endurance." },
          ],
        },
      },
    ],
  };
  assert.equal(
    geminiAnswer(data),
    "Speed, power, strength, hypertrophy and endurance.",
  );
});

test("incomplete, blocked, thought-only and empty Gemini responses cannot become coaching advice", () => {
  for (const finishReason of [
    "MAX_TOKENS",
    "SAFETY",
    "RECITATION",
    "OTHER",
    undefined,
  ]) {
    assert.equal(
      geminiAnswer({
        candidates: [
          { finishReason, content: { parts: [{ text: "Incomplete advice" }] } },
        ],
      }),
      "",
    );
  }
  assert.equal(
    geminiAnswer({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ thought: true, text: "Planning the answer" }] },
        },
      ],
    }),
    "",
  );
  assert.equal(geminiAnswer({}), "");
  assert.equal(geminiAnswer({ candidates: [{ finishReason: "STOP" }] }), "");
});
