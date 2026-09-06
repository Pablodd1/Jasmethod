import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/nutrition/photo — smart food logging.
// Athlete uploads a photo of a plate or a packaged product; Gemini vision
// identifies the foods, estimates portions, and returns macros the athlete
// can correct before saving. Nothing is stored unless they log the meal.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  if (!key) {
    return NextResponse.json({ error: "El análisis por foto necesita la clave de IA del servidor (GEMINI_API_KEY).", code: "NO_KEY" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const dataUrl = String(body?.image || "");
    const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!m) return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });
    const [, mime, b64] = m;
    if (b64.length > 8_000_000) return NextResponse.json({ error: "Foto demasiado grande." }, { status: 413 });

    const lang = user.language === "es" ? "es" : "en";
    const prompt = `You are a sports-nutrition vision assistant. Look at this food photo (a plate, multiple foods, or a packaged product with a label).
Identify each food or product. Estimate portions in grams from visual cues (plate size, packaging, label serving).
If it is a packaged product, read the label and prefer label macros per serving times estimated servings.
Return STRICT JSON only: {"foods":[{"name":"${lang === "es" ? "nombre en español" : "english name"}","grams":number}],"calories":number,"proteinG":number,"carbsG":number,"fatG":number,"notes":"one short ${lang} sentence with your confidence and what to double-check"}
Numbers are TOTALS for the whole photo. Round calories to 10, macros to 1.`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
        generationConfig: { maxOutputTokens: 500, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) return NextResponse.json({ error: `Gemini HTTP ${res.status}` }, { status: 502 });
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { return NextResponse.json({ error: "La IA no devolvió un análisis válido — intenta de nuevo con la foto más nítida." }, { status: 502 }); }
    if (!parsed || !Array.isArray(parsed.foods)) return NextResponse.json({ error: "Análisis vacío." }, { status: 502 });

    return NextResponse.json({
      ok: true,
      analysis: {
        food: parsed.foods.map((f: any) => `${f.name}${f.grams ? ` (${f.grams}g)` : ""}`).join(" + "),
        calories: Math.round(parsed.calories) || null,
        proteinG: parsed.proteinG ?? null,
        carbsG: parsed.carbsG ?? null,
        fatG: parsed.fatG ?? null,
        notes: parsed.notes || "",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
