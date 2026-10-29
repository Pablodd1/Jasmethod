import { createHash } from "node:crypto";
import type { PublicInquiry } from "./public-inquiry";
export const INQUIRY_CONSENT_VERSION="public-inquiry-reply-v1";
export type InquiryReceipt={state:"pending"|"accepted"|"unavailable"|"unknown";channel?:"telegram"|"smtp";consentVersion:string;purpose:"reply_to_inquiry";at:string};
type ReceiptRow={id:string;before:string|null;after:string|null};
export interface InquiryReceiptStore {
  claim(requestId:string,hash:string,initial:InquiryReceipt):Promise<{fresh:boolean;row:ReceiptRow}>;
  finish(id:string,receipt:InquiryReceipt):Promise<void>;
}
export async function deliverInquiryOnce(opts:{requestId:string;inquiry:PublicInquiry;store:InquiryReceiptStore;deliver:()=>Promise<{channel:"telegram"|"smtp"}|null>;available:boolean;now?:Date}) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(opts.requestId))return {status:400,body:{ok:false,code:"invalid_request",error:"Reload the form before sending."}};
  const hash=createHash("sha256").update(JSON.stringify({version:INQUIRY_CONSENT_VERSION,...opts.inquiry})).digest("hex"),at=(opts.now||new Date()).toISOString();
  const initial:InquiryReceipt={state:"pending",consentVersion:INQUIRY_CONSENT_VERSION,purpose:"reply_to_inquiry",at};
  const claimed=await opts.store.claim(opts.requestId,hash,initial);
  const response=(receipt:InquiryReceipt)=>receipt.state==="accepted"?{status:200,body:{ok:true,state:"accepted",channel:receipt.channel,message:"The provider accepted the inquiry; inbox arrival and reading are not confirmed."}}:
    receipt.state==="unavailable"?{status:503,body:{ok:false,state:"unavailable",code:"delivery_unavailable",error:"Online delivery is unavailable. Please use the email option."}}:
    {status:202,body:{ok:false,state:receipt.state,code:"delivery_unconfirmed",error:"Delivery is unconfirmed. Do not repeatedly resubmit; your message may have been accepted."}};
  if(claimed.row.before!==hash)return {status:409,body:{ok:false,code:"request_conflict",error:"This request already contains different information. Reload before starting another inquiry."}};
  if(!claimed.fresh){let receipt:InquiryReceipt;try{receipt=JSON.parse(claimed.row.after||"null");}catch{return response({...initial,state:"unknown"});}return response(receipt&&["pending","accepted","unavailable","unknown"].includes(receipt.state)?receipt:{...initial,state:"unknown"});}
  if(!opts.available){const receipt:InquiryReceipt={...initial,state:"unavailable"};await opts.store.finish(claimed.row.id,receipt);return response(receipt);}
  let delivered:{channel:"telegram"|"smtp"}|null=null;
  try{delivered=await opts.deliver();}catch{/* A timeout is not proof that nothing was sent. */}
  const receipt:InquiryReceipt={...initial,state:delivered?"accepted":"unknown",...(delivered?{channel:delivered.channel}:{})};
  try{await opts.store.finish(claimed.row.id,receipt);}catch{return response({...initial,state:"unknown"});}
  return response(receipt);
}
