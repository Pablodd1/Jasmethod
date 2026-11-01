import React from "react";
import { targetReferenceSource } from "@/lib/session-metrics";

export function PlanTargetPreview({ preview, steps, es = false }: { preview: {
  steps: { targetLabel: string; speedLabel: string | null; reference: { source: string; observedAt: string } | null }[];
  mechanicalWork: { lowKj: number; highKj: number } | null;
}; steps: { zone: string }[]; es?: boolean }) {
  const rows = preview.steps.filter((step, index, all) => all.findIndex((other, j) =>
    other.targetLabel === step.targetLabel && steps[j]?.zone === steps[index]?.zone) === index);
  const work = preview.mechanicalWork;
  return <span className="block mt-2 text-sm">
    {rows.map((step, index) => <span className="block" key={index}>
      {step.targetLabel}{step.speedLabel ? ` · ${step.speedLabel}` : ""}
      {step.reference && <small className="block text-slate-600">{targetReferenceSource(step.reference.source, es)} · {step.reference.observedAt.slice(0, 10)}</small>}
    </span>)}
    {work && <span className="block"><strong>{es ? "Trabajo mecánico previsto" : "Planned mechanical work"}: {Math.floor(work.lowKj)}–{Math.ceil(work.highKj)} kJ</strong><small className="block">{es ? "Potencia × tiempo previstos; no son calorías de alimentación." : "Planned power × time; not fueling calories."}</small></span>}
  </span>;
}
