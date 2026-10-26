import { getCurrentUser } from "@/lib/auth";
import { publishGarminWorkout } from "@/lib/garmin-delivery";
import { readGarminDeliveryRequest } from "@/lib/garmin-delivery-request";
import { GarminError } from "@/lib/garmin-config";
import { garminErrorResponse } from "@/lib/garmin-request";
import { SessionResolutionError } from "@/lib/canonical-session";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 const user=await getCurrentUser();if(!user)return Response.json({error:"Sign in first."},{status:401});
 try{
  const body=await readGarminDeliveryRequest(req,user.id,["sessionId","expectedRevision","action"]);
  if(typeof body.sessionId!=="string" || body.sessionId.length>128 || !body.sessionId || typeof body.expectedRevision!=="string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.expectedRevision) || !["publish","cancel"].includes(String(body.action)))throw new GarminError("invalid_request","Provide the saved session, current revision and publish or cancel action.");
  const receipt=await publishGarminWorkout({athleteId:user.id,sessionId:body.sessionId,expectedRevision:body.expectedRevision,cancel:body.action==="cancel"});
  if(!receipt || !["published","cancelled"].includes(receipt.status))throw new GarminError("delivery_unconfirmed","Garmin did not confirm this delivery.",503);
  return Response.json({status:receipt.status,revision:receipt.revision,verification:receipt.status==="published"?"garmin_schedule_verified":receipt.stage==="nothing_pending"?"no_publication_pending":"provider_withdrawn",deviceReceived:false},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){if(e instanceof SessionResolutionError)return Response.json({error:e.message},{status:e.status});return garminErrorResponse(e);}
}
