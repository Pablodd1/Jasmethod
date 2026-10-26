import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { garminConfigured,GarminError } from "@/lib/garmin-config";
import { garminAutoPublishEnabled,readGarminReceipt } from "@/lib/garmin-delivery";
import { getGarminAuthorization } from "@/lib/garmin-oauth";
import { garminErrorResponse } from "@/lib/garmin-request";
import { readGarminDeliveryRequest,GARMIN_AUTO_CONSENT } from "@/lib/garmin-delivery-request";
export const dynamic="force-dynamic";
export async function GET(){
 const user=await getCurrentUser();if(!user)return Response.json({error:"Sign in first."},{status:401});
 try{
  const c=await prisma.connector.findUnique({where:{userId_provider:{userId:user.id,provider:"garmin_direct"}}});
  const rows=await prisma.auditLog.findMany({where:{subjectId:user.id,actorId:user.id,action:"garmin.delivery.v1"},orderBy:[{createdAt:"desc"},{id:"desc"}],distinct:["entityId"]});
  const receipts=rows.map(r=>readGarminReceipt(r.after)).filter(r=>r!=null && r.stage!=="nothing_pending").map(r=>({sessionId:r!.sessionId,revision:r!.revision,date:r!.date,status:r!.status,stage:r!.stage,deviceReceived:false}));
  const recordsStored=await prisma.syncJob.count({where:{userId:user.id,kind:"garmin.data.v1"}});
  return Response.json({available:garminConfigured() && process.env.ENABLE_GARMIN_TRAINING==="true",enabled:!!c?.externalRef && await garminAutoPublishEnabled(user.id,c.externalRef),
   importsAvailable:process.env.ENABLE_GARMIN_IMPORTS==="true",recordsStored,historicalBackfill:false,receipts},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return garminErrorResponse(e);}
}
export async function PUT(req:Request){
 const user=await getCurrentUser();if(!user)return Response.json({error:"Sign in first."},{status:401});
 try{
  const body=await readGarminDeliveryRequest(req,user.id,["enabled","consent"]);
  if(typeof body.enabled!=="boolean" || (body.enabled && body.consent!==GARMIN_AUTO_CONSENT))throw new GarminError("consent_required","Choose whether to automatically publish your prescribed workouts.");
  if(body.enabled && (!garminConfigured() || process.env.ENABLE_GARMIN_TRAINING!=="true"))throw new GarminError("training_unavailable","Automatic Garmin publication is awaiting production verification.",503);
  const auth=body.enabled?await getGarminAuthorization(user.id,["WORKOUT_IMPORT"]):null;
  await prisma.$transaction(async tx=>{
   if(auth){const claimed=await tx.connector.updateMany({where:{id:auth.connectorId,userId:user.id,provider:"garmin_direct",externalRef:auth.userId,status:"connected"},data:{status:"connected"}});if(claimed.count!==1)throw new GarminError("connection_changed","Your Garmin connection changed.",409);}
   await tx.auditLog.create({data:{actorId:user.id,subjectId:user.id,action:"garmin.auto_publish",after:JSON.stringify({version:1,enabled:body.enabled,providerUserId:auth?.userId??null,consent:body.enabled?GARMIN_AUTO_CONSENT:null})}});
  });
  return Response.json({enabled:body.enabled,note:"New automatic publications stop when disabled. Existing Garmin prescriptions still receive safety cancellations or updates while authorized."},{headers:{"Cache-Control":"private, no-store"}});
 }catch(e){return garminErrorResponse(e);}
}
