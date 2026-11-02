"use client";
import { useEffect, useState } from "react";

type Question = { id: string; field: string | null; en: string; es: string; why: string };
type Model = { coldStart: boolean; coverageDays: number; level: string; levelSource: string; ageBand: string; spacingH: number; keyCap: number; notes: string[]; onboarding: Question[] };

/** "Build your daily coach": shows what the coach already knows from imported history
 * and asks only for what is missing. Answers go through the coach chat (propose → confirm). */
export function CoachOnboardingCard({ es }: { es: boolean }) {
  const [model, setModel] = useState<Model | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/athlete-model").then(r => (r.ok ? r.json() : null)).then(d => { if (alive && d?.model) setModel(d.model); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!model || (!model.coldStart && model.onboarding.length <= 2)) return null; // injuries/energy are always asked; show only when more is missing
  const qs = model.onboarding;
  return (
    <details aria-label={es ? "Ayuda opcional con tu perfil" : "Optional profile help"} className="mb-4 rounded-2xl border border-ocean-200 bg-white p-4">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{es ? "Ayuda con mi perfil (opcional)" : "Help with my profile (optional)"}</summary>
      <p className="mt-2 text-sm text-slate-600">{es ? "Revisa estos temas si falta información o algo cambió. No hace falta volver a responder datos ya guardados. Las preguntas de seguridad de hoy se revisan por separado." : "Review these topics if information is missing or something changed. You do not need to repeat saved details. Today's safety review stays separate."}</p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {qs.map(q => (
            <li key={q.id}>
              <span>{q.id === "connectHistory"
                ? es ? "Revisa el historial disponible en JMM o describe tu entrenamiento reciente en el chat." : "Review the history available in JMM or describe recent training in coach chat."
                : q.id === "anchors"
                  ? es ? "Revisa las referencias por deporte que faltan o necesitan actualizarse en tu perfil." : "Review sport-specific benchmarks that are missing or need updating in your profile."
                  : es ? q.es : q.en}</span>
            </li>
          ))}
        </ul>
        <a href="/coach" className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ocean-600 px-4 py-1.5 text-xs font-semibold text-white">
          {es ? "Hablar con el coach" : "Discuss with coach"}
        </a>
    </details>
  );
}
