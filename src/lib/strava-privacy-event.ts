/** Only provider deletion/withdrawal events may bypass a paused import gate.
 * This classifier is NOT authentication; public ingress must authenticate first,
 * and the worker must recheck the saved owner binding before any local change. */
type StravaId = number | string;
export interface StravaPrivacyEvent {
  owner_id: StravaId;
  object_id: StravaId;
  object_type: "activity" | "athlete";
  aspect_type: "delete" | "update";
  updates?: { authorized?: string };
  event_id?: unknown;
  event_time?: unknown;
}
const validId = (value: unknown): value is StravaId => typeof value === "number"
  ? Number.isSafeInteger(value) && value > 0
  : typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
export function isStravaPrivacyEvent(value: unknown): value is StravaPrivacyEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, any>;
  if (!validId(body.owner_id) || !validId(body.object_id)) return false;
  if (body.object_type === "activity" && body.aspect_type === "delete") return true;
  return body.object_type === "athlete" && body.aspect_type === "update"
    && String(body.owner_id) === String(body.object_id)
    && !!body.updates && typeof body.updates === "object" && !Array.isArray(body.updates)
    && body.updates.authorized === "false";
}

export class StravaWebhookBodyError extends Error {
  constructor(readonly status: 400 | 413) { super(status === 413 ? "Event too large" : "Invalid event body"); }
}
/** Byte-bounded even when Content-Length is absent or dishonest. No body is logged. */
export async function readStravaEvent(req: Request): Promise<Record<string, any>> {
  const limit = 32000;
  if (Number(req.headers.get("content-length")) > limit) throw new StravaWebhookBodyError(413);
  const reader = req.body?.getReader();
  if (!reader) throw new StravaWebhookBodyError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new StravaWebhookBodyError(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new StravaWebhookBodyError(400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new StravaWebhookBodyError(400);
  return body as Record<string, any>;
}
