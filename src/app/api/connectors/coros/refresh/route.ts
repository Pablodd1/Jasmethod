import { getCurrentUser } from "@/lib/auth";
import { refreshCorosAuthorization } from "@/lib/coros-oauth";
import { validateCorosMutation, corosErrorResponse } from "@/lib/coros-oauth-request";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try { await validateCorosMutation(req, user.id); return Response.json(await refreshCorosAuthorization(user.id), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return corosErrorResponse(error); }
}
