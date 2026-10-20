import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptedClientError, clientErrorPayload, readTelemetryBody } from "./client-error-payload";

test("automatic diagnostics never contain arbitrary exception prose or route identifiers", () => {
  const dirty = { name: "JaneFixture", message: "Jane Fixture has HRV 12 and chest pain", stack: "at JaneFixture" };
  const sent = clientErrorPayload(dirty, "/admin/athletes/jane-fixture?token=fixture");
  assert.deepEqual(sent, { kind: "other", route: "/admin/athletes/:id" });
  assert.deepEqual(acceptedClientError({ ...sent, ...dirty, userId: "other-athlete" }), { message: "Client error (other)", route: "/admin/athletes/:id" });
  assert.deepEqual(clientErrorPayload("Loading chunk 12 failed", "/today"), { kind: "chunk-load", route: "/today" });
  assert.equal(acceptedClientError({ kind: "Jane Fixture", route: "/Jane%20Fixture" }).message, "Client error (other)");
  assert.deepEqual(acceptedClientError(null), { message: "Client error (other)", route: "/" });
});

test("telemetry caps actual streamed bytes rather than trusting content length", async () => {
  assert.deepEqual(await readTelemetryBody(new Request("http://localhost", { method: "POST", body: '{"kind":"other"}' })), { kind: "other" });
  await assert.rejects(readTelemetryBody(new Request("http://localhost", { method: "POST", body: "x".repeat(4097) })), /too large/);
  await assert.rejects(readTelemetryBody(new Request("http://localhost", { method: "POST", body: "not JSON" })));
});
