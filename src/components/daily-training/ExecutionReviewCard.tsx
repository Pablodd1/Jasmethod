import React from "react";
import { isExecutionEvaluation } from "@/lib/execution-feedback";

/** Protected local results only. No model prompt or chat-history integration. */
export function ExecutionReviewCard({review,es}:{review?:unknown;es:boolean}){
  if(!isExecutionEvaluation(review))return null;
  const label=review.state==="hold"?(es?"Revisión pendiente":"Review required"):review.state==="reduce"?(es?"Revisar o reducir la carga":"Review or reduce workload"):review.state==="review-for-progression"?(es?"Revisar posible progresión":"Review possible progression"):(es?"Mantener el plan revisado":"Maintain the reviewed plan");
  return <details className="card text-sm" aria-label={es?"Respuesta al entrenamiento reciente":"Recent training response"}>
    <summary className="cursor-pointer min-h-11 font-semibold">{es?"Entrenamiento reciente":"Recent training"} · {label}</summary>
    <p className="mt-2">{es?"Comparamos la prescripción con lo que registraste. Completar una sesión no aumenta tu capacidad automáticamente; no añadimos trabajo pendiente.":"We compare the prescription with your recorded results. Completing a session does not automatically increase capacity; missed work is not added."}</p>
    {!review.sessions.length&&<p className="mt-2">{es?"No hay resultados utilizables en esta revisión. Esto no significa que no hayas entrenado.":"No usable results are available for this review. This does not mean you have not trained."}</p>}
    <ul className="mt-2 space-y-2">{review.sessions.map(row=><li key={row.sessionId} className="rounded-lg border p-2">
      <p>{row.sport||"—"} · {row.observedAt?String(row.observedAt).slice(0,10):"—"} · {es?"Fuente":"Source"}: {row.source}</p>
      <p>{es?"Previsto":"Planned"}: {row.expectedMinutes??"—"} min · {es?"Real":"Actual"}: {row.actualMinutes??"—"} min · RPE: {row.rpe??"—"}/10</p>
      {!!row.conflicts.length&&<p>{es?"Hay datos contradictorios; revísalos antes de progresar.":"Some reported values conflict; review them before progressing."}</p>}
      {row.commentRecorded&&<p>{es?"Comentario guardado en el informe original.":"Comment saved with the original report."}</p>}
    </li>)}</ul>
  </details>;
}
