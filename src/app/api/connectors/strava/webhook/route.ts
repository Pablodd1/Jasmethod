import { NextResponse } from "next/server";
import { queueVerifiedProviderEvent } from "@/lib/webhook-queue";
import { stravaConnectorEnabled, STRAVA_DISABLED_MESSAGE } from "@/lib/capabilities";
import { isStravaPrivacyEvent, readStravaEvent, StravaWebhookBodyError } from "@/lib/strava-privacy-event";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  if (!stravaConnectorEnabled()) return NextResponse.json({ error: STRAVA_DISABLED_MESSAGE, code: "provider_disabled" }, { status: 503 });
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.STRAVA_VERIFY_TOKEN;
  if (mode === "subscribe" && (!expected || token !== expected)) {
    return NextResponse.json(
      { error: "verify_token mismatch" },
      { status: 403 },
    );
  }
  if (mode === "subscribe" && challenge) {
    return NextResponse.json({ "hub.challenge": challenge });
  }
  return NextResponse.json({ ok: true, endpoint: "strava-webhook" });
}


export async function POST(req: Request) {
  try {
    const body=await readStravaEvent(req);
    const key=new URL(req.url).searchParams.get("key");
    const keyOk=process.env.STRAVA_WEBHOOK_SECRET && key===process.env.STRAVA_WEBHOOK_SECRET;
    const subOk=process.env.STRAVA_SUBSCRIPTION_ID && String(body?.subscription_id)===process.env.STRAVA_SUBSCRIPTION_ID;
    if(!keyOk&&!subOk)return Response.json({error:"Invalid webhook credentials"},{status:401});
    if(!stravaConnectorEnabled()&&!isStravaPrivacyEvent(body))
      return Response.json({error:STRAVA_DISABLED_MESSAGE,code:"provider_disabled"},{status:503});
    // Predictable subscription metadata never authenticates destructive events,
    // even when ordinary imports are enabled. Use the existing secret path;
    // provider registration/authenticated delivery remains owner review.
    if(isStravaPrivacyEvent(body)&&!keyOk)
      return Response.json({error:"Authenticated privacy delivery requires owner review",code:"privacy_auth_required"},{status:503});
    return await queueVerifiedProviderEvent("strava",body);
  }catch(error){
    if(error instanceof StravaWebhookBodyError)return Response.json({error:error.message},{status:error.status});
    return Response.json({error:"Event was not queued; retry required"},{status:503});
  }
}
