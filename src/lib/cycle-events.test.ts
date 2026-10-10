import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCycleEvents, cycleDaysBetween, cycleEventDay, cycleEventPolicy, normalizeCycleEvents } from "./cycle-events";
import { dateKey, localDate } from "./dates";

test("events normalize all priorities and deduplicate legacy protection without promoting a B/C event", () => {
  const events = normalizeCycleEvents({ events: [
    { id: "c", dateKey: "2026-11-08", priority: 3 }, { id: "a", dateKey: "2026-11-01", priority: "A" }, { id: "b", dateKey: "2026-11-08", priority: 2 },
  ], raceKey: "2026-11-08" });
  assert.deepEqual(events.map(event => [event.id, event.priority]), [["a", "A"], ["b", "B"], ["c", "C"]]);
  assert.equal(normalizeCycleEvents({ raceKey: "2026-11-01" })[0].source, "legacy");
  for (const event of events) assert.equal(cycleEventDay(events, event.dateKey).protected, true);
});
test("calendar keys reject invalid or timestamp input and DST never shifts an event", () => {
  for (const dateKey of ["2026-02-30", "2026-1-01", "2026-11-01T00:00:00Z", "invalid"])
    assert.throws(() => normalizeCycleEvents({ events: [{ dateKey }] }), /calendar date/);
  assert.throws(() => normalizeCycleEvents({ events: [{ dateKey: "2026-11-01", priority: 4 as never }] }), /priority/);
  assert.throws(() => normalizeCycleEvents({ events: [{ id: "same", dateKey: "2026-11-01" }, { id: "same", dateKey: "2026-11-02" }] }), /Conflicting/);
  assert.equal(cycleDaysBetween("2026-10-31", "2026-11-02"), 2);
  for (const timezone of ["America/New_York", "Europe/London", "Pacific/Auckland"]) {
    const key = "2026-11-01";
    assert.equal(dateKey(localDate(key, timezone), timezone), key);
    assert.equal(cycleEventDay(normalizeCycleEvents({ raceKey: key }), "2026-10-31").phase, "preparation");
  }
});
test("close and same-day events require an explicit conservative choice, with stable warnings and no separate peak claim", () => {
  const events = normalizeCycleEvents({ events: [{ id: "a", name: "A event", dateKey: "2026-11-15", priority: "A" }, { id: "b", name: "B event", dateKey: "2026-11-20", priority: "B" }, { id: "c", dateKey: "2026-11-20", priority: "C" }] });
  const review = assessCycleEvents(events, "2026-10-12", 12);
  assert.equal(review.requiresChoice, true);
  assert.equal(review.warnings.filter(warning => warning.code === "close_events").length, 3);
  assert.deepEqual(assessCycleEvents([...events].reverse(), "2026-10-12", 12), review);
  assert.match(review.policyNote, /heuristics.*not individualized/);
  assert.match(review.warnings[0].message, /Separate peaks are not assumed/);
  assert.equal(assessCycleEvents(normalizeCycleEvents({ events: [{ dateKey: "2026-11-15" }, { dateKey: "2027-01-15" }] }), "2026-10-12", 16).requiresChoice, false);
});
test("recent events apply recovery before cycle start, including long C races and short upcoming preparation", () => {
  const events = normalizeCycleEvents({ events: [{ id: "recent", dateKey: "2026-10-04", priority: "C", distance: "marathon" }, { id: "next", dateKey: "2026-10-20", priority: "A" }] });
  assert.equal(cycleEventPolicy(events[0]).recoveryDays, 14);
  const day = cycleEventDay(events, "2026-10-12");
  assert.equal(day.factor, .5); assert.equal(day.phase, "recovery");
  const review = assessCycleEvents(events, "2026-10-12", 12);
  assert.ok(review.warnings.some(warning => warning.code === "recent_event"));
  assert.ok(review.warnings.some(warning => warning.code === "short_preparation"));
  assert.equal(cycleEventDay(events, "2026-10-19").phase, "preparation");
});
test("priority changes preparation, never assumes C events are physiologically cheap", () => {
  const make = (priority: "A" | "B" | "C") => normalizeCycleEvents({ events: [{ dateKey: "2026-11-15", priority }] });
  assert.equal(cycleEventDay(make("A"), "2026-11-05").phase, "preparation");
  assert.equal(cycleEventDay(make("B"), "2026-11-05").phase, "ordinary");
  for (const priority of ["A", "B", "C"] as const) assert.equal(cycleEventDay(make(priority), "2026-11-21").factor, .5);
});
