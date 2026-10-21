// Vercel Functions reject request bodies above 4.5 MB before application code runs.
// Keep room for multipart headers; do not advertise a larger limit on self-hosted builds.
export const MAX_UPLOAD_BYTES = 4_000_000;
export const MAX_UPLOAD_REQUEST_BYTES = 4_100_000;
export class UploadLimitError extends Error {}
export async function boundedUploadForm(req: Request): Promise<FormData> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Missing upload");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPLOAD_REQUEST_BYTES) { await reader.cancel(); throw new UploadLimitError("Upload too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return new Response(bytes, { headers: { "Content-Type": req.headers.get("content-type") || "" } }).formData();
}
