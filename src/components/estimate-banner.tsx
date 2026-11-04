"use client";
import { FlaskConical, X } from "lucide-react";
import { useState } from "react";

/** Missing measurements stay unknown; this banner never promises an estimate. */
export function EstimateBanner({ vo2maxMissing, lthrMissing, compact = false, language = "en" }: {
  vo2maxMissing?: boolean; lthrMissing?: boolean; vo2maxSource?: string | null;
  compact?: boolean; language?: string;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden || (!vo2maxMissing && !lthrMissing)) return null;
  const es = language === "es";
  return <aside className={compact ? "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm" : "card border-amber-200 bg-amber-50 relative"}>
    <FlaskConical className="w-5 h-5 text-amber-700 shrink-0" aria-hidden="true" />
    <div>
      <h3 className="font-display font-bold">{es ? "Añade solo referencias conocidas" : "Add only known references"}</h3>
      <p className="text-sm mt-1">{es ? "Los datos ausentes siguen sin confirmar. La edad, la FC de otro deporte y los picos de actividad no establecen tus umbrales ni tu VO₂max medido. Revisa las fuentes y fechas antes de actualizar una referencia." : "Missing measurements remain unknown. Age, another sport’s HR and activity peaks do not establish your thresholds or measured VO₂max. Review sources and dates before updating a reference."}</p>
      <a href="/labs" className="underline inline-block mt-2">{es ? "Revisar evaluaciones por deporte" : "Review sport-specific assessments"}</a>
    </div>
    <button type="button" onClick={() => setHidden(true)} aria-label={es ? "Cerrar" : "Dismiss"} className="ml-auto p-2 shrink-0"><X className="w-4 h-4" /></button>
  </aside>;
}
