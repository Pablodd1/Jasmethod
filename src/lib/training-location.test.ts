import test from "node:test";
import assert from "node:assert/strict";
import { isTrainingLocation, locationSearchInput, searchTrainingLocations } from "./training-location";

test("city and ZIP lookup preserves qualifiers and returns choices rather than guessing a match", async () => {
  for (const query of ["Miami, FL", "33101"]) {
    let url = "";
    const result = await searchTrainingLocations(locationSearchInput({ query }), async input => {
      url = String(input);
      return Response.json({ results: [{ name: "Miami", admin1: "Florida", country: "United States", latitude: 25.77, longitude: -80.19, timezone: "America/New_York" }, { name: "Miami", admin1: "Oklahoma", country: "United States", latitude: 36.87, longitude: -94.87, timezone: "America/Chicago" }] });
    });
    assert.equal(new URL(url).searchParams.get("name"), query);
    assert.equal(result.length, 2); assert.equal(result[0].timeZone, "America/New_York"); assert.match(result[1].label, /Oklahoma/);
  }
});
test("location lookup rejects injected fields and invalid provider coordinates/timezones; errors do not become weather", async () => {
  for (const raw of [{ query: "x" }, { query: "Miami", athleteId: "other" }, { query: "a".repeat(121) }, { query: "Miami\nFL" }]) assert.throws(() => locationSearchInput(raw));
  const invalid = { label: "Miami", latitude: 25, longitude: -80, timeZone: "bad-zone" };
  assert.equal(isTrainingLocation(invalid), false); assert.equal(isTrainingLocation({ ...invalid, timeZone: "UTC", latitude: Infinity }), false);
  assert.deepEqual(await searchTrainingLocations("Miami", async () => Response.json({ results: [{ name: "Miami", latitude: 100, longitude: 0, timezone: "UTC" }, null] })), []);
  await assert.rejects(() => searchTrainingLocations("Miami", async () => new Response("unavailable", { status: 503 })));
  await assert.rejects(() => searchTrainingLocations("Miami", async () => new Response("x".repeat(65537), { headers: { "content-type": "application/json" } })));
  assert.deepEqual(await searchTrainingLocations("Miami", async () => Response.json({})), []);
});
