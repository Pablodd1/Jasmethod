import { corosAppOrigin, CorosOAuthError } from "./coros-oauth-config";
import { appMutationOriginAllowed } from "./request-origin";

/** Same-origin, authenticated, own-account actions with small JSON bodies only. */
export async function validateCorosMutation(req: Request, userId: string, requireConsent = false, env: Record<string, string | undefined> = process.env) {
  corosAppOrigin(env); // APP_URL must be explicitly valid even when disconnecting with the flag off.
  if (!appMutationOriginAllowed(req, env)) throw new CorosOAuthError("invalid_origin", "Open this action from the JMM connectors page.", 403);
  if (req.method !== "POST" || !/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) throw new CorosOAuthError("invalid_request", "Send a JSON authorization request.", 400);
  if (new URL(req.url).searchParams.has("athleteId")) throw new CorosOAuthError("own_account_required", "Authorize or disconnect your own COROS account.", 403);
  if (Number(req.headers.get("content-length") || 0) > 1024) throw new CorosOAuthError("invalid_request", "The authorization request is too large.", 413);
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); throw new CorosOAuthError("invalid_request", "The authorization request is too large.", 413); }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new CorosOAuthError("invalid_request", "Send a valid JSON authorization request."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CorosOAuthError("invalid_request", "Send a valid JSON authorization request.");
  const fields = body as Record<string, unknown>;
  if ("athleteId" in fields && fields.athleteId !== userId) throw new CorosOAuthError("own_account_required", "Authorize or disconnect your own COROS account.", 403);
  if (Object.keys(fields).some(key => key !== "consent" && key !== "athleteId")) throw new CorosOAuthError("invalid_request", "Unsupported authorization request fields.");
  if (requireConsent && fields.consent !== true) throw new CorosOAuthError("consent_required", "Review the COROS account, offline access and MCP permission disclosure before continuing.");
}
export function corosErrorResponse(error: unknown) {
  return Response.json({ error: error instanceof CorosOAuthError ? error.message : "The COROS authorization change could not be completed. Refresh and try again.",
    code: error instanceof CorosOAuthError ? error.code : "authorization_failed" },
    { status: error instanceof CorosOAuthError ? error.status : 503, headers: { "Cache-Control": "private, no-store" } });
}
