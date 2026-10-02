import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { geminiAnswer, geminiGenerationConfig } from "@/lib/gemini-response";
import { assistantInput, trainingProposal } from "@/lib/assistant-policy";
import {
  buildChatContext,
  localGroundedAnswer,
  groundedQuestionPayload,
} from "@/lib/kcoach-chat";
export const dynamic = "force-dynamic";

// KCoach chat — grounded in the athlete own data (owner request 2026-09-30).
// Doctrine preserved: the chat is a READ surface — it never modifies training.
// 1. Change requests -> answered locally with a pointer to the training editor.
// 2. ALWAYS: local grounded answer computed from the athlete real numbers.
// 3. If the athlete explicitly consents AND external AI is enabled: the
//    question PLUS a compact context digest go to Gemini (disclosed), and its
//    answer is preferred when it returns one.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let input;
  try {
    input = assistantInput(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const proposal = trainingProposal(input.question);
  const es = user.language === "es";
  if (proposal)
    return NextResponse.json({
      ok: true,
      mode: "local_proposal",
      trainingModified: false,
      proposal,
      answer:
        es
          ? "Entiendo que solicitas un cambio. No he modificado ninguna sesion. Revisa la sesion y sus objetivos en el editor de entrenamiento, confirma alli el cambio o consultalo con tu entrenador en la conversacion compartida."
          : "I interpreted this as a request to change training. No session has changed. Review the session and its purpose in the training editor, then confirm the change there or discuss it with your coach in the shared conversation.",
    });

  // Grounded context — the athlete own app data (profile, anchors, devices,
  // plan, history, next race). Server-side only; tokens/credentials never enter.
  const ctx = await buildChatContext(user.id, user.timezone).catch(() => null);
  const local = ctx
    ? localGroundedAnswer(input.question, ctx)
    : es
      ? "No pude cargar tu contexto de atleta. Intentalo de nuevo."
      : "I could not load your athlete context. Please try again.";

  const enabled = process.env.EXTERNAL_AI_ENABLED === "true";
  const key = process.env.GEMINI_API_KEY;
  if (input.externalConsent && enabled && key && ctx) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...groundedQuestionPayload(input.question, ctx),
            generationConfig: geminiGenerationConfig(model),
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      if (res.ok) {
        const answer = geminiAnswer(await res.json());
        if (answer)
          return NextResponse.json({
            ok: true,
            answer,
            mode: "kcoach_ai",
            trainingModified: false,
            disclosure:
              es
                ? "KCoach (IA): la respuesta usa tu pregunta mas un resumen de tu perfil, datos recientes y proxima carrera. Ningun cambio fue hecho a tu entrenamiento."
                : "KCoach (AI): the answer used your question plus a summary of your profile, recent data and next race. Nothing was changed in your training.",
          });
      }
    } catch {
      /* external failure falls through to the grounded local answer */
    }
  }
  return NextResponse.json({
    ok: true,
    mode: "kcoach_local",
    trainingModified: false,
    answer: local,
    disclosure:
      es
        ? "KCoach (local): respuesta calculada de tus datos reales en la app, sin IA externa."
        : "KCoach (local): computed from your real in-app data, no external AI.",
    externalStatus: !input.externalConsent
      ? "not_requested"
      : !enabled || !key
        ? "not_configured"
        : "unavailable",
  });
}
