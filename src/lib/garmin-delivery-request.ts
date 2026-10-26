import { GarminError } from "./garmin-config";
import { appMutationOriginAllowed } from "./request-origin";
import { rateLimit } from "./ratelimit";
export async function readGarminDeliveryRequest(req:Request,userId:string,allowed:string[]) {
 if(!appMutationOriginAllowed(req) || new URL(req.url).search)throw new GarminError("invalid_origin","Use your JMM Garmin controls.",403);
 if(!["POST","PUT"].includes(req.method) || !/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type")||""))throw new GarminError("invalid_request","Send a JSON Garmin request.");
 if(!rateLimit(`garmin-delivery:${userId}`,10,60000).ok)throw new GarminError("rate_limited","Wait before another Garmin change.",429);
 const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{if(reader)while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2048){await reader.cancel();throw new GarminError("invalid_request","Garmin request is too large.",413);}chunks.push(value);}}finally{reader?.releaseLock();}
 let value:unknown;try{value=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new GarminError("invalid_request","Invalid JSON.");}
 if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k)))throw new GarminError("own_account_required","Use only your own athlete's Garmin connection.",403);
 return value as Record<string,unknown>;
}
export { GARMIN_AUTO_CONSENT } from "./garmin-config";
