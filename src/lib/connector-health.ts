type ConnectorHealthInput = {
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  syncStartedAt: Date | null;
};

/** Import freshness only. Never use this as a Garmin/watch delivery receipt. */
export function connectorHealth(connectors: ConnectorHealthInput[], now: number, intervalsEnabled: boolean) {
  const reasons: string[] = [];
  let failed = false;
  for (const c of connectors) {
    if (c.provider === "intervals" && !intervalsEnabled) {
      reasons.push(`${c.provider}:disabled`);
      continue;
    }
    if (c.status === "error") {
      failed = true;
      reasons.push(`${c.provider}:error`);
    } else if (c.status !== "connected") {
      reasons.push(`${c.provider}:${c.status}`);
    } else if (!c.lastSyncAt) {
      reasons.push(`${c.provider}:never_synced`);
    } else {
      const timestamp = c.lastSyncAt.getTime();
      if (!Number.isFinite(timestamp) || timestamp > now || now - timestamp > 26 * 3600000) {
        reasons.push(`${c.provider}:stale_or_invalid_sync_time`);
      }
    }
    if (c.syncStartedAt) {
      const started = c.syncStartedAt.getTime();
      if (!Number.isFinite(started) || started > now || now - started > 30 * 60000) {
        reasons.push(`${c.provider}:sync_overdue_or_invalid_start`);
      }
    }
  }
  if (!connectors.length) reasons.push("no_connectors");
  return { health: failed ? "red" : reasons.length ? "amber" : "green", healthReasons: reasons };
}
