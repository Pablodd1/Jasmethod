import { coachingActor, coachingError } from "@/lib/coaching-route";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { await coachingActor(req); return Response.json({ configured: false, code: "", botUsername: null, transport: "disabled", reason: "Real Telegram linking is disabled pending provider and privacy review. The authenticated mock flow makes no network requests." }); }
  catch (e) { return coachingError(e); }
}
export async function POST(req: Request) {
  try { await coachingActor(req); return Response.json({ error: "Real Telegram linking is disabled. Use the explicitly labeled mock flow for isolated testing.", code: "PROVIDER_DISABLED" }, { status: 503 }); }
  catch (e) { return coachingError(e); }
}
