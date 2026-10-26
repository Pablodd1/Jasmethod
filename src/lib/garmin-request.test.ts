import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGarminMutation, garminErrorResponse } from "./garmin-request";
import { GARMIN_CONSENT_VERSION, GARMIN_MANUAL_REVOCATION_VERSION } from "./garmin-config";
const env = { APP_URL: "https://app.example", NEXT_PUBLIC_APP_URL: "https://app.example" };
let identity = 0;
function request(body: unknown = { consent: GARMIN_CONSENT_VERSION }, origin = "https://app.example", query = "") {
  return new Request(`https://app.example/api/connectors/garmin/authorize${query}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
test("Garmin own-account request accepts explicit versioned consent", async () => {
  await validateGarminMutation(request(), `request-owner-${identity++}`, true, env);
});
for (const [name, body] of [["missing", {}], ["refused", { consent: false }], ["boolean", { consent: true }], ["legacy", { consent: "garmin-v0" }]]) {
  test(`Garmin ${name} consent cannot start authorization`, async () => {
    await assert.rejects(validateGarminMutation(request(body), `request-owner-${identity++}`, true, env), /Review Garmin/);
  });
}
for (const [name, req] of [
  ["cross origin", () => request(undefined, "https://attacker.example")],
  ["target athlete body", () => request({ consent: GARMIN_CONSENT_VERSION, athleteId: "other" })],
  ["target athlete query", () => request(undefined, undefined, "?athleteId=other")],
  ["oversized body", () => request({ consent: "a".repeat(2000) })],
  ["malformed JSON", () => new Request("https://app.example/api/connectors/garmin/authorize", { method: "POST", headers: { Origin: "https://app.example", "Content-Type": "application/json" }, body: "{" })],
] as const) {
  test(`Garmin rejects ${name}`, async () => { await assert.rejects(validateGarminMutation(req(), `request-owner-${identity++}`, true, env)); });
}
test("Garmin error receipt does not serialize transport or database exception details", async () => {
  const response = garminErrorResponse(new Error("fixture-secret database://private-host"));
  assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /fixture-secret|private-host/);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
test("Garmin manual recovery requires its own explicit report and cannot authorize a new grant", async () => {
  assert.deepEqual(await validateGarminMutation(request({ consent: GARMIN_MANUAL_REVOCATION_VERSION }), `request-owner-${identity++}`, false, env), { manualRevocationReported: true });
  await assert.rejects(validateGarminMutation(request({ consent: GARMIN_MANUAL_REVOCATION_VERSION }), `request-owner-${identity++}`, true, env));
  await assert.rejects(validateGarminMutation(request({ consent: true }), `request-owner-${identity++}`, false, env));
});
