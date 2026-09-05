// JasMiamiMethod — lightweight in-memory rate limiter for auth endpoints.
// Sliding window per key (email+IP). In-memory is right for the single-instance
// MVP; swap the Map for Redis if we ever scale horizontally.
//
// The FREE DEMO one-tap accounts (/api/auth/demo) are deliberately NOT limited:
// they are whitelist-only, passwordless, and meant for friction-free tester
// entry during the demo phase.

const windows = new Map<string, number[]>();

export interface RateVerdict {
  ok: boolean;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateVerdict {
  const now = Date.now();
  const arr = (windows.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    const oldest = arr[0];
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  arr.push(now);
  windows.set(key, arr);
  // opportunistic cleanup
  if (windows.size > 5000) {
    windows.forEach((v: number[], k: string) => { if (!v.some((t) => now - t < windowMs)) windows.delete(k); });
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
}
