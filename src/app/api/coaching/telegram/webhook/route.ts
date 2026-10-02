import { ApiError } from "@/lib/access";
import { coachingError } from "@/lib/coaching-route";
import { processTelegramWebhook } from "@/lib/coaching-service";
import { telegramCoachingConfigured, verifyTelegramWebhookSecret } from "@/lib/telegram-coaching-transport";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    if (!telegramCoachingConfigured()) throw new ApiError("Telegram coaching disabled", 503);
    if (!verifyTelegramWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) throw new ApiError("Unauthorized", 401);
    if (Number(req.headers.get("content-length") || 0) > 8192) throw new ApiError("Request too large", 413);
    const text = await req.text(); if (text.length > 8192) throw new ApiError("Request too large", 413);
    let body; try { body = JSON.parse(text); } catch { throw new ApiError("Invalid JSON"); }
    try {
      const result = await processTelegramWebhook(body);
      return Response.json({ ok: true, duplicate: "duplicate" in result ? result.duplicate : false, paired: "paired" in result ? result.paired : false, requiresConfirmation: "requiresConfirmation" in result ? result.requiresConfirmation : false });
    } catch (e) {
      // Telegram retries non-2xx. A valid authenticated update that cannot be
      // used is terminal: acknowledge without exposing private rejection data.
      if ((e instanceof ApiError && e.status < 500) || (e && typeof e === "object" && "code" in e && e.code === "P2002")) return Response.json({ ok: true, ignored: true });
      throw e;
    }
  } catch (e) { return coachingError(e); }
}
