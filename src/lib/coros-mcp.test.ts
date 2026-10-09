import test from "node:test";
import assert from "node:assert/strict";
import { createCorosMcpClient, type CorosReadToolName, type CorosRegion } from "./coros-mcp";
import { pollCorosSource } from "./coros-polling";

type Request = { jsonrpc: string; id: number; method: string; params: Record<string, any> };
function fixture(respond?: (request: Request) => Response | undefined | Promise<Response | undefined>) {
  const calls: Array<{ url: string; init: RequestInit; request: Request }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    const request = JSON.parse(String(init?.body)) as Request;
    calls.push({ url: String(url), init: init!, request });
    const custom = await respond?.(request);
    if (custom) return custom;
    const result = request.method === "initialize" ? { protocolVersion: "2025-06-18" }
      : request.method === "tools/list" ? { tools: [{ name: "queryDevices", inputSchema: { type: "object" } }, { name: "querySportRecords", inputSchema: { type: "object" } }, { name: "querySleepData", inputSchema: { type: "object" } }] }
        : { content: [{ type: "text", text: "[]" }], isError: false };
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  };
  return { calls, client: createCorosMcpClient({ region: "eu", accessToken: "synthetic-test-token", fetchImpl }) };
}
const json = (request: Request, result: unknown) => Response.json({ jsonrpc: "2.0", id: request.id, result });

test("COROS uses pinned regional stateless JSON-RPC without token setup or redirects", async () => {
  const { calls, client } = fixture();
  await client.callReadTool("queryDevices");
  assert.deepEqual(calls.map(c => c.request.method), ["initialize", "tools/list", "tools/call"]);
  for (const call of calls) {
    assert.equal(call.url, "https://mcpeu.coros.com/mcp");
    assert.equal(call.init.redirect, "error");
    assert.equal(call.init.cache, "no-store");
    assert.equal(new Headers(call.init.headers).get("Authorization"), "Bearer synthetic-test-token");
    assert.equal(new Headers(call.init.headers).has("Mcp-Session-Id"), false);
    assert.equal(new Headers(call.init.headers).has("MCP-Protocol-Version"), false);
  }
  assert.deepEqual(calls[2].request.params, { name: "queryDevices", arguments: {} });
  await client.listTools();
  assert.equal(calls.filter(c => c.request.method === "initialize").length, 1);
});

test("COROS initialization is shared across parallel requests and tool catalogs paginate", async () => {
  const { client, calls } = fixture(request => request.method === "tools/list" ? json(request, request.params.cursor
    ? { tools: [{ name: "querySleepData", inputSchema: { type: "object" } }] }
    : { tools: [{ name: "queryDevices", inputSchema: { type: "object" } }], nextCursor: "page-two" }) : undefined);
  const [tools] = await Promise.all([client.listTools(), client.initialize()]);
  assert.deepEqual(tools.map(t => t.name), ["queryDevices", "querySleepData"]);
  assert.equal(calls.filter(c => c.request.method === "initialize").length, 1);
  assert.equal(calls[2].request.params.cursor, "page-two");
});

test("COROS accepts an SSE result by matching JSON-RPC id, not unrelated notifications", async () => {
  const { client } = fixture(request => request.method === "tools/call" ? new Response(`: keepalive\r\n\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}\r\n\r\nevent: message\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: request.id, result: { content: [], structuredContent: { devices: [] } } })}\r\n\r\n`, { headers: { "content-type": "text/event-stream" } }) : undefined);
  assert.deepEqual((await client.callReadTool("queryDevices")).structuredContent, { devices: [] });
});

test("COROS refuses writes before HTTP, even if an unsafe caller bypasses TypeScript", async () => {
  const { client, calls } = fixture();
  await assert.rejects(client.callReadTool("createScheduledWorkout" as CorosReadToolName), { code: "write_disabled" });
  assert.equal(calls.length, 0);
});

test("COROS refuses missing read tools and never treats a tool error as imported data", async () => {
  const missing = fixture();
  await assert.rejects(missing.client.callReadTool("queryUserInfo"), { code: "tool_unavailable" });
  assert.equal(missing.calls.length, 2);
  const rejected = fixture(request => request.method === "tools/call" ? json(request, { content: [{ type: "text", text: "private rejection detail" }], isError: true }) : undefined);
  await assert.rejects(rejected.client.callReadTool("queryDevices"), error => error instanceof Error && !error.message.includes("private rejection detail") && (error as any).code === "tool_rejected");
});

test("COROS validates region and tokens without leaking or forwarding them", () => {
  for (const region of ["global", "https://attacker.invalid", "toString"]) assert.throws(() => createCorosMcpClient({ region: region as CorosRegion, accessToken: "synthetic-test-token" }), /authorized COROS/);
  for (const accessToken of ["", "synthetic\r\nInjected: yes", "Bearer already-prefixed"]) assert.throws(() => createCorosMcpClient({ region: "us", accessToken }), error => error instanceof Error && !error.message.includes(accessToken || "missing marker"));
  assert.throws(() => createCorosMcpClient({ region: "us", accessToken: "a".repeat(16 * 1024 + 1) }), /authorized COROS/);
});

test("COROS HTTP and fetch errors are sanitized and reads are not blindly retried", async () => {
  for (const status of [401, 403, 429, 500]) {
    const { client, calls } = fixture(() => new Response("synthetic-test-token private body", { status }));
    await assert.rejects(client.listTools(), error => error instanceof Error && !error.message.includes("synthetic-test-token") && (error as any).code === (status === 401 || status === 403 ? "authorization_required" : "http_error"));
    assert.equal(calls.length, 1);
  }
  const { client, calls } = fixture(() => { throw Error("synthetic-test-token"); });
  await assert.rejects(client.listTools(), { code: "transport_error" });
  assert.equal(calls.length, 1);
});

test("COROS rejects malformed JSON-RPC, unsupported version, cyclic pagination and oversized responses", async () => {
  for (const respond of [
    (r: Request) => Response.json({ jsonrpc: "2.0", id: r.id + 1, result: {} }),
    (r: Request) => json(r, { protocolVersion: "unverified-version" }),
    (r: Request) => r.method === "tools/list" ? json(r, { tools: [], nextCursor: "same" }) : undefined,
    (r: Request) => r.method === "tools/list" ? json(r, { tools: [{ name: "queryDevices", inputSchema: null }] }) : undefined,
    (r: Request) => r.method === "tools/list" ? json(r, { tools: Array.from({ length: 501 }, (_, i) => ({ name: `query${i}`, inputSchema: { type: "object" } })) }) : undefined,
    (_r: Request) => new Response(" ".repeat(2 * 1024 * 1024 + 1), { headers: { "content-type": "application/json" } }),
    (_r: Request) => new Response("bad json", { headers: { "content-type": "application/json" } }),
  ]) await assert.rejects(fixture(respond).client.listTools(), { code: "protocol_error" });
});

test("COROS aborts slow reads and bounds accumulated catalog pages", async () => {
  const client = createCorosMcpClient({ region: "us", accessToken: "synthetic-test-token", timeoutMs: 5, fetchImpl: (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))); }) });
  await assert.rejects(client.listTools(), { code: "transport_error" });
  const { client: paged, calls } = fixture(request => request.method === "tools/list" ? json(request, { tools: [], nextCursor: `next-${request.id}` }) : undefined);
  await assert.rejects(paged.listTools(), { code: "protocol_error" });
  assert.equal(calls.filter(c => c.request.method === "tools/list").length, 20);
});

test("COROS activity and health polling returns separate raw, unimported snapshots", async () => {
  const { client } = fixture();
  const activities = await pollCorosSource(client, { stream: "activities", tool: "querySportRecords", arguments: {} });
  const health = await pollCorosSource(client, { stream: "health", tool: "querySleepData", arguments: {} });
  assert.equal(activities.stream, "activities");
  assert.equal(health.stream, "health");
  for (const result of [activities, health]) {
    assert.equal(result.imported, false);
    assert.equal(result.normalized, false);
    assert.equal(result.deviceDeliveryEvidence, false);
    assert.ok(Date.parse(result.observedAt));
  }
  await assert.rejects(pollCorosSource(client, { stream: "activities", tool: "querySleepData", arguments: {} }), /inbound stream/);
  await assert.rejects(pollCorosSource(client, { stream: "health", tool: "createScheduledWorkout" as CorosReadToolName, arguments: {} }), /inbound stream/);
});
