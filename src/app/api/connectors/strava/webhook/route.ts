import { NextResponse } from "next/server";
import { queueVerifiedProviderEvent } from "@/lib/webhook-queue";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
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
    const raw=await req.text();
    if(raw.length>32000)return Response.json({error:"Event too large"},{status:413});
    const body=JSON.parse(raw);
    const key=new URL(req.url).searchParams.get("key");
    const keyOk=process.env.STRAVA_WEBHOOK_SECRET && key===process.env.STRAVA_WEBHOOK_SECRET;
    const subOk=process.env.STRAVA_SUBSCRIPTION_ID && String(body?.subscription_id)===process.env.STRAVA_SUBSCRIPTION_ID;
    if(!keyOk&&!subOk)return Response.json({error:"Invalid webhook credentials"},{status:401});
    return await queueVerifiedProviderEvent("strava",body);
  }catch{return Response.json({error:"Event was not queued; retry required"},{status:503});}
}
