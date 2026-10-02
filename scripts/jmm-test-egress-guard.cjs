/**
 * Test-only Node preload. Refuse remote app traffic during synthetic acceptance.
 * Never use this as an application security control or with a deployed database.
 *
 * Start the app with these explicit local-test settings (after local migrations):
 * DATABASE_URL=postgresql://TEST_USER@127.0.0.1:55432/jmm_launch_integration_test
 * DIRECT_URL=<same local URL> ENABLE_INTERVALS_CONNECTOR=false
 * ENABLE_AUTOMATED_DELIVERY=false JMM_EGRESS_LOG=/tmp/jmm-egress.log
 * NODE_OPTIONS='--require ./scripts/jmm-test-egress-guard.cjs'
 * npm start -- --hostname 127.0.0.1 --port 3220
 *
 * Run node --import tsx scripts/jmm-launch-integration.ts with the same database
 * URLs and JMM_EGRESS_LOG. No provider credentials should be present in either
 * process. CI should upload report.json / *.fit / *-decoded.json only, never a
 * browser-fixture.json, cookie, password, environment file or database dump.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");

for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const database = new URL(process.env[key] || "");
  assert.equal(database.protocol, "postgresql:", "Only PostgreSQL test URLs are permitted");
  assert.equal(database.hostname, "127.0.0.1", "Only the dedicated loopback test database is permitted");
  assert.equal(database.port, "55432", "Only the dedicated test port is permitted");
  assert.equal(database.pathname, "/jmm_launch_integration_test", "Only the dedicated test database is permitted");
  assert.equal(database.search, "", "Database URL query overrides are not permitted");
}
assert.notEqual(process.env.VERCEL_ENV, "production", "Never preload the test guard for a deployed environment");
const log = process.env.JMM_EGRESS_LOG;
assert.ok(log, "JMM_EGRESS_LOG must identify the local test's egress log");
fs.appendFileSync(log, "", { mode: 0o600 });

const loopback = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
function checkHost(value, transport) {
  if (!value) return; // Node's omitted host is its ordinary localhost default.
  let host = String(value);
  if (!loopback.has(host) && host.includes(":")) {
    try { host = new URL(`http://${host}`).hostname; } catch { /* fail closed below */ }
  }
  if (loopback.has(host)) return;
  // Hostnames only. Never persist a path, query, token, username or password.
  const safeHost = /^[a-z0-9.\-:[\]]+$/i.test(host) ? host : "<invalid-host>";
  fs.appendFileSync(log, JSON.stringify({ time: new Date().toISOString(), transport, host: safeHost }) + "\n");
  throw new Error("Remote networking is disabled for synthetic local acceptance");
}
const originalFetch = globalThis.fetch;
if (originalFetch) globalThis.fetch = function (input, init) {
  const value = typeof input === "string" || input instanceof URL ? input : input.url;
  checkHost(new URL(value).hostname, "fetch");
  return originalFetch.call(this, input, init);
};
for (const moduleName of ["node:http", "node:https"]) {
  const module = require(moduleName);
  for (const method of ["request", "get"]) {
    const original = module[method];
    module[method] = function (input, ...rest) {
      const options = typeof input === "string" || input instanceof URL ? new URL(input) : input;
      checkHost(options?.hostname || options?.host, `${moduleName}.${method}`);
      // A URL plus an options argument may override its hostname.
      if (rest[0] && typeof rest[0] === "object") checkHost(rest[0].hostname || rest[0].host, `${moduleName}.${method}`);
      return original.call(this, input, ...rest);
    };
  }
}
const net = require("node:net");
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node sometimes passes its normalized [options, callback] tuple internally.
  const value = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (value && typeof value === "object") checkHost(value.host || value.hostname, "net.connect");
  else if (typeof value === "number" && typeof args[1] === "string") checkHost(args[1], "net.connect");
  return originalConnect.apply(this, args);
};
