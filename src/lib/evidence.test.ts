// Run: npx tsx src/lib/evidence.test.ts
import assert from "node:assert";
import { EVIDENCE_REGISTRY, getEvidence, validateClaimIds, evidenceFor } from "./evidence-registry";

// Registry is non-empty and all entries have required fields
assert.ok(EVIDENCE_REGISTRY.length >= 10, "at least 10 entries");
for (const e of EVIDENCE_REGISTRY) {
  assert.ok(e.claimId, "claimId required");
  assert.ok(e.claim, "claim required");
  assert.ok(e.domain, "domain required");
  assert.ok(e.certainty, "certainty required");
  assert.ok(e.tier, "tier required");
  assert.ok(e.lastReviewed, "lastReviewed required");
  assert.ok(e.status === "active", "all entries start active");
}

// Lookup works
const hrv = getEvidence("hrv-guided-training-2021");
assert.ok(hrv, "HRV entry found");
assert.equal(hrv.PMID, "34489178");

// Unknown ID returns undefined
assert.equal(getEvidence("nonexistent"), undefined);

// Validation
const result = validateClaimIds(["hrv-guided-training-2021", "fake-id"]);
assert.equal(result.valid.length, 1);
assert.equal(result.invalid.length, 1);
assert.deepEqual(result.invalid, ["fake-id"]);

// Domain filter
const endurance = evidenceFor("endurance");
assert.ok(endurance.length >= 2, "endurance entries exist");
const boxing = evidenceFor("neuroprotection", "boxing");
assert.ok(boxing.length >= 2, "boxing neuroprotection entries exist");

// Tier ordering: meta_analyses are the strongest evidence
const tiers = EVIDENCE_REGISTRY.map((e) => e.tier);
assert.ok(tiers.includes("meta_analysis"), "has meta-analyses");
assert.ok(tiers.includes("consensus"), "has consensus statements");

// No duplicate claim IDs
const ids = EVIDENCE_REGISTRY.map((e) => e.claimId);
assert.equal(new Set(ids).size, ids.length, "no duplicate claim IDs");

console.log("✓ evidence.test.ts — all assertions passed");

// Claim-to-study regression checks, editorially verified against PubMed abstracts.
assert.match(hrv.claim, /not statistically significant/);
assert.match(hrv.effectSize || "", /p=0.597/);
const strength = getEvidence("currier-strength-2023")!;
assert.equal(strength.PMID,"37414459");
assert.match(strength.claim,/strength and hypertrophy/);
assert.doesNotMatch(strength.effect || "",/mortality|functional capacity/);
