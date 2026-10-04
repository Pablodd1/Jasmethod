import test from "node:test";
import assert from "node:assert/strict";
import { appMutationOriginAllowed } from "./request-origin";
test("mutation origin uses configured public URL behind a proxy and rejects forged origins", () => {
  const env = { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://app.example.invalid" };
  const req = (origin?: string, extra = {}) => new Request("http://localhost:3000/api/j-metrics/rest-day", { headers: { ...(origin ? { origin } : {}), ...extra } });
  assert.equal(appMutationOriginAllowed(req("https://app.example.invalid"), env), true);
  assert.equal(appMutationOriginAllowed(req(), env), false);
  assert.equal(appMutationOriginAllowed(req("https://other.example.invalid", { host: "other.example.invalid", "x-forwarded-host": "other.example.invalid" }), env), false);
  assert.equal(appMutationOriginAllowed(req("https://app.example.invalid", { "sec-fetch-site": "cross-site" }), env), false);
  assert.equal(appMutationOriginAllowed(req("http://localhost:3000"), env), false);
  assert.equal(appMutationOriginAllowed(req("http://localhost:3000"), { NODE_ENV: "production" }), false);
  assert.equal(appMutationOriginAllowed(req("http://app.example.invalid"), { NEXT_PUBLIC_APP_URL: "http://app.example.invalid" }), false);
  assert.equal(appMutationOriginAllowed(req("http://127.0.0.1:3220"), { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3220" }), true);
});
