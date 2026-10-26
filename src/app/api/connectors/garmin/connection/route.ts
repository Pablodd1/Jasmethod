import { getCurrentUser } from "@/lib/auth";
import { disconnectGarmin, getGarminConnectionStatus } from "@/lib/garmin-oauth";
import { validateGarminMutation, garminErrorResponse } from "@/lib/garmin-request";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try { return Response.json(await getGarminConnectionStatus(user.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return garminErrorResponse(error); }
}
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const consent = await validateGarminMutation(req, user.id, false);
    return Response.json(await disconnectGarmin(user.id, consent.manualRevocationReported), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return garminErrorResponse(error); }
}
