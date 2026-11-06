import assert from "node:assert/strict";
import test from "node:test";
import { applyCoachSwimReport, coachSwimReply, parseCoachSwimReport } from "./coach-swim-report";
import { reportedAnchor } from "./reported-anchors";

const today = "2026-11-05";

test("an unclassified swim pace asks whether it is training pace or CSS", () => {
  const result = parseCoachSwimReport("My swim pace is 1:45 per 100 meters.", today);
  assert.deepEqual(result, { status: "clarify", missing: "type" });
  assert.match(coachSwimReply(result!, false), /training pace or a CSS reference/);
  assert.match(coachSwimReply(result!, true), /ritmo de entrenamiento.*referencia CSS/);
  assert.equal(parseCoachSwimReport("What is my swim pace?", today), null);
});

test("swim observations require an explicit date and preserve units and date", () => {
  assert.deepEqual(parseCoachSwimReport("My swim training pace was 1:45/100 m.", today), { status: "clarify", missing: "date" });
  assert.deepEqual(parseCoachSwimReport("My swim training pace was 1:45 per 100 meters yesterday.", today), {
    status: "ready", kind: "observation", secondsPer100m: 105, observedDate: "2026-11-04",
  });
  assert.deepEqual(parseCoachSwimReport("Mi ritmo de entrenamiento en natación fue 1:45 por 100 metros el 2026-11-03.", today), {
    status: "ready", kind: "observation", secondsPer100m: 105, observedDate: "2026-11-03",
  });
  assert.deepEqual(parseCoachSwimReport("Today, my CSS is 1:45/100 yards.", today), {
    status: "ready", kind: "reported_css", secondsPer100m: 114.829, observedDate: today,
  });
});

test("imported, conflicting, future, guessed and malformed reports produce no writable values", () => {
  for (const message of [
    "My CSS is 1:45/100 m from Garmin today.",
    "My CSS is about 1:45/100 m today.",
    "My CSS is 1:45/100 m or 1:46/100 m today.",
    "My CSS is 1:45/100 m on 2026-11-06.",
    "My CSS is 1:45/100 m on 2026-02-30.",
    "My CSS is 1:65/100 m today.",
    "My CSS is 1:45/100 today.",
    "My CSS is 1:45/100 m today and update my weekly hours.",
  ]) assert.deepEqual(parseCoachSwimReport(message, today), { status: "invalid" }, message);
});

test("deduplicated observations never set or masquerade as the swimmer's CSS anchor", () => {
  const other = { label: "Existing test", value: 120, unit: "sec/100m", date: "2026-10-17" };
  const observation = { kind: "observation" as const, secondsPer100m: 105, observedDate: "2026-11-04" };
  const patch = applyCoachSwimReport(JSON.stringify([other]), observation, today);
  assert.deepEqual(JSON.parse(patch.manualPrs), [other, {
    label: "Reported swim training pace", value: 105, unit: "sec/100m", date: "2026-11-04",
  }]);
  assert.equal(patch.swimPaceBase, undefined);
  assert.equal(reportedAnchor({ ...patch, swimPaceBase: 105 }, "swimPaceBase", new Date(today + "T12:00:00Z")), null);
  assert.equal(applyCoachSwimReport(patch.manualPrs, observation, today).manualPrs, patch.manualPrs);
  assert.throws(() => applyCoachSwimReport("not json", observation, today), /saved personal records/);
  assert.throws(() => applyCoachSwimReport(patch.manualPrs, { ...observation, observedDate: "2026-11-06" }, today));
});

test("explicit dated CSS uses the existing reported anchor and does not represent a verified test", () => {
  const report = parseCoachSwimReport("My CSS is 1:45/100 m today.", today);
  assert.equal(report?.status, "ready");
  if (report?.status !== "ready") return;
  const patch = applyCoachSwimReport(null, report, today);
  assert.equal(patch.swimPaceBase, 105);
  const anchor = reportedAnchor(patch, "swimPaceBase", new Date(today + "T12:00:00Z"));
  assert.equal(anchor?.source, "athlete_reported_reference");
  assert.equal(anchor?.observedAt, today);
  assert.match(coachSwimReply(report, false), /not a verified test.*Nothing has been saved/);
});
