import { GarminError, garminOrigin, GARMIN_CONSENT_VERSION, GARMIN_MANUAL_REVOCATION_VERSION, type GarminEnvironment } from "./garmin-config";
import { appMutationOriginAllowed } from "./request-origin";
import { rateLimit } from "./ratelimit";

export async function validateGarminMutation(req: Request, userId: string, consentRequired: boolean, env: GarminEnvironment = process.env) {
  garminOrigin(env);
  if (!appMutationOriginAllowed(req, env)) throw new GarminError("invalid_origin", "Open this action from JMM Connections.", 403);
  if (new URL(req.url).search || req.method !== "POST" || !/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || ""))
    throw new GarminError("invalid_request", "Use the own-account Garmin controls in JMM Connections.");
  if (!rateLimit(`garmin-oauth:${userId}`, 5, 60_000).ok) throw new GarminError("rate_limited", "Wait a minute before another Garmin authorization request.", 429);
  if (Number(req.headers.get("content-length") || 0) > 1024) throw new GarminError("invalid_request", "Authorization request is too large.", 413);
  const reader = req.body?.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new GarminError("invalid_request", "Authorization request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new GarminError("invalid_request", "Send a valid authorization request."); }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => k !== "consent"))
    throw new GarminError("own_account_required", "Use only your own Garmin account.", 403);
  if (consentRequired && (body as Record<string, unknown>).consent !== GARMIN_CONSENT_VERSION)
    throw new GarminError("consent_required", "Review Garmin's permissions and the JMM data-use disclosure before connecting.");
  const consent = (body as Record<string, unknown>).consent;
  if (!consentRequired && consent !== undefined && consent !== GARMIN_MANUAL_REVOCATION_VERSION)
    throw new GarminError("invalid_request", "Use the explicit manual-removal control after removing JMM in Garmin.");
  return { manualRevocationReported: !consentRequired && consent === GARMIN_MANUAL_REVOCATION_VERSION };
}
export function garminErrorResponse(error: unknown) {
  return Response.json({ code: error instanceof GarminError ? error.code : "connection_failed",
    error: error instanceof GarminError ? error.message : "The Garmin operation could not be confirmed. Refresh before trying again." },
    { status: error instanceof GarminError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
}
