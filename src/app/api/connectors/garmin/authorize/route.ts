import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { beginGarminAuthorization } from "@/lib/garmin-oauth";
import { validateGarminMutation, garminErrorResponse } from "@/lib/garmin-request";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    await validateGarminMutation(req, user.id, true);
    const result = await beginGarminAuthorization(user.id);
    (await cookies()).set("jmm_garmin_oauth", result.browserBinding, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/connectors/garmin", maxAge: 600 });
    return Response.json({ authorizationUrl: result.authorizationUrl }, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return garminErrorResponse(error); }
}
