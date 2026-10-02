import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

// Bare Telegram 1/2/3 replies cannot identify a session, completion status,
// actual duration, anchored RPE or confirmed symptoms. Never mutate historic
// check-ins or claim an adaptation from this ambiguous signal. The authenticated
// app session-feedback path remains available. Re-enable only with verified
// message/session mapping, idempotency and the same validation as app feedback.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    ok: true, enabled: false, applied: 0,
    reason: "Telegram numeric feedback is unavailable. Record feedback for the selected session in the authenticated app.",
  });
}
