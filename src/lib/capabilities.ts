// Server-owned capability switch. Missing or malformed values fail closed.
// Do not replace this with a NEXT_PUBLIC flag: routes and jobs must enforce it.
export function intervalsConnectorEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_INTERVALS_CONNECTOR === "true";
}

export const INTERVALS_DISABLED_MESSAGE = "Intervals.icu is disabled for this release. Use the daily plan and manual FIT download; saved connections are preserved.";

export function requireIntervalsConnector(): void {
  if (!intervalsConnectorEnabled()) {
    const error = Object.assign(new Error(INTERVALS_DISABLED_MESSAGE), { status: 503, definite: true });
    throw error;
  }
}

export function trainingCapabilities() {
  return { intervalsConnector: intervalsConnectorEnabled(), manualFitDownload: true };
}

// Optional scheduled delivery remains gated pending consent and review evidence.
export function automatedDeliveryEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ENABLE_AUTOMATED_DELIVERY === "true";
}
