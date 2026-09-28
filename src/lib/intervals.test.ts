import { test } from "node:test";
import assert from "node:assert/strict";
import { buildZwo } from "./intervals";

test("zwo: valid XML with escaped name, FTP% per zone, warmup/cooldown tags", () => {
  const zwo = buildZwo("4×8 threshold & test", [
    { name: "Warm up", seconds: 600, zone: "z1", phase: "warmup", note: "easy spin <60%" },
    { name: "On", seconds: 480, zone: "z4", phase: "active" },
    { name: "Off", seconds: 120, zone: "z1", phase: "recovery" },
    { name: "Cool down", seconds: 300, zone: "z1", phase: "cooldown" },
  ]);
  assert.ok(zwo.startsWith('<?xml version="1.0"'));
  assert.ok(zwo.includes("4×8 threshold &amp; test"), "name escaped");
  assert.ok(zwo.includes("<Warmup") && zwo.includes("<Cooldown"));
  assert.ok(zwo.includes('<SteadyState Power="100" Duration="480"/>'), "z4 = 100% FTP");
  assert.ok(zwo.includes("<IntervalsT"), "recovery tagged");
  assert.ok(zwo.includes("easy spin &lt;60%"), "note escaped");
});

test("zwo: unknown zone falls back to z2 power", () => {
  const zwo = buildZwo("t", [{ name: "x", seconds: 300, zone: "z9" }]);
  assert.ok(zwo.includes('Power="75"'));
});

test("zwo: minimum step duration enforced (5s floor, Intervals/Garmin safe)", () => {
  const zwo = buildZwo("t", [{ name: "sprint", seconds: 2, zone: "z7" }]);
  assert.ok(zwo.includes('Duration="5"'));
});
