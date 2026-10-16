import { getCurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/access";
import { prisma } from "@/lib/db";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { rateLimit } from "@/lib/ratelimit";
import { readScenarioJson, scenarioError } from "@/lib/race-scenario-http";
import { checkTelegramWebhook, launchConfiguration, probeLaunchIntegrations } from "@/lib/launch-integrations";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers });
  return Response.json({ checks: launchConfiguration(), checkedAt: new Date().toISOString() }, { headers });
}
export async function POST(req: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers });
  if (!appMutationOriginAllowed(req)) return Response.json({ error: "Invalid origin." }, { status: 403, headers });
  if (!rateLimit(`admin-integrations:${actor.id}`, 5, 60_000).ok) return Response.json({ error: "Too many checks. Wait a minute." }, { status: 429, headers });
  try {
    const body = await readScenarioJson(req, 512);
    if (Object.keys(body).some(key => key !== "action") || typeof body.action !== "string" || !["probe", "configure_telegram_webhook"].includes(body.action))
      return Response.json({ error: "Choose a supported integration check." }, { status: 400, headers });
    const checks = body.action === "probe" ? await probeLaunchIntegrations()
      : { ...launchConfiguration(), telegram: await checkTelegramWebhook(true) };
    await prisma.auditLog.create({ data: { actorId: actor.id, subjectId: actor.id, action: `integration.${body.action}`,
      after: JSON.stringify(Object.fromEntries(Object.entries(checks).map(([key, value]) => [key, value.state]))),
      note: "Administrator integration check. No athlete data or outbound coaching message sent." } });
    return Response.json({ checks, checkedAt: new Date().toISOString() }, { headers });
  } catch (error) {
    // Never expose transport exceptions: a Telegram error can contain its bot-token URL.
    if (error instanceof ApiError) return scenarioError(error);
    return Response.json({ error: "Integration check could not be recorded. Refresh before retrying." }, { status: 500, headers });
  }
}
