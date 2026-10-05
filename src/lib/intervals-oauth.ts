import { prisma } from "./db";
import { decryptSecret } from "./crypto";
import { providerFetch } from "./provider-fetch";
import { intervalsConnectorEnabled } from "./capabilities";

// Official contract: https://forum.intervals.icu/t/intervals-icu-oauth-support/2759
export const INTERVALS_REQUIRED_SCOPES = ["ACTIVITY:READ", "WELLNESS:READ", "CALENDAR:WRITE"] as const;
type OAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };

export class IntervalsOAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = "IntervalsOAuthError";
  }
}

export function intervalsOAuthConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return intervalsConnectorEnabled(env) && !!env.INTERVALS_CLIENT_ID && !!env.INTERVALS_CLIENT_SECRET && !!env.TOKEN_ENCRYPTION_KEY;
}

export function intervalsScopesAllow(scope: string | null | undefined, required: readonly string[]): boolean {
  const granted = new Set((scope || "").split(/[\s,]+/).filter(Boolean).map(value => value.toUpperCase()));
  return required.every(value => granted.has(value) || (value.endsWith(":READ") && granted.has(value.replace(/:READ$/, ":WRITE"))));
}

export function intervalsAuthUrl(cfg: OAuthConfig, state: string): string {
  const params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri,
    response_type: "code", scope: INTERVALS_REQUIRED_SCOPES.join(","), state });
  return `https://intervals.icu/oauth/authorize?${params}`;
}

export function validateIntervalsGrant(value: unknown): { access_token: string; scope: string; athlete: { id: string }; token_type: "Bearer" } {
  const token = value as Record<string, any> | null;
  const identity = token?.athlete?.id;
  if (!token || typeof token.access_token !== "string" || !token.access_token || /\s/.test(token.access_token) ||
    typeof token.token_type !== "string" || token.token_type.toLowerCase() !== "bearer" ||
    !["string", "number"].includes(typeof identity) || !/^[A-Za-z0-9_-]{1,100}$/.test(String(identity))) {
    throw new IntervalsOAuthError("invalid_token_response", "Intervals.icu did not return a valid account authorization.", 502);
  }
  if (typeof token.scope !== "string" || !intervalsScopesAllow(token.scope, INTERVALS_REQUIRED_SCOPES)) {
    throw new IntervalsOAuthError("insufficient_scope", "Allow activities, wellness and calendar access to finish connecting.");
  }
  return { access_token: token.access_token, token_type: "Bearer", athlete: { id: String(identity) },
    scope: [...new Set(token.scope.split(/[\s,]+/).filter(Boolean).map((s: string) => s.toUpperCase()))].join(",") };
}

export async function intervalsExchangeToken(cfg: OAuthConfig, code: string) {
  try {
    // Codes expire after two minutes; exchange immediately, never retry this POST.
    const response = await providerFetch("https://intervals.icu/api/oauth/token", {
      method: "POST", redirect: "error", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code }).toString(),
    });
    if (!response.ok) throw new IntervalsOAuthError("token_exchange_failed", "Intervals.icu authorization could not be completed. Connect again.", 502);
    return validateIntervalsGrant(await response.json());
  } catch (error) {
    // Never propagate provider bodies, transport errors, credentials or codes.
    if (error instanceof IntervalsOAuthError) throw error;
    throw new IntervalsOAuthError("token_exchange_failed", "Intervals.icu authorization could not be completed. Connect again.", 502);
  }
}

/** Internal callers must first establish authority to act for userId. */
export async function getIntervalsAuthorization(userId: string, requiredScopes: readonly string[] = INTERVALS_REQUIRED_SCOPES) {
  if (!intervalsConnectorEnabled()) throw new IntervalsOAuthError("provider_unavailable", "Intervals.icu is not enabled.", 503);
  const connector = await prisma.connector.findUnique({ where: { userId_provider: { userId, provider: "intervals" } } });
  if (!connector || !["connected", "error"].includes(connector.status) || !connector.externalRef ||
    !connector.tokenEnc?.startsWith("enc:v1:") || !connector.scope || connector.scope === "api_key" ||
    !intervalsScopesAllow(connector.scope, requiredScopes) || (connector.expiresAt && connector.expiresAt <= new Date())) {
    throw new IntervalsOAuthError("reconnect_required", "Reconnect Intervals.icu and allow the requested permissions.", 409);
  }
  let accessToken = "";
  try { accessToken = decryptSecret(connector.tokenEnc); } catch { /* Static error below. */ }
  if (!accessToken || /\s/.test(accessToken)) throw new IntervalsOAuthError("reconnect_required", "Reconnect Intervals.icu to restore access.", 409);
  return { authorization: `Bearer ${accessToken}`, athleteId: connector.externalRef, oauth: true as const };
}

/** Disconnect stays available when the feature flag is off. No new OAuth is started. */
export async function disconnectIntervals(userId: string) {
  const connector = await prisma.connector.findUnique({ where: { userId_provider: { userId, provider: "intervals" } } });
  if (!connector) return { ok: true, remoteRevoked: false, legacyCredential: false };
  const identity = { id: connector.id, userId, tokenEnc: connector.tokenEnc };
  const legacyCredential = !!connector.tokenEnc && (!connector.scope || connector.scope === "api_key");
  // Stop local work and revoke automatic-publication consent together. A later
  // reconnect, including to the same account, requires a fresh explicit opt-in.
  // Keep provider requests outside the short database transaction.
  await prisma.$transaction(async tx => {
    const claimed = await tx.connector.updateMany({ where: identity, data: { status: "disconnecting", lastError: null } });
    if (claimed.count !== 1) throw new IntervalsOAuthError("connection_changed", "The connection changed. Refresh and retry disconnecting.", 409);
    await tx.auditLog.create({ data: { actorId: userId, subjectId: userId, action: "intervals.auto_publish",
      after: JSON.stringify({ version: 1, enabled: false, externalRef: connector.externalRef }) } });
  });
  let remoteRevoked = false;
  if (connector.tokenEnc && !legacyCredential) {
    // Halt local background activity first, but retain the credential for a
    // retry if provider revocation fails. Never erase it and claim remote success.
    try {
      const accessToken = decryptSecret(connector.tokenEnc);
      if (!accessToken || /\s/.test(accessToken)) throw new Error("invalid_credential");
      const response = await providerFetch("https://intervals.icu/api/v1/disconnect-app", {
        method: "DELETE", redirect: "error", headers: { Authorization: `Bearer ${accessToken}` },
      });
      // Unauthorized means this token already cannot access the provider.
      if (!response.ok && response.status !== 401) throw new Error("revocation_rejected");
      remoteRevoked = response.ok;
    } catch {
      await prisma.connector.updateMany({ where: { ...identity, status: "disconnecting" }, data: {
        lastError: "Local sync is stopped. Provider revocation failed; retry disconnecting.",
      } });
      throw new IntervalsOAuthError("revocation_failed", "Local sync is stopped, but Intervals.icu revocation could not be confirmed. Retry disconnecting.", 502);
    }
  }
  const cleared = await prisma.connector.updateMany({ where: identity, data: {
    status: "disconnected", tokenEnc: null, refreshEnc: null, expiresAt: null, scope: null,
    externalRef: null, lastError: null, syncStartedAt: null,
  } });
  if (cleared.count !== 1) throw new IntervalsOAuthError("connection_changed", "The connection changed. Refresh and retry disconnecting.", 409);
  return { ok: true, remoteRevoked, legacyCredential };
}
