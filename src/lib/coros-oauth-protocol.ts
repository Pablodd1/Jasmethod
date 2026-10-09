import { createHash, timingSafeEqual } from "crypto";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { COROS_OAUTH_ISSUERS, COROS_OAUTH_SCOPES, CorosOAuthError, type CorosIssuer, type CorosOAuthConfig } from "./coros-oauth-config";

export type CorosDiscovery = {
  issuer: CorosIssuer; authorization_endpoint: string; token_endpoint: string; jwks_uri: string;
  userinfo_endpoint: string; revocation_endpoint: string; publicRevocationSupported: boolean;
};
export type CorosGrant = { accessToken: string; refreshToken: string; expiresAt: Date; scope: string; idToken?: string };
export const corosDigest = (value: string) => createHash("sha256").update(value).digest("base64url");
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value: unknown, expected: string) => Array.isArray(value) && value.includes(expected);
export const corosTokenValid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 16_384 && /^[A-Za-z0-9._~+\/-]+=*$/.test(value);
export function corosScopesAllow(value: string): boolean {
  const scopes = new Set(value.split(/\s+/));
  return COROS_OAUTH_SCOPES.every(scope => scopes.has(scope));
}
function failed(code = "provider_response_invalid"): never {
  throw new CorosOAuthError(code, "COROS returned an unsupported authorization response. Disconnect and try again.", 502);
}

/** Pinned official regional issuer and exact metadata paths. Never follow redirects. */
export function validateCorosDiscovery(value: unknown, issuer: CorosIssuer): CorosDiscovery {
  if (!COROS_OAUTH_ISSUERS.includes(issuer) || !object(value) || value.issuer !== issuer) failed("issuer_mismatch");
  const paths = { authorization_endpoint: "/oauth2/authorize", token_endpoint: "/oauth2/token", jwks_uri: "/oauth2/jwks", userinfo_endpoint: "/userinfo", revocation_endpoint: "/oauth2/revoke" } as const;
  for (const [key, path] of Object.entries(paths)) if (value[key] !== `${issuer}${path}`) failed("issuer_mismatch");
  if (!has(value.response_types_supported, "code") || !has(value.grant_types_supported, "authorization_code") ||
      !has(value.grant_types_supported, "refresh_token") || !has(value.token_endpoint_auth_methods_supported, "none") ||
      !has(value.code_challenge_methods_supported, "S256") || !has(value.id_token_signing_alg_values_supported, "RS256") ||
      !COROS_OAUTH_SCOPES.every(scope => has(value.scopes_supported, scope))) failed();
  return { issuer, ...Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, `${issuer}${path}`])), publicRevocationSupported: has(value.revocation_endpoint_auth_methods_supported, "none") } as CorosDiscovery;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (!response.body || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) failed();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) { await reader.cancel(); failed(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { failed(); }
}

export function createCorosOAuthProtocol(fetchImpl: typeof fetch = fetch, now: () => Date = () => new Date()) {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      const response = await fetchImpl(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new CorosOAuthError("provider_request_failed", "COROS authorization could not be confirmed. Disconnect and try again.", 502);
      return response;
    } catch (error) {
      if (error instanceof CorosOAuthError) throw error;
      throw new CorosOAuthError("provider_request_failed", "COROS authorization could not be confirmed. Disconnect and try again.", 502);
    }
  }
  async function discover(issuer: CorosIssuer): Promise<CorosDiscovery> {
    if (!COROS_OAUTH_ISSUERS.includes(issuer)) failed("issuer_mismatch");
    return validateCorosDiscovery(await boundedJson(await request(`${issuer}/.well-known/openid-configuration`)), issuer);
  }
  async function tokens(metadata: CorosDiscovery, fields: Record<string, string>, previous?: CorosGrant): Promise<CorosGrant> {
    const response = await request(metadata.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(fields).toString() });
    return validateCorosGrant(await boundedJson(response), now(), previous);
  }
  async function identity(metadata: CorosDiscovery, cfg: Pick<CorosOAuthConfig, "clientId">, grant: CorosGrant, expected: { nonce?: string; subject?: string }): Promise<string> {
    try {
      if (grant.idToken) {
        const jwks = await boundedJson(await request(metadata.jwks_uri));
        if (!object(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length > 50) failed();
        const { payload } = await jwtVerify(grant.idToken, createLocalJWKSet(jwks as unknown as JSONWebKeySet), {
          issuer: metadata.issuer, audience: cfg.clientId, algorithms: ["RS256"], requiredClaims: ["sub", "iat", "exp"], currentDate: now(), clockTolerance: 5,
        });
        if (!validSubject(payload.sub) || (expected.nonce !== undefined && payload.nonce !== expected.nonce) ||
            (expected.subject !== undefined && payload.sub !== expected.subject) ||
            (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== cfg.clientId) ||
            (payload.azp !== undefined && payload.azp !== cfg.clientId) || typeof payload.iat !== "number" || payload.iat > now().getTime() / 1000 + 5) failed("identity_invalid");
        if (payload.at_hash !== undefined) {
          const expectedHash = createHash("sha256").update(grant.accessToken).digest().subarray(0, 16).toString("base64url");
          if (typeof payload.at_hash !== "string" || !safeEqual(payload.at_hash, expectedHash)) failed("identity_invalid");
        }
        return payload.sub;
      }
      // An initial OIDC code grant must contain an ID token. A refresh may omit it;
      // use the discovered TLS userinfo endpoint to recheck the already bound sub.
      if (!expected.subject || expected.nonce) failed("identity_invalid");
      const profile = await boundedJson(await request(metadata.userinfo_endpoint, { headers: { Authorization: `Bearer ${grant.accessToken}`, Accept: "application/json" } }));
      if (!object(profile) || !validSubject(profile.sub) || profile.sub !== expected.subject) failed("identity_invalid");
      return profile.sub;
    } catch { throw new CorosOAuthError("identity_invalid", "COROS account identity could not be verified. Disconnect and try again.", 502); }
  }
  async function revoke(metadata: CorosDiscovery, clientId: string, grant: Pick<CorosGrant, "accessToken" | "refreshToken">): Promise<boolean> {
    if (!metadata.publicRevocationSupported) return false;
    // Revoke refresh first, then access. RFC 7009 success is acknowledgement, not
    // independent introspection proof; no confidential-client secret is invented.
    for (const [hint, token] of [["refresh_token", grant.refreshToken], ["access_token", grant.accessToken]]) {
      const response = await request(metadata.revocation_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, token, token_type_hint: hint }).toString() });
      if (response.status !== 200) throw new CorosOAuthError("revocation_failed", "COROS did not acknowledge completed revocation.", 502);
    }
    return true;
  }
  return { discover, tokens, identity, revoke };
}
export type CorosOAuthProtocol = ReturnType<typeof createCorosOAuthProtocol>;
function validSubject(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 255 && !/[\u0000-\u0020\u007f]/.test(value); }
export function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function validateCorosGrant(value: unknown, now: Date, previous?: CorosGrant): CorosGrant {
  if (!object(value) || !corosTokenValid(value.access_token) || typeof value.token_type !== "string" || value.token_type.toLowerCase() !== "bearer" ||
      typeof value.expires_in !== "number" || !Number.isInteger(value.expires_in) || value.expires_in <= 0 || value.expires_in > 31_536_000) failed();
  const refreshToken = value.refresh_token === undefined ? previous?.refreshToken : value.refresh_token;
  const scope = value.scope === undefined ? previous?.scope || COROS_OAUTH_SCOPES.join(" ") : value.scope;
  if (!corosTokenValid(refreshToken) || typeof scope !== "string" || scope.length > 4096 || !corosScopesAllow(scope) ||
      (value.id_token !== undefined && (!corosTokenValid(value.id_token) || value.id_token.length > 16_384))) failed();
  return { accessToken: value.access_token, refreshToken, scope, expiresAt: new Date(now.getTime() + value.expires_in * 1000), ...(typeof value.id_token === "string" ? { idToken: value.id_token } : {}) };
}
export function corosAuthorizationUrl(cfg: CorosOAuthConfig, metadata: CorosDiscovery, input: { state: string; verifier: string; nonce: string }): string {
  const url = new URL(metadata.authorization_endpoint);
  url.search = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri,
    scope: COROS_OAUTH_SCOPES.join(" "), state: input.state, nonce: input.nonce,
    code_challenge: corosDigest(input.verifier), code_challenge_method: "S256", resource: `${cfg.issuer}/mcp` }).toString();
  return url.toString();
}
