import { createHash, timingSafeEqual } from "node:crypto";
import { GarminError, type garminConfig } from "./garmin-config";

type Config = ReturnType<typeof garminConfig>;
export const GARMIN_PERMISSIONS = ["ACTIVITY_EXPORT", "HEALTH_EXPORT", "WORKOUT_IMPORT"] as const;
export type GarminPermission = typeof GARMIN_PERMISSIONS[number];
export type GarminToken = { accessToken: string; refreshToken: string; expiresIn: number; refreshExpiresIn: number };
export type GarminProtocol = ReturnType<typeof createGarminProtocol>;
export const garminDigest = (value: string) => createHash("sha256").update(value).digest("base64url");
export const garminEqual = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function credential(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 16384 && !/[\u0000-\u0020\u007f]/.test(value); }
export function garminAuthorizationUrl(cfg: Config, state: string, verifier: string): string {
  const url = new URL("https://connect.garmin.com/oauth2Confirm");
  url.search = new URLSearchParams({ response_type: "code", client_id: cfg.clientId, redirect_uri: cfg.redirectUri,
    state, code_challenge: garminDigest(verifier), code_challenge_method: "S256" }).toString();
  // Garmin manages API sections and athlete permissions; arbitrary OAuth scopes are not supported.
  return url.toString();
}
export function parseGarminToken(value: unknown): GarminToken {
  if (!object(value) || !credential(value.access_token) || !credential(value.refresh_token)
      || typeof value.token_type !== "string" || value.token_type.toLowerCase() !== "bearer"
      || typeof value.expires_in !== "number" || !Number.isFinite(value.expires_in) || value.expires_in <= 600 || value.expires_in > 31_536_000
      || typeof value.refresh_token_expires_in !== "number" || !Number.isFinite(value.refresh_token_expires_in)
      || value.refresh_token_expires_in <= 600 || value.refresh_token_expires_in > 31_536_000)
    throw new GarminError("invalid_token", "Garmin did not return a complete, usable authorization.", 502);
  return { accessToken: value.access_token, refreshToken: value.refresh_token, expiresIn: value.expires_in, refreshExpiresIn: value.refresh_token_expires_in };
}
export function createGarminProtocol(fetcher: typeof fetch = fetch) {
  async function request(url: string, init: RequestInit): Promise<Response> {
    try { return await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) }); }
    catch { throw new GarminError("provider_outcome_unknown", "Garmin did not confirm the request. Reconnect before another authorization attempt.", 503); }
  }
  async function json(response: Response): Promise<unknown> {
    if (!response.ok) throw new GarminError(response.status === 429 ? "provider_rate_limited" : "provider_rejected",
      response.status === 429 ? "Garmin is rate limiting requests. Wait before reconnecting." : "Garmin rejected the authorization request.", 503);
    try {
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        if (reader) while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 65536) { await reader.cancel(); throw new Error(); }
          chunks.push(value);
        }
      } finally { reader?.releaseLock(); }
      const text = Buffer.concat(chunks).toString("utf8");
      return JSON.parse(text);
    } catch { throw new GarminError("invalid_response", "Garmin returned an unreadable authorization response.", 502); }
  }
  return {
    async token(cfg: Config, fields: Record<string, string>): Promise<GarminToken> {
      const response = await request("https://diauth.garmin.com/di-oauth2-service/oauth/token", {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
      });
      return parseGarminToken(await json(response));
    },
    async identity(accessToken: string) {
      const response = await request("https://apis.garmin.com/partner-gateway/rest/user/id", { headers: { Authorization: `Bearer ${accessToken}` } });
      const value = await json(response);
      if (!object(value) || typeof value.userId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value.userId))
        throw new GarminError("identity_unverified", "Garmin account ownership could not be verified.", 502);
      return value.userId;
    },
    async permissions(accessToken: string): Promise<GarminPermission[]> {
      const response = await request("https://apis.garmin.com/partner-gateway/rest/user/permissions", { headers: { Authorization: `Bearer ${accessToken}` } });
      const value = await json(response);
      if (!object(value) || !Array.isArray(value.permissions) || value.permissions.length > 30 || value.permissions.some(p => typeof p !== "string"))
        throw new GarminError("permissions_unverified", "Garmin permissions could not be verified.", 502);
      return GARMIN_PERMISSIONS.filter(p => (value.permissions as string[]).includes(p));
    },
    async revoke(accessToken: string) {
      const response = await request("https://apis.garmin.com/partner-gateway/rest/user/registration", { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok && response.status !== 404) throw new GarminError("revocation_unconfirmed", "Garmin revocation is unconfirmed. Remove JMM in Garmin Connect account settings.", 503);
    },
  };
}
