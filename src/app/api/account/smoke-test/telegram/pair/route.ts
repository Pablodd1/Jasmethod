import { getCurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/access";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { rateLimit } from "@/lib/ratelimit";
import { smokeAccountAllowed } from "@/lib/account-smoke-test";
import { parseSmokePairConsent, smokeBoundedBody, startSmokeTelegramPairing } from "@/lib/account-smoke-pairing";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  try {
    if (!appMutationOriginAllowed(req)) return json({ error: "Same-origin request required" }, 403);
    const user = await getCurrentUser();
    if (!user) return json({ error: "Sign in to continue" }, 401);
    if (new URL(req.url).search || !smokeAccountAllowed(user.id)) return json({ error: "This action is restricted to its enabled account" }, 403);
    if (!rateLimit(`smoke-telegram-pair:${user.id}`, 5, 60_000).ok) return json({ error: "Please wait before pairing again" }, 429);
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") || "")) return json({ error: "JSON consent required" }, 400);
    const text = await smokeBoundedBody(req, 1024);
    let body; try { body = JSON.parse(text); } catch { return json({ error: "Invalid JSON" }, 400); }
    parseSmokePairConsent(body);
    return json(await startSmokeTelegramPairing(user.id));
  } catch (e) {
    return json({ error: e instanceof ApiError ? e.message : "Pairing could not be started" }, e instanceof ApiError ? e.status : 503);
  }
}
