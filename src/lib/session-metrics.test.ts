import test from "node:test";
import assert from "node:assert/strict";
import { plannedMechanicalWork, plannedWorkLabel, targetSpeedLabel } from "./session-metrics";
import { normalizeSteps, resolveStepTarget } from "./canonical-session";

const steps = () => normalizeSteps([
  { name: "Warm", seconds: 600, zone: "z1", phase: "warmup" },
  { name: "Steady", seconds: 2400, zone: "z2", phase: "active" },
  { name: "Cool", seconds: 600, zone: "z1", phase: "cooldown" },
], "bike", { ftp: 200 });

test("cycling zone target has a real band and timed watts produce planned kJ", () => {
  const rows = steps();
  assert.equal(rows[1].target.low, 111);
  assert.equal(rows[1].target.high, 150);
  assert.deepEqual(plannedMechanicalWork(rows, "bike"), { lowKj: 266.4, highKj: 492 });
  assert.equal(plannedWorkLabel(rows, "bike"), "Planned mechanical work: 266–492 kJ");
  assert.match(plannedWorkLabel(rows, "bike", true)!, /previsto.*kJ/);
});

test("work remains unknown for open effort, non-time endpoints and mixed legs", () => {
  const rows = steps();
  assert.equal(plannedMechanicalWork([{ ...rows[0], endpoint: { type: "lap" } }], "bike"), null);
  assert.equal(plannedMechanicalWork([{ ...rows[0], endpoint: { type: "distance", meters: 1000 } }], "bike"), null);
  assert.equal(plannedMechanicalWork([{ ...rows[0], target: { type: "open", source: "effort", label: "RPE 3" } }], "bike"), null);
  assert.equal(plannedMechanicalWork([...rows, { ...rows[0], componentSport: "run" }], "brick"), null);
  assert.equal(plannedMechanicalWork(rows, "run"), null);
  assert.equal(plannedMechanicalWork([], "bike"), null);
});

test("speed conversion uses only explicit pace/speed targets and athlete units", () => {
  const pace = resolveStepTarget({ zone: "z2", target: { type: "pace", low: 300, high: 360 } }, "run");
  assert.equal(targetSpeedLabel(pace), "10.0–12.0 km/h");
  assert.equal(targetSpeedLabel(pace, "imperial"), "6.2–7.5 mph");
  const speed = resolveStepTarget({ zone: "z2", target: { type: "speed", low: 5, high: 5 } }, "bike");
  assert.equal(targetSpeedLabel(speed), "18.0 km/h");
  assert.equal(targetSpeedLabel(steps()[1].target), null);
  assert.equal(targetSpeedLabel({ ...pace, low: NaN }), null);
});

test("unbounded highest zone does not invent finite power or HR targets", () => {
  assert.equal(resolveStepTarget({ zone: "z7" }, "bike", { ftp: 250 }).type, "open");
  assert.equal(resolveStepTarget({ zone: "z7" }, "run", { lthr: 170 }).type, "open");
  assert.equal(resolveStepTarget({ zone: "z2" }, "bike").type, "open");
  assert.deepEqual([resolveStepTarget({ zone: "z2" }, "run", { lthr: 170 }).low, resolveStepTarget({ zone: "z2" }, "run", { lthr: 170 }).high], [137, 151]);
});
