import test from "node:test";
import assert from "node:assert/strict";
import { clockSeconds, clockText, metricEntry } from "./metric-entry";
test("athletes enter clocks or minutes without calculating raw seconds", () => {
  for (const [text, seconds] of [["5:30",330],["1:15:30",4530],["1.5",90],["0:00",0],["0:00.5",.5]] as const) assert.equal(clockSeconds(text), seconds);
  for (const value of [0,.5,30,330,3600,86400]) assert.equal(clockSeconds(clockText(value)), value);
  for (const invalid of ["", "-1", "3:90", "1:60:00", "1e3", "junk"]) assert.throws(() => clockSeconds(invalid));
});
test("pace and speed adapters preserve canonical units and never fabricate missing values", () => {
  assert.equal(metricEntry("",true), "");
  assert.equal(Number(metricEntry("8:00",true,1.609344)),480/1.609344);
  assert.equal(Number(metricEntry("1:40",true,.9144)),100/.9144);
  assert.equal(Number(metricEntry("36",false,3.6)),10);
  assert.ok(Math.abs(Number(metricEntry("22,369362921",false,2.2369362921))-10)<1e-9);
  assert.throws(()=>metricEntry("invalid",false));
});
