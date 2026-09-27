import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { geminiAnswer, geminiGenerationConfig } from "@/lib/gemini-response";
import { assistantInput, trainingProposal, manualQuestionPayload } from "@/lib/assistant-policy";
export const dynamic = "force-dynamic";

// Conversation is a proposal surface, not another prescription writer.
// No profile, metrics, provider imports, forecasts or derived data enter AI context.
export async function POST(req: Request) {
 const user=await getCurrentUser();
 if(!user) return NextResponse.json({error:"Unauthorized"},{status:401});
 let input;
 try {input=assistantInput(await req.json());} catch(e) {return NextResponse.json({error:(e as Error).message},{status:400});}
 const proposal=trainingProposal(input.question);
 const es=user.language==="es";
 if(proposal) return NextResponse.json({ok:true,mode:"local_proposal",trainingModified:false,proposal,
  answer:es?"Entiendo que solicitas un cambio. No he modificado ninguna sesión. Revisa la sesión y sus objetivos en el editor de entrenamiento, confirma allí el cambio o consúltalo con tu entrenador en la conversación compartida.":"I interpreted this as a request to change training. No session has changed. Review the session and its purpose in the training editor, then confirm the change there or discuss it with your coach in the shared conversation."});
 const enabled=process.env.EXTERNAL_AI_ENABLED==="true";
 const key=process.env.GEMINI_API_KEY;
 if(input.externalConsent && enabled && key) {
  try {
   const model=process.env.GEMINI_MODEL||"gemini-3.6-flash";
   const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({...manualQuestionPayload(input.question,user.language),generationConfig:geminiGenerationConfig(model)}),signal:AbortSignal.timeout(20000)});
   if(res.ok) {const answer=geminiAnswer(await res.json());if(answer)return NextResponse.json({ok:true,answer,mode:"external_manual_question",trainingModified:false,disclosure:"Only the question you submitted was sent to Google Gemini. No saved athlete or device context was included. This response is not a reviewed prescription."});}
  } catch { /* A failed external service leaves the local help available. */ }
 }
 return NextResponse.json({ok:true,mode:"local_help",trainingModified:false,
  answer:es?"Ayuda local de JMM: registra sensaciones y medidas manuales en Check In; revisa y modifica sesiones en Entrenamiento; edita perfil y zonas en Configuración; consulta conexiones en Conectores. Habla con tu entrenador en la conversación compartida. Esta respuesta no analizó tus datos ni cambió tu plan.":"Local JMM help: enter feelings and manual measurements in Check In; review and edit sessions in Training; update your profile and zones in Settings; check connections in Connectors. Use the shared conversation to discuss changes with your coach. This response has not analyzed your records or changed your plan.",
  externalStatus:!input.externalConsent?"not_requested":!enabled||!key?"not_configured":"unavailable"});
}
