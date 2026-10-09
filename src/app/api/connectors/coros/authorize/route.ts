import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { beginCorosAuthorization } from "@/lib/coros-oauth";
import { corosAppOrigin } from "@/lib/coros-oauth-config";
import { validateCorosMutation, corosErrorResponse } from "@/lib/coros-oauth-request";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    await validateCorosMutation(req, user.id, true);
    const result = await beginCorosAuthorization(user.id);
    (await cookies()).set("jmm_coros_oauth", result.browserBinding, { httpOnly: true, sameSite: "lax", secure: corosAppOrigin().startsWith("https:"), path: "/api/connectors/coros", maxAge: 600 });
    return Response.json({ authorizationUrl: result.authorizationUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return corosErrorResponse(error); }
}
