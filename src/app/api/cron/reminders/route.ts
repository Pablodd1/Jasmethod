import { telegramCoachingConfigured } from "@/lib/telegram-coaching-transport";
import { mockCoachingEnabled } from "@/lib/coaching-communication";
import { runMockCoachingSchedule } from "@/lib/coaching-service";
import { coachingError } from "@/lib/coaching-route";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "Cron is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!mockCoachingEnabled() && !telegramCoachingConfigured()) return Response.json({ enabled: false, sent: 0, reason: "Automated delivery is disabled pending delivery, consent and safety review." });
  try { const result = await runMockCoachingSchedule(); return Response.json({ enabled: true, sent: result.externallySent, ...result }); } catch (e) { return coachingError(e); }
}
