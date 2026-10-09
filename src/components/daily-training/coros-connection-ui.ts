export type CorosConnectionStatus = {
  configured: boolean;
  authorizationAvailable: boolean;
  connectionStatus: string;
  reconnectRequired: boolean;
  localAccessStopped: boolean;
  requiresProviderRevocation: boolean;
  lastError?: string | null;
};
export type CorosConnectionAction = "authorize" | "refresh" | "disconnect";
const AUTH_HOSTS = new Set(["mcpus.coros.com", "mcpeu.coros.com", "mcpcn.coros.com"]);

/** Provider navigation is restricted even if an unexpected gateway response is returned. */
export function corosAuthorizationLocation(value: unknown): string {
  if (typeof value !== "string" || value.length > 16384) throw new Error("COROS returned an invalid authorization link.");
  const url = new URL(value);
  if (url.protocol !== "https:" || !AUTH_HOSTS.has(url.hostname) || url.port || url.username || url.password || url.hash || url.pathname !== "/oauth2/authorize") throw new Error("COROS returned an invalid authorization link.");
  if (!url.searchParams.get("state") || !url.searchParams.get("code_challenge") || url.searchParams.get("code_challenge_method") !== "S256" || url.searchParams.get("response_type") !== "code") throw new Error("COROS returned an incomplete authorization link.");
  return url.href;
}
export async function requestCorosConnection(action: CorosConnectionAction, consent: boolean, signal: AbortSignal, fetchImpl: typeof fetch = fetch) {
  if (action === "authorize" && consent !== true) throw new Error("Review and accept the COROS access disclosure first.");
  const response = await fetchImpl(`/api/connectors/coros/${action}`, {
    method: "POST", credentials: "same-origin", cache: "no-store", signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "authorize" ? { consent: true } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : response.status === 401 ? "Sign in again to manage your COROS connection." : "The COROS connection could not be updated. Refresh its status and retry.");
  if (action === "authorize") return { authorizationUrl: corosAuthorizationLocation(data?.authorizationUrl) };
  if (data?.ok !== true) throw new Error("COROS connection status was not confirmed. Refresh before trying again.");
  if (action === "disconnect" && (typeof data.remoteRevoked !== "boolean" || typeof data.requiresProviderRevocation !== "boolean")) throw new Error("COROS revocation status was not confirmed. Refresh the connection status.");
  return { remoteRevoked: data.remoteRevoked === true, requiresProviderRevocation: data.requiresProviderRevocation === true };
}
