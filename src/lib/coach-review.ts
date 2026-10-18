import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { ApiError } from './access';
import { supportTelegramConfigured } from './support-delivery';

export const COACH_REVIEW_PREFIX='kcoach-review-';
type Actor={id:string;role?:string};
export function parseCoachReview(raw:unknown) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ApiError('Review the question before sending');
  const b=raw as Record<string,unknown>;
  if(Object.keys(b).some(k=>!['sourceMessageId','question','clientId','confirmed','notifyAdmin'].includes(k))||b.confirmed!==true||typeof b.notifyAdmin!=='boolean'||typeof b.sourceMessageId!=='string'||! /^[a-zA-Z0-9_-]{1,128}$/.test(b.sourceMessageId)||typeof b.clientId!=='string'||! /^[a-zA-Z0-9_-]{1,100}$/.test(b.clientId)||typeof b.question!=='string'||b.question.trim().length<10||b.question.length>1500)throw new ApiError('Confirm a question of 10–1500 characters and its recipients');
  if(/\b(?:Bearer\s+\S+|sk-[a-zA-Z0-9_-]{8,}|(?:password|api[_ -]?key|client[_ -]?secret|access[_ -]?token)\s*[:=])/i.test(b.question))throw new ApiError('Remove credentials before sharing this question');
  return {sourceMessageId:b.sourceMessageId,question:b.question.trim(),clientId:COACH_REVIEW_PREFIX+b.clientId,notifyAdmin:b.notifyAdmin};
}
/** Generic operator alert only: no question, athlete identity, health data,
 * conversation text or private link leaves JMM for Telegram. */
export async function sendCoachReviewAlert(env:Record<string,string|undefined>=process.env,send:typeof fetch=fetch):Promise<number|null> {
  if(!supportTelegramConfigured(env))return null;
  try {
    const response=await send(`https://api.telegram.org/bot${env.ADMIN_BOT_TOKEN||env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:env.ADMIN_TELEGRAM_CHAT_ID,text:'Jas KCoach: an athlete has requested human review of a coaching decision. Open the Coaching desk in JMM and check recent coach review requests. This alert does not indicate an emergency monitoring service.',disable_web_page_preview:true}),signal:AbortSignal.timeout(10000)});
    const result=await response.json();
    return response.ok&&result?.ok===true&&Number.isSafeInteger(result.result?.message_id)&&result.result.message_id>0&&String(result.result?.chat?.id)===env.ADMIN_TELEGRAM_CHAT_ID?result.result.message_id:null;
  }catch{return null;}
}
export async function requestCoachReview(actor:Actor,raw:unknown) {
  const input=parseCoachReview(raw);
  const body=`Jas KCoach · human review requested\n\n${input.question}`;
  let claim:{messageId:string;eventId:string;replayed:boolean;status:string};
  try {claim=await prisma.$transaction(async tx=>{
    const source=await tx.coachConversationMessage.findFirst({where:{id:input.sourceMessageId,userId:actor.id}});
    if(!source)throw new ApiError('Conversation message not found',404);
    const existing=await tx.coachingMessage.findUnique({where:{authorId_clientId:{authorId:actor.id,clientId:input.clientId}}});
    if(existing) {
      if(existing.athleteId!==actor.id||existing.body!==body)throw new ApiError('This review identifier belongs to a different question',409);
      const event=await tx.appEvent.findFirst({where:{userId:actor.id,route:'/api/assistant/escalate',message:existing.id}});
      const metadata=event?.meta?JSON.parse(event.meta):{};
      if(metadata.notifyAdmin!==input.notifyAdmin||metadata.sourceMessageId!==input.sourceMessageId)throw new ApiError('This review identifier belongs to different source or notification choices',409);
      return {messageId:existing.id,eventId:event?.id||'',replayed:true,status:metadata.status||'unconfirmed'};
    }
    const recent=await tx.appEvent.count({where:{userId:actor.id,route:'/api/assistant/escalate',createdAt:{gte:new Date(Date.now()-3600000)}}});
    if(recent>=3)throw new ApiError('Up to three coach review requests per hour. Use the existing shared conversation to follow up.',429);
    const message=await tx.coachingMessage.create({data:{authorId:actor.id,athleteId:actor.id,clientId:input.clientId,body}});
    const status=!input.notifyAdmin?'not_requested':supportTelegramConfigured()?'pending':'not_configured';
    const event=await tx.appEvent.create({data:{userId:actor.id,source:'server',kind:'info',route:'/api/assistant/escalate',message:message.id,meta:JSON.stringify({status,notifyAdmin:input.notifyAdmin,sourceMessageId:source.id})}});
    return {messageId:message.id,eventId:event.id,replayed:false,status};
  },{isolationLevel:'Serializable'});}catch(error){if((error as {code?:string}).code==='P2034'||(error as {code?:string}).code==='P2002')throw new ApiError('A review request is already processing. Reload before retrying.',409);throw error;}
  let status=claim.status;
  if(!claim.replayed&&status==='pending') {
    const receipt=await sendCoachReviewAlert();status=receipt?'accepted':'unconfirmed';
    await prisma.appEvent.update({where:{id:claim.eventId},data:{meta:JSON.stringify({status,notifyAdmin:input.notifyAdmin,sourceMessageId:input.sourceMessageId,receipt})}});
  }
  return {ok:true,sharedMessageId:claim.messageId,replayed:claim.replayed,notificationStatus:status,message:'Your reviewed question is saved in the athlete–coach conversation for authorized coaches and platform administrators. This does not confirm that anyone has read it. Urgent symptoms need immediate appropriate help; this inbox is not monitored for emergencies.'};
}
/** Revoked/unassigned coaches cannot see review requests, even with a known ID. */
export async function coachReviewScope(actor:Actor,db:Pick<Prisma.TransactionClient,'coachAssignment'>=prisma) {
  if(actor.role==='admin')return {};
  if(actor.role==='coach') {
    const assignments=await db.coachAssignment.findMany({where:{coachId:actor.id,status:'active',consent:'granted'},select:{athleteId:true}});
    return {athleteId:{in:[actor.id,...assignments.map(a=>a.athleteId)]}};
  }
  return {athleteId:actor.id};
}
