// Read-only HTTP availability/authentication smoke. This does not prove signed-in UI or device delivery.
import assert from "node:assert/strict";
const origin = new URL(process.env.SMOKE_BASE_URL || "http://127.0.0.1:3220");
assert.ok(["http:", "https:"].includes(origin.protocol));
const pages = ["/", "/login", "/forgot-password", "/how-it-works", "/science", "/science/race-fuel", "/protocols", "/metrics", "/privacy", "/terms", "/help", "/coach"];
const privateApis = ["/api/assistant", "/api/today", "/api/profile"];
let failed = 0;
for (const path of [...pages, ...privateApis]) {
  try {
    const response = await fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(20000) });
    assert.equal(response.status, privateApis.includes(path) ? 401 : 200);
    if (!privateApis.includes(path)) {
      const html = await response.text();
      assert.match(html, /<html/);
      if (path === "/coach") { assert.match(html, /noindex/); assert.match(html, /J Koach/); }
    }
    console.log(`PASS ${path} ${response.status}`);
  } catch (error) { failed++; console.error(`FAIL ${path}: ${error instanceof Error ? error.message : "request failed"}`); }
}
console.log(JSON.stringify({ check: "public-http-and-unauthenticated-api", passed: pages.length + privateApis.length - failed, failed, authenticatedUi: "not tested", hardwareDelivery: "not tested" }));
process.exitCode = failed ? 1 : 0;
