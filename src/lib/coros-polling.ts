/** Inbound reads are independent of outbound workout delivery. No write calls. */
import { type CorosMcpClient, type CorosReadToolName } from "./coros-mcp";

const STREAM_TOOLS = {
  activities: ["querySportRecords", "getActivityDetail", "queryActivityLapData", "queryCustomActivityLapData"],
  health: ["queryDailyHealthData", "querySleepData", "querySleepHrv", "queryAvgHeartRate", "queryRestingHeartRate", "queryStressLevel", "queryHealthCheckTimeSeries", "queryStressTimeSeries", "queryRecoveryStatus"],
} as const;

/** Raw snapshots only; normalization/persistence require verified live schemas. */
export async function pollCorosSource(client: Pick<CorosMcpClient, "callReadTool">, input: {
  stream: keyof typeof STREAM_TOOLS;
  tool: CorosReadToolName;
  /** Arguments obtained from this connection's live tool schema, not guessed. */
  arguments: Record<string, unknown>;
}) {
  const allowed: readonly string[] | undefined = STREAM_TOOLS[input.stream];
  if (!allowed?.includes(input.tool)) throw new Error("The requested COROS tool does not belong to this inbound stream.");
  const raw = await client.callReadTool(input.tool, input.arguments);
  return {
    provider: "coros" as const, stream: input.stream, tool: input.tool,
    observedAt: new Date().toISOString(), raw,
    normalized: false as const, imported: false as const,
    deviceDeliveryEvidence: false as const,
  };
}
