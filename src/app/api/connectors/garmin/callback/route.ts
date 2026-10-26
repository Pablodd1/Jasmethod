import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { completeGarminAuthorization } from "@/lib/garmin-oauth";
import { GarminError, garminOrigin } from "@/lib/garmin-config";
import { garminErrorResponse } from "@/lib/garmin-request";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  let origin: string;
  try { origin = garminOrigin(); } catch (error) { return garminErrorResponse(error); }
  const destination = new URL("/connectors", origin), user = await getCurrentUser();
  if (!user) destination.searchParams.set("garmin", "sign_in_required");
  else try {
    await completeGarminAuthorization(user.id, new URL(req.url).searchParams, (await cookies()).get("jmm_garmin_oauth")?.value);
    destination.searchParams.set("garmin", "connected");
  } catch (error) { destination.searchParams.set("garmin", error instanceof GarminError ? error.code : "connection_failed"); }
  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "private, no-store"); response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set("jmm_garmin_oauth", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/connectors/garmin", maxAge: 0 });
  return response;
}
