import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { completeCorosAuthorization, CorosOAuthError } from "@/lib/coros-oauth";
import { corosAppOrigin } from "@/lib/coros-oauth-config";
import { corosErrorResponse } from "@/lib/coros-oauth-request";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  let origin: string;
  try { origin = corosAppOrigin(); } catch (error) { return corosErrorResponse(error); }
  const destination = new URL("/connectors", origin);
  const user = await getCurrentUser();
  if (!user) destination.searchParams.set("coros", "sign_in_required");
  else {
    try {
      const binding = (await cookies()).get("jmm_coros_oauth")?.value;
      await completeCorosAuthorization(user.id, new URL(req.url).searchParams, binding);
      destination.searchParams.set("coros", "connected");
    } catch (error) { destination.searchParams.set("coros", error instanceof CorosOAuthError ? error.code : "connection_failed"); }
  }
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("jmm_coros_oauth", "", { maxAge: 0, path: "/api/connectors/coros", httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:") });
  return response;
}
