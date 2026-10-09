import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CorosConnectActions } from "./CorosConnectActions";
import { corosAuthorizationLocation, requestCorosConnection, type CorosConnectionStatus } from "./coros-connection-ui";
const authorizationUrl = "https://mcpus.coros.com/oauth2/authorize?state=fixture&code_challenge=fixture&code_challenge_method=S256&response_type=code";
test("COROS authorization link is pinned to regional HTTPS PKCE endpoint", () => {
  assert.equal(corosAuthorizationLocation(authorizationUrl), authorizationUrl);
  for (const bad of [undefined, "https://attacker.invalid/oauth2/authorize", authorizationUrl.replace("https:", "http:"), authorizationUrl.replace("/oauth2/authorize", "/elsewhere"), authorizationUrl.replace("mcpus.coros.com", "mcpus.coros.com.attacker.invalid"), authorizationUrl.replace("S256", "plain"), authorizationUrl + "#token", authorizationUrl.replace("https://", "https://user:pass@")]) assert.throws(() => corosAuthorizationLocation(bad));
});
test("COROS connect refuses absent disclosure consent before fetching", async () => {
  let calls = 0;
  await assert.rejects(requestCorosConnection("authorize", false, new AbortController().signal, async () => { calls++; return Response.json({}); }), /disclosure/);
  assert.equal(calls, 0);
});
test("COROS connect sends explicit consent and consumes validated redirect only", async () => {
  const signal = new AbortController().signal;
  const result = await requestCorosConnection("authorize", true, signal, async (url, init) => {
    assert.equal(url, "/api/connectors/coros/authorize"); assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.equal(init?.signal, signal);
    assert.deepEqual(JSON.parse(String(init?.body)), { consent: true });
    return Response.json({ authorizationUrl });
  });
  assert.deepEqual(result, { authorizationUrl });
});
test("COROS malformed success and authorization expiry never claim connection", async () => {
  for (const response of [Response.json({ ok: false }), Response.json({}), new Response("<html>login</html>", { status: 401 })]) await assert.rejects(requestCorosConnection("refresh", false, new AbortController().signal, async () => response));
  await assert.rejects(requestCorosConnection("authorize", true, new AbortController().signal, async () => Response.json({ authorizationUrl: "https://attacker.invalid" })), /authorization link/);
});
test("COROS disconnect distinguishes local removal from remote revocation", async () => {
  const result = await requestCorosConnection("disconnect", false, new AbortController().signal, async () => Response.json({ ok: true, remoteRevoked: false, requiresProviderRevocation: true }));
  assert.deepEqual(result, { remoteRevoked: false, requiresProviderRevocation: true });
  await assert.rejects(requestCorosConnection("disconnect", false, new AbortController().signal, async () => Response.json({ ok: true })), /revocation status/);
});
const status: CorosConnectionStatus = { configured: true, authorizationAvailable: true, connectionStatus: "disconnected", reconnectRequired: false, localAccessStopped: true, requiresProviderRevocation: false };
for (const es of [false, true]) test(`COROS connection UI starts with unchecked broad-grant disclosure (${es ? "ES" : "EN"})`, () => {
  const html = renderToStaticMarkup(createElement(CorosConnectActions, { state: status, es, onChange: async () => {} }));
  assert.match(html, /offline_access/); assert.match(html, /mcp.tools/);
  assert.match(html, /type="checkbox"/); assert.ok(!html.includes("checked="));
  assert.match(html, /disabled=""/);
  assert.match(html, es ? /no importa actividades ni publica entrenamientos/ : /does not import activities or publish workouts/);
});
test("COROS UI does not present unconfigured OAuth as connectable or a grant as sync", () => {
  const unavailable = renderToStaticMarkup(createElement(CorosConnectActions, { state: { ...status, configured: false, authorizationAvailable: false }, es: false, onChange: async () => {} }));
  assert.ok(!unavailable.includes("type=\"checkbox\"")); assert.match(unavailable, /approved OAuth setup/);
  const connected = renderToStaticMarkup(createElement(CorosConnectActions, { state: { ...status, connectionStatus: "authorized" }, es: false, onChange: async () => {} }));
  assert.match(connected, /Account authorized; sync disabled/);
  const revoked = renderToStaticMarkup(createElement(CorosConnectActions, { state: { ...status, connectionStatus: "revocation_required", requiresProviderRevocation: true }, es: false, onChange: async () => {} }));
  assert.match(revoked, /Remote revocation is not confirmed/);
});
