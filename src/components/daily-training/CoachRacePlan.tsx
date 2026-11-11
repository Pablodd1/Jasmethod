"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RacePlanCard, type RacePlanSnapshot } from "@/components/race-plan-card";
import { readTrainingJson } from "./training-read";

function isSavedPlans(value: unknown): value is { snapshots: RacePlanSnapshot[] } {
  if (!value || typeof value !== "object") return false;
  const { snapshots } = value as { snapshots?: RacePlanSnapshot[] };
  return Array.isArray(snapshots) && snapshots.length <= 50 && snapshots.every(row =>
    row && typeof row.id === "string" && typeof row.createdAt === "string" && typeof row.stale === "boolean" &&
    typeof row.input?.name === "string" && Array.isArray(row.input.legs) && Array.isArray(row.result?.legs));
}

/** Owner-session read only. The response is rendered here, never added to chat/model history. */
export function CoachRacePlan({ es, imperial }: { es: boolean; imperial: boolean }) {
  const [plans, setPlans] = useState<RacePlanSnapshot[] | null>(null);
  const [selected, setSelected] = useState("");
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    readTrainingJson("/api/race-scenarios", { signal: controller.signal, label: "Race plan", validate: isSavedPlans })
      .then(({ snapshots }) => {
        if (!controller.signal.aborted) {
          setPlans(snapshots);
          setSelected(snapshots.length === 1 ? snapshots[0].id : "");
        }
      }, () => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [retry]);

  const plan = plans?.find(row => row.id === selected);
  return <section className="rounded-xl border p-3 space-y-3 min-w-0" aria-label={es ? "Revisión privada de carrera" : "Private race plan review"}>
    <h3 className="font-semibold">{es ? "Plan de carrera" : "Race plan"}</h3>
    {failed ? <p role="alert">{es ? "No se pudo cargar el plan. " : "Could not load your plans. "}<button className="underline min-h-11" onClick={()=>{setFailed(false);setRetry(n=>n+1);}}>{es ? "Reintentar" : "Retry"}</button></p>
      : !plans ? <p role="status">{es ? "Cargando planes…" : "Loading plans…"}</p>
      : !plans.length ? <p>{es ? "No tienes escenarios guardados." : "No saved race scenarios yet."}</p>
      : <label className="block text-sm">{es ? "Escenario guardado" : "Saved scenario"}<select className="input" value={selected} onChange={event=>setSelected(event.target.value)}>
        <option value="">{es ? "Elige la carrera y versión" : "Choose the race and version"}</option>
        {plans.map(row=><option key={row.id} value={row.id}>{row.input.name} · {row.metadata?.eventDate ?? row.input.startAt?.slice(0,10) ?? "—"} · {row.createdAt.slice(0,16).replace("T"," ")} UTC</option>)}
      </select></label>}
    {plan && <RacePlanCard snapshot={plan} es={es} imperial={imperial} />}
    <Link className="underline min-h-11 inline-flex items-center" href="/races/scenarios">{es ? "Abrir escenarios de carrera" : "Open race scenarios"}</Link>
  </section>;
}
