import { getCurrentUser } from "@/lib/auth";
import { disconnectIntervals, IntervalsOAuthError } from "@/lib/intervals-oauth";

export const dynamic = "force-dynamic";

// Personal API keys are no longer accepted, including when submitted by coaches.
export async function POST() {
  if (!(await getCurrentUser())) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ error: "Connect your own Intervals.icu account using the authorization button. API-key entry has been retired.",
    code: "oauth_required", connectUrl: "/api/connectors/intervals/authorize" }, { status: 410 });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const targetAthlete = new URL(req.url).searchParams.get("athleteId");
  if (targetAthlete && targetAthlete !== user.id) return Response.json({ error: "Disconnect your own account." }, { status: 403 });
  try { return Response.json(await disconnectIntervals(user.id)); }
  catch (error) {
    return Response.json({ error: error instanceof IntervalsOAuthError ? error.message : "Could not disconnect. Please retry.",
      code: error instanceof IntervalsOAuthError ? error.code : "disconnect_failed" },
    { status: error instanceof IntervalsOAuthError ? error.status : 503 });
  }
}
