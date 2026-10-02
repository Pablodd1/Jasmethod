import { test } from "node:test";
import assert from "node:assert";
import { adaptSession } from "./adaptive";
import { assignmentAllows } from "./access";

const good = { sleep: 4, soreness: 2, motivation: 4, energy: 4, stress: 2, sick: false, newPain: false, urgentSymptoms: false, availableMin: 60 } as any;

// ---- Coach assignment gate (pure logic) ----

test("assignmentAllows: active grants, revoked/absent/consent-revoked deny", () => {
  assert.strictEqual(assignmentAllows({ status: "active", consent: "pending" }), false);
  assert.strictEqual(assignmentAllows({ status: "active", consent: "granted" }), true);
  assert.strictEqual(assignmentAllows({ status: "revoked", consent: "granted" }), false);
  assert.strictEqual(assignmentAllows({ status: "active", consent: "revoked" }), false);
  assert.strictEqual(assignmentAllows(null), false);
});

// ---- Device-free check-in loop ----

test("availableMin does not alter the readiness verdict (it is a budget, not a signal)", () => {
  const a = adaptSession(good);
  const b = adaptSession({ ...good, availableMin: 25 } as any);
  assert.strictEqual(a.verdict, b.verdict);
  assert.strictEqual(a.score, b.score);
});

test("new pain that affects movement caps the session regardless of high readiness", () => {
  const p = adaptSession({
    ...good,
    newPain: true,
    painAffectsMovement: true,
    painLocation: "left knee",
  } as any);
  // Athlete feels great (score would be 'full') — but the gait-changing pain wins.
  assert.strictEqual(p.intensityCap, "z1");
  assert.strictEqual(p.verdict, "rest");
  assert.strictEqual(p.durationFactor, 0);
  assert.ok(p.durationFactor <= 0.6);
  assert.match(p.message, /left knee/);
  assert.notStrictEqual(p.verdict, "full");
});

test("new local pain without movement impact holds training for assessment", () => {
  const p = adaptSession({ ...good, newPain: true } as any);
  assert.strictEqual(p.intensityCap, "z1");
  assert.strictEqual(p.verdict, "rest");
  assert.match(p.message, /new or worsening focal pain/i);
});

test("sessionFelt harder dips the score; easier never raises it (single-signal rule)", () => {
  const base = adaptSession(good).score;
  const harder = adaptSession({ ...good, sessionFelt: "harder" } as any).score;
  const easier = adaptSession({ ...good, sessionFelt: "easier" } as any).score;
  assert.strictEqual(harder, base - 5);
  assert.strictEqual(easier, base);
});

test("pain override respects an existing rest verdict (illness stays rest)", () => {
  const p = adaptSession({
    ...good,
    sick: true,
    newPain: true,
    painAffectsMovement: true,
  } as any);
  assert.strictEqual(p.verdict, "rest");
});
