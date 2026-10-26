import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { GarminError } from "@/lib/garmin-config";
import { garminErrorResponse } from "@/lib/garmin-request";
export const dynamic="force-dynamic";
/** Own-account archive export only. Never expose another athlete's cursor or encrypted inbox credentials. */
export async function GET(req:Request){
 const user=await getCurrentUser();if(!user)return Response.json({error:"Sign in first."},{status:401});
 try{
  const params=new URL(req.url).searchParams,cursor=params.get("cursor");
  if([...params.keys()].some(k=>k!=="cursor") || params.getAll("cursor").length>1 || (cursor && !/^[a-zA-Z0-9_-]{1,128}$/.test(cursor)))throw new GarminError("invalid_cursor","Use the next page link from your own Garmin export.");
  if(cursor && !await prisma.syncJob.findFirst({where:{id:cursor,userId:user.id,kind:"garmin.data.v1"},select:{id:true}}))throw new GarminError("invalid_cursor","Garmin export cursor is unavailable.");
  const jobs=await prisma.syncJob.findMany({where:{userId:user.id,kind:"garmin.data.v1"},orderBy:[{createdAt:"asc"},{id:"asc"}],take:11,...(cursor?{cursor:{id:cursor},skip:1}:{})});
  const records:{receivedAt:Date;status:string;summary:unknown}[]=[];let bytes=0,last:string|null=null;
  for(const job of jobs.slice(0,10)){
   if(!job.payload.startsWith("enc:v1:"))throw new Error();
   const text=decryptSecret(job.payload);if(bytes+Buffer.byteLength(text)>3*1024*1024)break;
   records.push({receivedAt:job.createdAt,status:job.status,summary:JSON.parse(text)});bytes+=Buffer.byteLength(text);last=job.id;
  }
  return Response.json({source:"garmin_direct",historicalBackfill:false,records,nextCursor:jobs.length>records.length?last:null},
   {headers:{"Cache-Control":"private, no-store","X-JMM-Data-Provenance":"garmin_direct"}});
 }catch(e){return garminErrorResponse(e);}
}
