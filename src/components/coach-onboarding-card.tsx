"use client";
import { useEffect, useState } from "react";
import { athleteHistoryCoverage, athleteHistorySummary, type AthleteHistoryCoverage } from "@/lib/athlete-history-coverage";

type Question = { id: string; field: string | null; en: string; es: string; why: string };
type Model = { coldStart: boolean; coverageDays: number; level: string; levelSource: string; ageBand: string; spacingH: number; keyCap: number; notes: string[]; onboarding: Question[] };

/** "Build your daily coach": shows what the coach already knows from imported history
 * and asks only for what is missing. Answers go through the coach chat (propose → confirm). */
export function CoachOnboardingCard({ es }: { es: boolean }) {
  const [model, setModel] = useState<Model | null>(null);
  const [historyCoverage, setHistoryCoverage] = useState<AthleteHistoryCoverage>({status:"withheld",days:null});
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/athlete-model").then(r => (r.ok ? r.json() : null)).then(d => {
      if (alive && d?.model) {
        setModel(d.model);
        setHistoryCoverage(athleteHistoryCoverage(d.provenance?.activity,d.model.coverageDays));
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!model || (!model.coldStart && model.onboarding.length <= 2)) return null; // injuries/energy are always asked; show only when more is missing
  const qs = model.onboarding;
  return (
    <section aria-label={es ? "Construye tu coach diario" : "Build your daily coach"} className="mb-4 rounded-2xl border border-ocean-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-sm font-bold">{es ? "Construye tu coach diario" : "Build your daily coach"}</h2>
          <p className="mt-1 text-xs text-slate-600">
            {athleteHistorySummary(historyCoverage,model.coldStart,es)}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {es ? "Nivel" : "Level"}: {model.level}{model.levelSource === "history-estimate" ? (es ? " (estimado del historial)" : " (estimated from history)") : ""} · {es ? "Separación entre días duros" : "Hard-day spacing"}: {model.spacingH} h · {es ? "Sesiones clave/semana" : "Key sessions/week"}: ≤{model.keyCap}
          </p>
        </div>
        <button type="button" className="rounded-full border border-ocean-300 px-3 py-1 text-xs font-semibold text-ocean-700" aria-expanded={open} onClick={() => setOpen(v => !v)}>
          {open ? (es ? "Ocultar" : "Hide") : `${qs.length} ${es ? "preguntas" : "questions"}`}
        </button>
      </div>
      {open && (
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          {qs.map(q => (
            <li key={q.id}>
              <span>{es ? q.es : q.en}</span>
              <span className="block text-[11px] text-slate-500">{q.why}</span>
            </li>
          ))}
        </ol>
      )}
      {open && (
        <a href="/coach" className="mt-3 inline-block rounded-full bg-ocean-600 px-4 py-1.5 text-xs font-semibold text-white">
          {es ? "Responder en el chat del coach" : "Answer in coach chat"}
        </a>
      )}
    </section>
  );
}
