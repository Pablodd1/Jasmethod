import { test } from "node:test";
import assert from "node:assert";
import {
  SUPPLEMENT_DB,
  SPORT_PROTOCOLS,
  SPORT_KEY_FOR_DISCIPLINE,
  supplementsForSport,
  getSupplement,
} from "./supplement-db";
import { ERGOGENIC_LIBRARY } from "./adaptive";

test("supplement DB: every entry has dose, timing, mechanism and citations", () => {
  for (const s of SUPPLEMENT_DB) {
    assert.ok(s.id && s.name, `entry ${s.id} missing identity`);
    assert.ok(s.dose, `${s.id} missing dose`);
    assert.ok(s.timing, `${s.id} missing timing`);
    assert.ok(s.mechanism, `${s.id} missing mechanism`);
    assert.ok(s.citations.length >= 1, `${s.id} missing citations`);
    assert.ok(s.evidenceScore >= 1 && s.evidenceScore <= 10, `${s.id} bad evidence score`);
  }
});

test("supplement DB: every protocol entry references an existing supplement", () => {
  for (const [sport, entries] of Object.entries(SPORT_PROTOCOLS)) {
    for (const e of entries) {
      assert.ok(getSupplement(e.id), `${sport} protocol references unknown supplement ${e.id}`);
      assert.ok(e.reason.length > 10, `${sport}/${e.id} needs a substantive reason`);
    }
  }
});

test("supplement DB: every platform discipline maps to a protocol", () => {
  const disciplines = [
    "track-sprint", "boxing", "sprint", "olympic", "half", "full",
    "run-only", "swim-only", "cycle", "hyrox", "lifting",
  ];
  for (const d of disciplines) {
    const key = SPORT_KEY_FOR_DISCIPLINE[d];
    assert.ok(key, `discipline ${d} has no supplement mapping`);
    assert.ok(SPORT_PROTOCOLS[key], `discipline ${d} maps to missing protocol ${key}`);
  }
});

test("supplement DB: boxing stack is brain-first (creatine-brain or DHA at priority 1)", () => {
  const stack = supplementsForSport("boxing_combat");
  assert.ok(stack.length >= 4, "boxing stack too thin");
  const top = stack.find((s) => s.priority === 1)!;
  assert.ok(
    top.supplement.category === "neuroprotection",
    `boxing priority 1 should be neuroprotection, got ${top.supplement.category}`,
  );
  // DHA entry must warn about EPA-only interference
  const dha = SUPPLEMENT_DB.find((s) => s.id === "dha_neuroprotection")!;
  assert.match(dha.caution!, /EPA/);
});

test("supplement DB: sprint 400m stack covers buffering for the lactate battle", () => {
  const stack = supplementsForSport("sprint_400m");
  const ids = stack.map((s) => s.supplement.id);
  assert.ok(ids.includes("beta_alanine"), "400m stack missing beta-alanine");
  assert.ok(ids.includes("bicarbonate"), "400m stack missing bicarbonate");
});

test("ergogenic library: creatine reflects 2025 umbrella-review evidence", () => {
  const creatine = ERGOGENIC_LIBRARY.find((e) => e.key === "creatine")!;
  assert.ok(creatine);
  assert.match(creatine.benefit, /Ashtary-Larky 2025/);
  assert.match(creatine.caution!, /Kreider 2025/);
});

test("ergogenic library: recovery entries present with competition-window guidance", () => {
  const cherry = ERGOGENIC_LIBRARY.find((e) => e.key === "tartCherry")!;
  const collagen = ERGOGENIC_LIBRARY.find((e) => e.key === "collagen")!;
  assert.match(cherry.when, /pre-competition/);
  assert.match(cherry.benefit, /2026/);
  assert.match(collagen.when, /BEFORE/i);
});
