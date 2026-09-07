import { randomBytes, timingSafeEqual } from "crypto";

export function createOAuthState(provider: string): string {
  // WHOOP requires an eight-character state value. Six random bytes encode to
  // exactly eight base64url characters while preserving more entropy than hex.
  return provider === "whoop"
    ? randomBytes(6).toString("base64url")
    : randomBytes(32).toString("hex");
}

export function validOAuthState(
  received: string,
  expected: unknown,
  provider: string,
): boolean {
  if (typeof expected !== "string") return false;
  const requiredLength = provider === "whoop" ? 8 : 64;
  if (
    received.length !== requiredLength ||
    expected.length !== requiredLength ||
    !/^[A-Za-z0-9_-]+$/.test(received)
  )
    return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
