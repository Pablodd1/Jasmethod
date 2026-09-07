import { createHmac, timingSafeEqual } from "crypto";
export function verifyWhoopWebhook(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  now = Date.now(),
) {
  if (
    !secret ||
    !timestamp ||
    !signature ||
    !Number.isFinite(Number(timestamp)) ||
    Math.abs(now - Number(timestamp)) > 5 * 60000
  )
    return false;
  const expected = createHmac("sha256", secret)
    .update(timestamp + raw)
    .digest("base64");
  return (
    Buffer.byteLength(signature) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
