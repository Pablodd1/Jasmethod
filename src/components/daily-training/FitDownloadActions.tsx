"use client";

import { useEffect, useRef, useState } from "react";
import { fitDownloadUrl, shareOrDownloadFit } from "./fit-transfer";
export { fitDownloadUrl } from "./fit-transfer";
import { deliveryGuideFor } from "@/lib/device-delivery";

export type FitCapability = { available: boolean; mode: string; reason: string; deviceTested: false };
function filenameFrom(response: Response): string {
  const match = response.headers.get("Content-Disposition")?.match(/filename="([^"\\/]+)"/i);
  return match?.[1]?.endsWith(".fit") ? match[1] : "jmm-workout.fit";
}

export function FitDownloadActions({ sessionId, revision, title, capability, disabled = false, es = false }: {
  sessionId: string; revision: string; title: string; capability: FitCapability;
  disabled?: boolean; es?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const guide = deliveryGuideFor("garmin", es ? "es" : "en");

  async function transfer(share: boolean) {
    if (pending.current || disabled || !capability.available || !revision) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(fitDownloadUrl(sessionId, revision), {
        method: "GET", credentials: "include", cache: "no-store", signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || (es ? "No se pudo descargar el FIT. Reintenta." : "FIT download failed. Please retry."));
      }
      const filename = filenameFrom(response);
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const file = new File([blob], filename, { type: "application/octet-stream" });
      const outcome = await shareOrDownloadFit(file, title, {
        ...(share ? {
          canShare: typeof navigator.canShare === "function" ? data => navigator.canShare(data) : undefined,
          share: typeof navigator.share === "function" ? data => navigator.share(data) : undefined,
        } : {}),
        download: () => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url; anchor.download = filename;
          document.body.appendChild(anchor); anchor.click(); anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      });
      if (controller.signal.aborted) return;
      setStatus(outcome === "shared"
        ? (es ? "La hoja de compartir terminó. La recepción en el reloj no está confirmada." : "Share sheet completed. Watch receipt is not confirmed.")
        : outcome === "cancelled"
          ? (es ? "Compartir cancelado. No se ha confirmado ninguna transferencia." : "Sharing cancelled. No transfer was confirmed.")
          : (es ? "Archivo descargado. Comprueba cada paso en tu dispositivo; la recepción no está confirmada." : "File downloaded. Check every step on your device; watch receipt is not confirmed."));

    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message);
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section aria-label={es ? "Descarga y transferencia FIT" : "FIT download and transfer"} className="space-y-2">
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn-primary jmm-button" disabled={busy || disabled || !capability.available || !revision} onClick={() => void transfer(false)}>
        {busy ? (es ? "Preparando FIT…" : "Preparing FIT…") : (es ? "Descargar entrenamiento (.FIT)" : "Download workout (.FIT)")}
      </button>
      <button type="button" className="btn-secondary jmm-button" disabled={busy || disabled || !capability.available || !revision} onClick={() => void transfer(true)}>{es ? "Compartir archivo FIT" : "Share FIT file"}</button>
    </div>
    <p className="text-sm">{capability.reason} {capability.available && (es ? "Compatibilidad del dispositivo sin verificar." : "Device compatibility unverified.")}</p>
    {error && <p role="alert" className="jmm-alert text-red-700">{error} {es ? "Actualiza el plan si ha cambiado y vuelve a intentarlo." : "Refresh the plan if it changed, then try again."}</p>}
    <p role="status" aria-live="polite" aria-atomic="true">{status}</p>
    <details>
      <summary className="cursor-pointer font-medium">{es ? "Ayuda: transferencia manual a Garmin por USB" : "Help: manual Garmin USB transfer"}</summary>
      <ol className="list-decimal pl-5 space-y-1">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <a className="underline" href={guide.helpUrl} target="_blank" rel="noopener noreferrer">{guide.helpLabel}</a>
    </details>
  </section>;
}
