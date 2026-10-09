/** Public configuration validation only. This module never loads credentials or a database. */
export const COROS_OAUTH_ISSUERS = ["https://mcpus.coros.com", "https://mcpeu.coros.com", "https://mcpcn.coros.com"] as const;
export const COROS_OAUTH_SCOPES = ["openid", "offline_access", "mcp.tools"] as const;
export type CorosIssuer = typeof COROS_OAUTH_ISSUERS[number];
export type CorosOAuthConfig = { issuer: CorosIssuer; clientId: string; appOrigin: string; redirectUri: string };
export class CorosOAuthError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message); this.name = "CorosOAuthError";
  }
}
export function corosAppOrigin(env: Record<string, string | undefined> = process.env): string {
  try {
    const url = new URL(env.APP_URL || "");
    const local = env.NODE_ENV !== "production" && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!local && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    return url.origin;
  } catch { throw new CorosOAuthError("provider_unavailable", "COROS authorization is not configured.", 503); }
}
export function corosOAuthConfig(env: Record<string, string | undefined> = process.env): CorosOAuthConfig {
  const appOrigin = corosAppOrigin(env);
  if (env.ENABLE_COROS_CONNECTOR !== "true" || !COROS_OAUTH_ISSUERS.includes(env.COROS_ISSUER as CorosIssuer) ||
      !env.COROS_CLIENT_ID || !/^[A-Za-z0-9._~-]{1,256}$/.test(env.COROS_CLIENT_ID) || !env.TOKEN_ENCRYPTION_KEY || env.TOKEN_ENCRYPTION_KEY.length < 32) {
    throw new CorosOAuthError("provider_unavailable", "COROS authorization is not configured.", 503);
  }
  return { issuer: env.COROS_ISSUER as CorosIssuer, clientId: env.COROS_CLIENT_ID, appOrigin, redirectUri: `${appOrigin}/api/connectors/coros/callback` };
}
export function corosOAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  try { corosOAuthConfig(env); return true; } catch { return false; }
}
