"use client";

import { useEffect, useState } from "react";
import { readCoachGarminStatus, type CoachGarminStatus } from "@/lib/coach-delivery-status";

const labels = {
  schedule_verified: ["Garmin calendar schedule verified for this attempt.", "El evento del calendario de Garmin se verificó para este intento."],
  withdrawn: ["JMM recorded withdrawal from Garmin.", "JMM registró la retirada de Garmin."],
  working: ["JMM recorded a publication attempt in progress.", "JMM registró un intento de publicación en curso."],
  workout_created: ["Garmin returned a workout ID. The schedule remains unverified.", "Garmin devolvió un identificador de entrenamiento. El evento del calendario sigue sin verificar."],
  failed: ["JMM recorded a failed publication attempt.", "JMM registró un intento de publicación fallido."],
  unknown: ["The publication outcome is unknown. Check Garmin Connect before retrying.", "Se desconoce el resultado de la publicación. Consulta Garmin Connect antes de reintentar."],
} as const;

type DeliverySession = { id: string; date: string; title: string; sport: string };

export function CoachGarminDeliveryStatus({ sessions, initialSessionId, es }: {
  sessions: readonly DeliverySession[];
  initialSessionId?: string;
  es: boolean;
}) {
  const [selectedId, setSelectedId] = useState(initialSessionId ?? "");
  const selected = sessions.find(session => session.id === selectedId);

  return (
    <section className="space-y-2 rounded-xl border border-ocean-200 p-4 text-sm" aria-label={es ? "Estado de Garmin" : "Garmin delivery status"}>
      <h3 className="font-semibold">{es ? "Estado de Garmin" : "Garmin delivery status"}</h3>
      <label className="block space-y-1">
        <span>{es ? "Sesión de Garmin" : "Garmin workout"}</span>
        <select className="input w-full" value={selected?.id ?? ""} onChange={event => setSelectedId(event.target.value)} disabled={!sessions.length}>
          <option value="">{es ? "Selecciona una sesión" : "Select a workout"}</option>
          {sessions.map(session => <option key={session.id} value={session.id}>{session.date} · {session.title} · {session.sport}</option>)}
        </select>
      </label>
      {selected && <GarminAttempt key={selected.id} sessionId={selected.id} es={es} />}
      {!sessions.length && <p>{es ? "No hay sesiones disponibles para consultar." : "There are no workouts available to check."}</p>}
    </section>
  );
}

function GarminAttempt({ sessionId, es }: { sessionId: string; es: boolean }) {
  const [result, setResult] = useState<CoachGarminStatus | "error" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/connectors/garmin/preferences", {
          cache: "no-store",
          mode: "same-origin",
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Garmin status unavailable");
        const status = readCoachGarminStatus(await response.json(), sessionId);
        if (!controller.signal.aborted) setResult(status ?? "error");
      } catch {
        if (!controller.signal.aborted) setResult("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [sessionId]);

  if (result === null) return <p role="status">{es ? "Consultando el registro de publicación…" : "Checking the publication record…"}</p>;
  if (result === "error") return <p role="alert">{es ? "No se pudo consultar el estado de Garmin." : "Could not check Garmin delivery status."}</p>;
  return <>
    {result.receipt
      ? <p><time dateTime={result.receipt.date}>{result.receipt.date}</time>{" · "}{labels[result.receipt.status][es ? 1 : 0]}</p>
      : <p>{es ? "JMM no tiene un comprobante de publicación de Garmin para esta sesión." : "JMM has no Garmin publication receipt for this session."}</p>}
    {!result.available && <p>{es ? "La publicación directa no está disponible actualmente." : "Direct publication is currently unavailable."}</p>}
    <p>{es ? "La recepción en el reloj sigue sin verificar. El registro corresponde al último intento guardado." : "Watch receipt is unverified. This status reflects the last recorded attempt."}</p>
  </>;
}
