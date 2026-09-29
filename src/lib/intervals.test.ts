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
  assert.ok(zwo.includes('<SteadyState Power="1.00" Duration="480"/>'), "z4 = 1.00x FTP (fractional scale)");
  assert.ok(zwo.includes('<SteadyState Power="0.55" Duration="120"/>'), "recovery = steady at z1 fraction");
  assert.ok(zwo.includes("easy spin &lt;60%"), "note escaped");
});

test("zwo: unknown zone falls back to z2 power", () => {
  const zwo = buildZwo("t", [{ name: "x", seconds: 300, zone: "z9" }]);
  assert.ok(zwo.includes('Power="0.75"'));
});

test("zwo: exact durations preserved (no clamping)", () => {
  const zwo = buildZwo("t", [{ name: "sprint", seconds: 5, zone: "z7" }]);
  assert.ok(zwo.includes('Duration="5"'), "5-second sprint stays 5 seconds");
});

test("zwo: warmup/cooldown use PowerLow/PowerHigh ramps", () => {
  const zwo = buildZwo("t", [{ name: "w", seconds: 600, zone: "z1", phase: "warmup" }]);
  assert.ok(zwo.includes("PowerLow=") && zwo.includes("PowerHigh="));
});
