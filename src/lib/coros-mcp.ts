/** Stateless COROS MCP transport, using an already-authorized token only. */
export const COROS_MCP_ENDPOINTS = Object.freeze({
  us: "https://mcpus.coros.com/mcp",
  eu: "https://mcpeu.coros.com/mcp",
  cn: "https://mcpcn.coros.com/mcp",
} as const);
export type CorosRegion = keyof typeof COROS_MCP_ENDPOINTS;
const PROTOCOL_VERSION = "2025-06-18";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_CATALOG_PAGES = 20;
const MAX_CATALOG_TOOLS = 500;
const MAX_CATALOG_BYTES = 4 * 1024 * 1024;
const MAX_TOKEN_LENGTH = 16 * 1024;

export const COROS_READ_TOOLS = Object.freeze([
  "querySportRecords", "getActivityDetail", "analyzeActivityDetail", "queryActivityLapData", "queryCustomActivityLapData",
  "queryDailyHealthData", "querySleepData", "querySleepHrv", "queryAvgHeartRate", "queryRestingHeartRate", "queryStressLevel",
  "queryHealthCheckTimeSeries", "queryStressTimeSeries", "queryRecoveryStatus", "queryMenstruationCycles",
  "queryFitnessAssessmentOverview", "queryTrainingLoadAssessment", "queryTrainingSchedule", "queryTrainingPlanLibrary",
  "queryTrainingPlanDetails", "queryWorkoutLibrary", "queryWorkoutDetails", "queryScheduledWorkoutDetails", "queryDevices", "queryUserInfo",
] as const);
export type CorosReadToolName = typeof COROS_READ_TOOLS[number];
export interface CorosToolDefinition { name: string; description?: string; inputSchema: Record<string, unknown>; }
export interface CorosToolResult { content: unknown[]; structuredContent?: Record<string, unknown>; isError?: false; }
export class CorosMcpError extends Error {
  constructor(message: string, public readonly code: "authorization_required" | "invalid_configuration" | "transport_error" | "http_error" | "protocol_error" | "tool_unavailable" | "tool_rejected" | "write_disabled", public readonly status = 502) {
    super(message); this.name = "CorosMcpError";
  }
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function protocolError(): never { throw new CorosMcpError("COROS returned an invalid or unsupported MCP response.", "protocol_error"); }

async function readEnvelope(response: Response, id: number): Promise<Record<string, unknown>> {
  if (!response.body) protocolError();
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); protocolError(); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = Buffer.concat(parts).toString("utf8");
  const type = response.headers.get("content-type")?.split(";", 1)[0].trim();
  let messages: unknown[];
  try {
    if (type === "application/json") messages = [JSON.parse(data)];
    else if (type === "text/event-stream") {
      messages = data.replace(/\r\n/g, "\n").split(/\n\n/).map(event => event.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n")).filter(Boolean).map(line => JSON.parse(line));
    } else protocolError();
  } catch { protocolError(); }
  const matches = messages.filter(value => object(value) && value.jsonrpc === "2.0" && value.id === id);
  if (matches.length !== 1 || !object(matches[0])) protocolError();
  const envelope = matches[0];
  if ("error" in envelope) throw new CorosMcpError("COROS rejected the MCP request. Refresh the authorized connection or inspect the current tool schema.", "protocol_error");
  if (!object(envelope.result)) protocolError();
  return envelope.result;
}

export function createCorosMcpClient(options: {
  /** Region from the authorized connection. Never infer it from athlete location. */
  region: CorosRegion;
  /** Must originate from the caller's existing, user-authorized connection. */
  accessToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}) {
  const endpoint = COROS_MCP_ENDPOINTS[options.region];
  if (!Object.prototype.hasOwnProperty.call(COROS_MCP_ENDPOINTS, options.region) || !endpoint || typeof options.accessToken !== "string" || options.accessToken.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9._~+\/-]+=*$/.test(options.accessToken)) throw new CorosMcpError("An existing authorized COROS regional connection is required.", "invalid_configuration", 503);
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new CorosMcpError("Invalid COROS request timeout.", "invalid_configuration", 503);
  const authorization = `Bearer ${options.accessToken}`;
  const fetchImpl = options.fetchImpl ?? fetch;
  let sequence = 0;
  let initialization: Promise<void> | undefined;

  async function request(method: "initialize" | "tools/list" | "tools/call", params: Record<string, unknown>) {
    const id = ++sequence;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST", redirect: "error", cache: "no-store", signal: controller.signal,
        // Match COROS's published stateless helper: protocolVersion is sent in
        // initialize, not an MCP-Protocol-Version header. No session header or
        // notifications/initialized is used. Live acceptance remains pending.
        headers: { Authorization: authorization, Accept: "application/json, text/event-stream", "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
      if (response.status === 401 || response.status === 403) throw new CorosMcpError("The COROS connection needs authorization again.", "authorization_required", 401);
      if (!response.ok) throw new CorosMcpError(`COROS MCP returned HTTP ${response.status}.`, "http_error");
      return await readEnvelope(response, id);
    } catch (error) {
      if (error instanceof CorosMcpError) throw error;
      // Do not expose error bodies, request headers, tokens, or fetch error text.
      throw new CorosMcpError("COROS MCP could not be reached or returned an incomplete response.", "transport_error");
    } finally { clearTimeout(timer); }
  }
  async function initialize(): Promise<void> {
    if (!initialization) initialization = request("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "jmm-coros-readonly", version: "1.0.0" } }).then(result => {
      if (result.protocolVersion !== PROTOCOL_VERSION) protocolError();
    }).catch(error => { initialization = undefined; throw error; });
    return initialization;
  }
  async function listTools(): Promise<CorosToolDefinition[]> {
    await initialize();
    const tools: CorosToolDefinition[] = [];
    const cursors = new Set<string>();
    const names = new Set<string>();
    let catalogBytes = 0;
    let cursor: string | undefined;
    for (let page = 0; page < MAX_CATALOG_PAGES; page++) {
      const result = await request("tools/list", cursor ? { cursor } : {});
      if (!Array.isArray(result.tools)) protocolError();
      for (const tool of result.tools) {
        catalogBytes += Buffer.byteLength(JSON.stringify(tool));
        if (tools.length >= MAX_CATALOG_TOOLS || catalogBytes > MAX_CATALOG_BYTES) protocolError();
        if (!object(tool) || typeof tool.name !== "string" || !tool.name || names.has(tool.name) || !object(tool.inputSchema) || tool.inputSchema.type !== "object") protocolError();
        if (tool.description !== undefined && typeof tool.description !== "string") protocolError();
        names.add(tool.name);
        tools.push({ name: tool.name, inputSchema: tool.inputSchema, ...(typeof tool.description === "string" ? { description: tool.description } : {}) });
      }
      if (result.nextCursor === undefined) return tools;
      if (typeof result.nextCursor !== "string" || !result.nextCursor || cursors.has(result.nextCursor)) protocolError();
      cursor = result.nextCursor;
      cursors.add(cursor);
    }
    return protocolError();
  }
  async function callReadTool(name: CorosReadToolName, args: Record<string, unknown> = {}): Promise<CorosToolResult> {
    if (!(COROS_READ_TOOLS as readonly string[]).includes(name)) throw new CorosMcpError("COROS write tools are disabled until their wire schemas and receipts are verified.", "write_disabled", 503);
    if (!object(args)) throw new CorosMcpError("COROS read arguments must match the inspected live tool schema.", "invalid_configuration", 422);
    // Discover each time: provider catalogs can differ across regions/deploys.
    // Argument field names remain the caller's schema-driven responsibility.
    const catalog = await listTools();
    if (!catalog.some(tool => tool.name === name)) throw new CorosMcpError("The current COROS connection does not expose this tool.", "tool_unavailable", 503);
    const result = await request("tools/call", { name, arguments: args });
    if (result.isError === true) throw new CorosMcpError("COROS rejected the read request; no data was imported.", "tool_rejected");
    if (!Array.isArray(result.content) || (result.isError !== undefined && result.isError !== false) || (result.structuredContent !== undefined && !object(result.structuredContent))) protocolError();
    return { content: result.content, ...(object(result.structuredContent) ? { structuredContent: result.structuredContent } : {}), ...(result.isError === false ? { isError: false as const } : {}) };
  }
  return { initialize, listTools, callReadTool };
}

export type CorosMcpClient = ReturnType<typeof createCorosMcpClient>;
