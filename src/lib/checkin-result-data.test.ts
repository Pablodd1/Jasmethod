import assert from "node:assert/strict";
import test from "node:test";
import { checkinFuelBrands } from "./checkin-result-data";
import { fuelBrandsFor } from "./fuelbrands";

test("absent and legacy no-workout fuel suggestions do not become a renderable card", () => {
  for (const value of [undefined, null, [], {}, { note: "", brands: null }, { note: "", brands: [null] },
    { note: "", brands: [{ name: { invalid: true } }] }]) assert.equal(checkinFuelBrands(value), null);
});

test("real API fuel suggestion objects keep their display values without inventing defaults", () => {
  for (const minutes of [0, 45, 75, 120]) {
    const data = fuelBrandsFor(minutes);
    assert.deepEqual(checkinFuelBrands(data), data);
  }
  assert.deepEqual(checkinFuelBrands({ note: "None available", brands: [] }), { note: "None available", brands: [] });
});
