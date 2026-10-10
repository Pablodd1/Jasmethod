import test from "node:test";
import assert from "node:assert/strict";
import { buildZoneTable, PACE_ZONES } from "./science";
import { resolveStepTarget } from "./canonical-session";
import { estimateDistanceKm, structuredSteps, zoneTargets } from "./prescription";

test("pace-second multipliers make easy running slower than its threshold anchor", () => {
  const { pace } = buildZoneTable({ thresholdPaceSecPerKm: 300 });
  assert.deepEqual(pace!.z1, { low: 375, high: 480 });
  assert.deepEqual(pace!.z2, { low: 330, high: 375 });
  assert.deepEqual(pace!.z4, { low: 300, high: 312 });
  assert.deepEqual(pace!.z5, { low: 276, high: 300 });
  for (const anchor of [180, 240, 300, 420, 599.9]) {
    const table = buildZoneTable({ thresholdPaceSecPerKm: anchor }).pace!;
    assert.ok(table.z1.low > anchor && table.z2.low > anchor);
    assert.ok(table.z6.high < anchor && table.z7.high < anchor);
    for (const [index, { key }] of PACE_ZONES.entries()) {
      assert.ok(table[key].low <= table[key].high);
      if (index) assert.ok(table[key].high <= table[PACE_ZONES[index - 1].key].low);
    }
  }
});

test("canonical executable run references sit inside the explanatory pace bands", () => {
  for (const anchor of [240, 300, 420, 599.9]) {
    const table = buildZoneTable({ thresholdPaceSecPerKm: anchor }).pace!;
    for (const { key } of PACE_ZONES) {
      const target = resolveStepTarget({ zone: key }, "run", { runPaceBase: anchor });
      assert.equal(target.type, "pace");
      assert.equal(target.source, "profile_reference");
      // The table rounds to whole seconds; the canonical target preserves precision.
      assert.ok(target.low! >= table[key].low - .5 && target.high! <= table[key].high + .5);
    }
  }
  assert.equal(resolveStepTarget({ zone: "z2" }, "run", { runPaceBase: 300 }).low, 360);
  assert.equal(zoneTargets("z2", "run", { runPaceBase: 300 }).pace, "~6:00/km");
  assert.equal(estimateDistanceKm("run", "z2", 30, { runPaceBase: 300 }), 5);
  assert.equal(resolveStepTarget({ zone: "z2" }, "run").type, "open");
  assert.equal(resolveStepTarget({ zone: "z2", target: { type: "open" } }, "run", { runPaceBase: 300 }).type, "open");
  assert.equal(resolveStepTarget({ zone: "z2", target: { type: "pace", low: 390, high: 420 } }, "run", { runPaceBase: 300 }).low, 390);
});

test("swim pace also uses seconds per distance but retains its separate five-band model", () => {
  const table = buildZoneTable({ thresholdPaceSecPer100m: 100 });
  assert.equal(table.pace, undefined);
  assert.deepEqual(table.swim!.z1, { low: 115, high: 125 });
  assert.deepEqual(table.swim!.z4, { low: 98, high: 102 });
  assert.deepEqual(table.swim!.z5, { low: 92, high: 98 });
});

test("legacy short-interval explanations disclose population and coaching adaptation", () => {
  const text = structuredSteps(60, "z5", "interval", 0, "run").map(step => step.group ?? "").join(" ");
  assert.match(text, /JMM adaptation/);
  assert.match(text, /elite-cyclist/);
  assert.match(text, /not a universal advantage or a validated running dose/);
  assert.doesNotMatch(text, /~2×|head-to-head winner/);
});
