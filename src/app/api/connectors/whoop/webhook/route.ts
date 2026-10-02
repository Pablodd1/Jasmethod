import { verifyWhoopWebhook } from "@/lib/webhook-auth";
import { queueVerifiedProviderEvent } from "@/lib/webhook-queue";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try {
    const raw=await req.text();
    if(raw.length>32000)return Response.json({error:"Event too large"},{status:413});
    if(!verifyWhoopWebhook(raw,req.headers.get("x-whoop-signature-timestamp"),req.headers.get("x-whoop-signature"),process.env.WHOOP_CLIENT_SECRET))
      return Response.json({error:"Invalid webhook signature"},{status:401});
    return await queueVerifiedProviderEvent("whoop",JSON.parse(raw));
  }catch{return Response.json({error:"Event was not queued; retry required"},{status:503});}
}
