import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseStructureEditRequest, readStructureEditBody, readPersistedPrescription, replaceSportStructure, structureEditBlockReason, MAX_STRUCTURE_REQUEST_BYTES, validateStructurePrescription } from "./sport-structure-edit";
import { SPORT_STRUCTURE_EXAMPLES } from "./sport-structure-examples";
import { normalizeSportStructure } from "./sport-structure";

const revision = "a".repeat(64);
const now = new Date("2026-10-02T12:00:00Z");
const workout = { date: now, sport: "strength", planned: true, completed: false };

test("structure edit requires a current explicit revision and narrowly scoped body", () => {
  const body = { id: "session-1", expectedRevision: revision, sportStructure: SPORT_STRUCTURE_EXAMPLES.strength.structure };
  assert.deepEqual(parseStructureEditRequest(JSON.stringify(body)), body);
  assert.equal(parseStructureEditRequest(JSON.stringify({ ...body, sportStructure: null })).sportStructure, null);
  for (const invalid of ["{", "[]", "null", JSON.stringify({ ...body, expectedRevision: undefined }), JSON.stringify({ ...body, expectedRevision: "stale" }), JSON.stringify({ ...body, sportStructure: undefined }), JSON.stringify({ ...body, sportStructure: [] }), JSON.stringify({ ...body, sportStructure: "inferred from notes" }), JSON.stringify({ ...body, id: "" }), JSON.stringify({ ...body, durationMin: 999 }), JSON.stringify({ ...body, athleteId: "someone-else" })]) assert.throws(() => parseStructureEditRequest(invalid));
});

test("structure edit body enforces its byte limit with missing or inaccurate Content-Length", async () => {
  const small = new Request("http://localhost/api/workout/structure", { method: "PATCH", body: "{\"id\":\"test\"}" });
  assert.equal(await readStructureEditBody(small), "{\"id\":\"test\"}");
  const large = new Request("http://localhost/api/workout/structure", { method: "PATCH", headers: { "Content-Length": "10" }, body: "x".repeat(MAX_STRUCTURE_REQUEST_BYTES + 1) });
  await assert.rejects(readStructureEditBody(large), /too large/);
  assert.throws(() => parseStructureEditRequest(`{"id":"${"é".repeat(MAX_STRUCTURE_REQUEST_BYTES / 2)}"}`), /too large/);
});

test("history guards protect prior dates and every recorded-activity marker", () => {
  assert.equal(structureEditBlockReason(workout, "UTC", now), null);
  assert.equal(structureEditBlockReason({ ...workout, date: new Date("2026-10-03T12:00:00Z") }, "UTC", now), null);
  assert.match(structureEditBlockReason({ ...workout, date: new Date("2026-10-01T12:00:00Z") }, "UTC", now)!, /Past sessions/);
  for (const evidence of [{ planned: false }, { completed: true }, { feedbackStatus: "unknown" }, { feedbackAt: now }, { feedbackNote: "" }, { actualDurationMin: 0 }, { actualSport: "strength" }, { actualDetails: "{}" }, { rpe: 1 }, { avgHr: 120 }, { avgPower: 100 }, { maxHr: 150 }, { np: 100 }, { preWeightKg: 70 }, { postWeightKg: 69 }, { externalId: "provider:123" }, { matchedPlanId: "plan-1" }]) assert.notEqual(structureEditBlockReason({ ...workout, ...evidence }, "UTC", now), null, JSON.stringify(evidence));
  assert.match(structureEditBlockReason({ ...workout, planDay: { dayOff: true } }, "UTC", now)!, /rest day/);
});

test("history is determined in the athlete local date, not server UTC", () => {
  const nearMidnight = new Date("2026-10-03T01:00:00Z");
  assert.equal(structureEditBlockReason({ ...workout, date: new Date("2026-10-02T12:00:00Z") }, "America/Los_Angeles", nearMidnight), null);
  assert.match(structureEditBlockReason({ ...workout, date: new Date("2026-10-02T01:00:00Z") }, "America/Los_Angeles", nearMidnight)!, /Past sessions/);
});

test("every UI example is valid explicit schema, never an automatically saved default", () => {
  for (const [sport, example] of Object.entries(SPORT_STRUCTURE_EXAMPLES)) {
    const normalized = normalizeSportStructure(example.structure, sport);
    assert.equal(normalized.schemaVersion, 1);
    assert.equal(normalized.kind, sport === "swim" ? "pool" : sport);
  }
});

test("structure edits preserve original prescription safety, duration, steps and unrecognized metadata", () => {
  const existing = { title: "Reviewed strength", sport: "strength", verdict: "rest", durationMin: 0, sportStructureBudgetMin: 30, safetyStatus: "rest", scaled: { originalMin: 30, factor: 0 }, detail: { main: "Reassess" }, steps: [{ name: "Obsolete draft", seconds: 20 }], customMetadata: { observedAt: "2026-10-02" } };
  const raw = JSON.stringify(existing);
  const edited = replaceSportStructure(raw, "strength", SPORT_STRUCTURE_EXAMPLES.strength.structure);
  const { sportStructure, ...preserved } = edited;
  assert.deepEqual(preserved, existing);
  assert.equal((sportStructure as any).kind, "strength");
  assert.deepEqual(JSON.parse(raw), existing);
});

test("clear cannot reactivate old generic steps and preserves check-in restrictions", () => {
  const existing = { title: "Workout", sport: "strength", verdict: "rest", durationMin: 0, steps: [{ name: "Obsolete workout", seconds: 120 }], sportStructure: SPORT_STRUCTURE_EXAMPLES.strength.structure };
  const result = replaceSportStructure(JSON.stringify(existing), "strength", null);
  assert.equal("sportStructure" in result, false);
  assert.deepEqual(result.steps, []);
  assert.equal(result.verdict, "rest");
  assert.equal(result.durationMin, 0);
});

test("malformed prescriptions and invalid sport fields cannot be silently repaired by structure edits", () => {
  for (const raw of [null, "broken", "[]", "null", "42"]) assert.throws(() => readPersistedPrescription(raw));
  assert.throws(() => replaceSportStructure("{}", "swim", SPORT_STRUCTURE_EXAMPLES.strength.structure), /does not match/);
  const wrongUnits = { ...SPORT_STRUCTURE_EXAMPLES.swim.structure, poolLength: { value: 25, unit: "feet" } };
  assert.throws(() => replaceSportStructure("{}", "swim", wrongUnits), /unit/);
  assert.throws(() => replaceSportStructure("{}", "strength", { ...SPORT_STRUCTURE_EXAMPLES.strength.structure, unreviewedField: true }), /Unknown/);
});

test("route keeps authentication and transactional scope at its boundary", () => {
  const route = readFileSync(new URL("../app/api/workout/structure/route.ts", import.meta.url), "utf8");
  assert.match(route, /trainingAccess\(req\)/);
  assert.match(route, /effectivePrescription\(athlete.id, id\)/);
  assert.match(route, /applySportStructureEdit\(tx, \{ actorId: actor.id, athleteId: athlete.id/);
  assert.match(route, /isolationLevel: "Serializable"/);
  assert.doesNotMatch(route, /dailyCheckin\.(?:update|create|upsert|delete)/);
});

test("editor reloads saved data on every open and keeps examples draft-only", () => {
  const source = readFileSync(new URL("../components/StructuredSportEditor.tsx", import.meta.url), "utf8");
  assert.match(source, /setOpen\(true\); void load\(\)/);
  assert.match(source, /expectedRevision: metadata.revision/);
  assert.match(source, /Example loaded as a draft. It has not been saved/);
  assert.match(source, /Reload saved structure \(replaces draft\)/);
  assert.match(source, /aria-invalid=\{!!error\}/);
  assert.match(source, /role="alert"/);
  assert.match(source, /if \(request.current \|\| disabled \|\| !metadata\?\.editable\) return/);
});


test("explicit structure keeps its reviewed budget through rest and requires a known duration", () => {
  const structure = SPORT_STRUCTURE_EXAMPLES.strength.structure;
  const saved = replaceSportStructure(JSON.stringify({ durationMin: 30, verdict: "full", structureReviewRequired: true }), "strength", structure);
  assert.equal(saved.sportStructureBudgetMin, 30);
  assert.equal(saved.structureReviewRequired, undefined);
  const held = replaceSportStructure(JSON.stringify({ durationMin: 0, verdict: "rest", sportStructureBudgetMin: 30 }), "strength", structure);
  assert.equal(held.sportStructureBudgetMin, 30);
  assert.equal(held.verdict, "rest");
  assert.throws(() => replaceSportStructure(JSON.stringify({ durationMin: 0 }), "strength", structure), /positive duration/);
  assert.throws(() => replaceSportStructure("{}", "strength", structure), /positive duration/);
  const cleared = replaceSportStructure(JSON.stringify(saved), "strength", null);
  assert.equal(cleared.sportStructureBudgetMin, undefined);
  assert.equal(cleared.structureReviewRequired, undefined);
});

test("shape validation rejects invalid nested brick steps without admitting a held session", () => {
  const structure = structuredClone(SPORT_STRUCTURE_EXAMPLES.brick.structure) as any;
  const context = { athleteId: "athlete", workoutId: "session", sport: "brick", title: "Brick", dateLocal: "2026-10-02", timezone: "UTC" };
  const saved = replaceSportStructure(JSON.stringify({ sport: "brick", durationMin: 0, sportStructureBudgetMin: 30, verdict: "rest" }), "brick", structure);
  validateStructurePrescription(saved, context);
  assert.equal(saved.verdict, "rest");
  assert.equal(saved.durationMin, 0);
  structure.components[0].steps[0].endpoint = { type: "time", seconds: -1 };
  const invalid = replaceSportStructure(JSON.stringify({ sport: "brick", durationMin: 30 }), "brick", structure);
  assert.throws(() => validateStructurePrescription(invalid, context), /Invalid|invalid/);
});
