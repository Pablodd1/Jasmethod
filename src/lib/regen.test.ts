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

// Alternate: quality day -> sport-specific plyometrics (the mandatory rule)
const speedAlt = alternateFor("run", "interval", "z5", 60, "olympic");
assert.equal(speedAlt.sport, "strength");
assert.equal(speedAlt.type, "plyo");
assert.ok(speedAlt.description.includes("Ramírez-Campillo"), "plyo cited");

// Swimmer quality day -> upper-body plyo + pull strength (sport-specific)
const swimAlt = alternateFor("swim", "threshold", "z4", 60, "olympic");
assert.ok(swimAlt.description.includes("pull") || swimAlt.description.includes("pull-ups"), "swim-specific");

// Cyclist quality day -> cyclist-specific plyo
const bikeAlt = alternateFor("bike", "interval", "z5", 60, "cycle");
assert.ok(bikeAlt.description.includes("jump squat") || bikeAlt.description.includes("hip thrust"), "cyclist-specific");

// Recovery stays recovery
const recAlt = alternateFor("run", "recovery", "z1", 30, "olympic");
assert.equal(recAlt.type, "recovery");

console.log("✓ regen.test.ts — all assertions passed");
