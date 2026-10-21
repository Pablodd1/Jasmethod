import assert from "node:assert/strict";
import test from "node:test";
import { importResultMessage } from "./import-result-message";

test("a re-import says the records were already stored instead of '0 imported'", () => {
  const text = importResultMessage("garmin", { workoutsImported: 0, workoutsAlreadyStored: 5, workoutsFound: 5 }, "en");
  assert.match(text, /0 new workouts, 5 already stored and refreshed/);
});
test("skipped rows and unsupported types are named, in both languages", () => {
  const data = { workoutsImported: 2, skipped: { unsupported_activity_type: 3, bad_date: 1, ambiguousNumbers: 2 }, unsupportedTypes: { Walking: 1, "Strength Training": 2 } };
  const en = importResultMessage("garmin", data, "en"), es = importResultMessage("garmin", data, "es");
  assert.match(en, /Not imported: 3 unsupported activity type; 1 unreadable date; 2 number\(s\) in an unrecognized format left blank \(Strength Training ×2, Walking ×1\)/);
  assert.match(es, /No importado: 3 tipo de actividad no compatible/);
});
test("zero-valued skip counters add no noise and the message never claims completeness", () => {
  const text = importResultMessage("tcx", { workoutsImported: 1, skipped: { tooShort: 0 } }, "en");
  assert.doesNotMatch(text, /Not imported/);
  assert.doesNotMatch(text, /complete|all your history/i);
});
