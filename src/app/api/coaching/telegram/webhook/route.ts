import { ApiError } from "@/lib/access";
import { coachingError } from "@/lib/coaching-route";
import { processTelegramWebhook } from "@/lib/coaching-service";
import { telegramCoachingConfigured, verifyTelegramWebhookSecret } from "@/lib/telegram-coaching-transport";
import { processSmokeTelegramPairing, smokeBoundedBody, smokeTelegramPairingConfigured } from "@/lib/account-smoke-pairing";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const coachingEnabled = telegramCoachingConfigured();
    if (!coachingEnabled && !smokeTelegramPairingConfigured()) throw new ApiError("Telegram coaching disabled", 503);
    if (!verifyTelegramWebhookSecret(req.headers.get("x-telegram-bot-api-secret-token"))) throw new ApiError("Unauthorized", 401);
    const text = await smokeBoundedBody(req, 8192);
    let body; try { body = JSON.parse(text); } catch { throw new ApiError("Invalid JSON"); }
    try {
      const smoke = await processSmokeTelegramPairing(body);
      if (smoke.handled) return Response.json({ ok: true, paired: smoke.paired === true });
      if (!coachingEnabled) return Response.json({ ok: true, ignored: true });
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
