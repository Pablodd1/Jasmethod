// Run: npx tsx src/lib/regen.test.ts
import assert from "node:assert";
import { variantFor, alternateFor } from "./regen";

// Variants: 3 seeds give 3 DIFFERENT sessions for the same goal
const v1 = variantFor("run", "threshold", "z4", 60, 1);
const v2 = variantFor("run", "threshold", "z4", 60, 2);
const v3 = variantFor("run", "threshold", "z4", 60, 3); // wraps to seed 0
assert.notEqual(v1.title, v2.title, "variant seeds differ");
assert.ok(v1.description.length > 40 && v2.description.length > 40, "descriptions populated");

// Same goal preserved: all mention the zone
assert.ok(v1.description.includes("T-pace") || v1.description.includes("Z4"), "threshold intent kept");

// Bike endurance variants exist for all seeds
for (const seed of [0, 1, 2]) {
  const v = variantFor("bike", "endurance", "z2", 90, seed);
  assert.ok(v.title.startsWith("Bike:"), `bike variant ${seed}`);
}

// Alternate: aerobic day -> different endurance modality
const alt = alternateFor("run", "endurance", "z2", 60, "olympic");
assert.ok(["bike", "swim"].includes(alt.sport), "aerobic alternates to another endurance sport");

// A cross-modality quality substitute needs reviewed familiar movement;
// it is not an automatic plyometric dose or equivalent sport-specific stimulus.
for (const [sport, type, zone, goal] of [["run", "interval", "z5", "olympic"], ["swim", "threshold", "z4", "olympic"], ["bike", "interval", "z5", "cycle"], ["strength", "strength", "z3", "olympic"]]) {
  const alternative = alternateFor(sport, type, zone, 60, goal);
  assert.equal(alternative.sport, "strength");
  assert.equal(alternative.type, "strength");
  assert.equal(alternative.intensity, "z3");
  assert.match(alternative.description, /familiar coach-reviewed/);
  assert.match(alternative.description, /not an equivalent/);
  assert.doesNotMatch(alternative.description, /(?:depth jumps|box jumps|jump squats|clap push-ups)\s*\d/i);
}

// Recovery stays recovery
const recAlt = alternateFor("run", "recovery", "z1", 30, "olympic");
assert.equal(recAlt.type, "recovery");

console.log("✓ regen.test.ts — all assertions passed");
