import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { deliverInquiryOnce } from "@/lib/public-inquiry-receipt";
import { PUBLIC_CONTACT_EMAIL } from "@/lib/public-contact";
import { deliverSupportMessage, supportTelegramConfigured } from "@/lib/support-delivery";
import { INQUIRY_MAX_BYTES, inquiryEmailText, parsePublicInquiry } from "@/lib/public-inquiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const attempts = new Map<string, number[]>();

// Best-effort per-instance abuse guard. A distributed limiter / CAPTCHA is needed at scale.
function allowed(request: Request): boolean {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const key = ip.slice(0, 70) + ":" + (request.headers.get("user-agent") || "").slice(0, 60);
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(t => now - t < 3600000);
  if (attempts.size > 500) attempts.clear();
  if (recent.length >= 3) { attempts.set(key, recent); return false; }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json({ ok: false, error: "Open this form on the JMM website." }, { status: 403, headers: noStore });
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 415, headers: noStore });

  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400, headers: noStore });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > INQUIRY_MAX_BYTES) {
      await reader.cancel();
      return NextResponse.json({ ok: false, error: "Message too large." }, { status: 413, headers: noStore });
    }
    chunks.push(chunk.value);
  }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return NextResponse.json({ ok: false, error: "Invalid message." }, { status: 400, headers: noStore }); }
  const data = parsePublicInquiry(payload);
  if (!data) return NextResponse.json({ ok: false, error: "Please check the fields and privacy consent." }, { status: 400, headers: noStore });
  if (!allowed(req)) return NextResponse.json({ ok: false, error: "Message limit reached. Please use the email option.", code: "rate_limited" }, { status: 429, headers: { ...noStore, "Retry-After": "3600" } });

  const requestId=(payload as Record<string,unknown>).requestId;
  if(typeof requestId!=="string")return NextResponse.json({ok:false,error:"Reload the form before sending."},{status:400,headers:noStore});
  const telegram=supportTelegramConfigured(),smtp=!!(process.env.SMTP_HOST&&process.env.SMTP_FROM&&process.env.SMTP_USER&&process.env.SMTP_PASS);
  try {
    const result=await deliverInquiryOnce({requestId,inquiry:data,available:telegram||smtp,store:{
      claim:async(id,hash,receipt)=>prisma.$transaction(async tx=>{
        const receiptId="public-inquiry:"+id;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${receiptId}))`;
        const existing=await tx.appEvent.findUnique({where:{id:receiptId},select:{id:true,meta:true}});
        if(existing){let stored;try{stored=JSON.parse(existing.meta||"null");}catch{throw Error("Invalid receipt");}return {fresh:false,row:{id:existing.id,before:stored?.fingerprint||null,after:JSON.stringify(stored?.receipt||null)}};}
        await tx.appEvent.create({data:{id:receiptId,kind:"info",source:"public-inquiry-receipt",route:"/contact",message:"Inquiry reply consent and transport receipt",meta:JSON.stringify({fingerprint:hash,receipt})}});
        return {fresh:true,row:{id:receiptId,before:hash,after:JSON.stringify(receipt)}};
      }),
      finish:async(id,receipt)=>{const current=await prisma.appEvent.findUniqueOrThrow({where:{id},select:{meta:true}});const stored=JSON.parse(current.meta||"null");await prisma.appEvent.update({where:{id},data:{meta:JSON.stringify({...stored,receipt})}});},
    },deliver:async()=>{
      if(telegram){const receipt=await deliverSupportMessage({category:"question",replyEmail:data.email,message:"Public inquiry ("+data.topic+") from "+data.name+":\n"+data.message});return receipt!==null?{channel:"telegram"}:null;}
      const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==="true",requireTLS:process.env.SMTP_SECURE!=="true",auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
      try {const receipt=await transport.sendMail({from:process.env.SMTP_FROM,to:PUBLIC_CONTACT_EMAIL,replyTo:data.email,subject:"JMM website inquiry: "+data.topic,text:inquiryEmailText(data)});
        return (receipt.accepted||[]).some((a:string|{address:string})=>(typeof a==="string"?a:a.address).toLowerCase()===PUBLIC_CONTACT_EMAIL.toLowerCase())?{channel:"smtp"}:null;
      }finally{transport.close();}
    }});
    return NextResponse.json(result.body,{status:result.status,headers:noStore});
  }catch{return NextResponse.json({ok:false,code:"receipt_unavailable",error:"Delivery is unconfirmed. Please do not repeatedly resubmit; use the email option if needed."},{status:503,headers:noStore});}
}