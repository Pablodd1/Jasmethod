/** Validate against the operator-configured public URL, never forwarded Host headers. */
export function appMutationOriginAllowed(req: Request, env: Record<string, string | undefined> = process.env): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const configured = env.APP_URL || env.NEXT_PUBLIC_APP_URL;
  if (!configured && env.NODE_ENV === "production") return false;
  try {
    const base = new URL(configured || req.url);
    const localHttp = base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (base.protocol !== "https:" && !localHttp) return false;
    return req.headers.get("origin") === base.origin;
  } catch { return false; }
}
