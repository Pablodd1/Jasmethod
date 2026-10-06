import test from "node:test";
import assert from "node:assert/strict";
import { connectorHealth } from "./connector-health";

const now = Date.UTC(2026, 9, 5, 12);
const connected = { provider: "intervals", status: "connected", lastSyncAt: new Date(now - 60000), syncStartedAt: null };

test("a connected account with no successful import is not green", () => {
  assert.deepEqual(connectorHealth([{ ...connected, lastSyncAt: null }], now, true), {
    health: "amber", healthReasons: ["intervals:never_synced"],
  });
});
test("disabled, disconnected, empty and overdue imports are not green", () => {
  assert.equal(connectorHealth([connected], now, false).health, "amber");
  assert.equal(connectorHealth([{ ...connected, status: "disconnected" }], now, true).health, "amber");
  assert.equal(connectorHealth([], now, true).health, "amber");
  assert.equal(connectorHealth([{ ...connected, syncStartedAt: new Date(now - 31 * 60000) }], now, true).health, "amber");
});
test("errors dominate freshness while disabled errors remain disabled", () => {
  assert.equal(connectorHealth([connected, { ...connected, provider: "oura", status: "error" }], now, true).health, "red");
  assert.deepEqual(connectorHealth([{ ...connected, status: "error" }], now, false), {
    health: "amber", healthReasons: ["intervals:disabled"],
  });
});
test("stale and future timestamps cannot appear healthy", () => {
  for (const date of [new Date(now - 27 * 3600000), new Date(now + 60000), new Date(NaN)]) {
    assert.equal(connectorHealth([{ ...connected, lastSyncAt: date }], now, true).health, "amber");
  }
});
test("recent successful imports are green without implying device delivery", () => {
  assert.deepEqual(connectorHealth([connected], now, true), { health: "green", healthReasons: [] });
});
