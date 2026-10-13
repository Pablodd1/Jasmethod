import type { UniversalWorkoutCard } from "./universal-workout-card";
import { isSavedWorkoutPreview, validSavedSessionId, type SavedWorkoutPreview } from "./saved-workout-preview-contract";

export function savedPreviewNotice(es: boolean): string {
  return es
    ? "Vista del plan guardado. No confirma que estés listo para entrenar, que hayas completado la sesión ni que el reloj la haya recibido. La guía de entrenamiento no está disponible aquí. Las referencias del perfil usan pruebas validadas actualmente."
    : "Saved plan preview. This does not confirm readiness to train, completed training, or watch delivery. The training guide is unavailable here. Profile references use currently validated benchmarks.";
}

/** Client-only presentation adapter for the three shared read-only sections.
 * Intentionally fails the executable-card contract: no real revision/athlete
 * token, blocked verdict and unavailable capability, even when structure exists.
 * Never pass this object to the full card, exports, editors, or delivery APIs.
 */
export function savedPreviewPresentation(preview: SavedWorkoutPreview, es: boolean): UniversalWorkoutCard | null {
  if (!isSavedWorkoutPreview(preview) || !preview.available || !preview.session) return null;
  const reason = savedPreviewNotice(es);
  const phases = es ? { warmup: "Calentamiento", active: "Trabajo principal", recovery: "Recuperación", cooldown: "Vuelta a la calma" }
    : { warmup: "Warm-up", active: "Main effort", recovery: "Recovery", cooldown: "Cool-down" };
  const sources = es ? { explicit: "objetivo explícito guardado", profile_reference: "referencia derivada del perfil", effort: "esfuerzo orientativo" }
    : { explicit: "saved explicit target", profile_reference: "profile-derived reference", effort: "effort guidance" };
  const sports = es ? { run: "Carrera", bike: "Ciclismo", swim: "Natación", strength: "Fuerza", mobility: "Movilidad", recovery: "Recuperación", brick: "Sesión combinada", hyrox: "HYROX", boxing: "Boxeo" }
    : { run: "Run", bike: "Bike", swim: "Swim", strength: "Strength", mobility: "Mobility", recovery: "Recovery", brick: "Brick", hyrox: "HYROX", boxing: "Boxing" };
  return {
    schemaVersion: "jmm-workout-card-v1", language: es ? "es" : "en",
    session: {
      ...preview.session, schemaVersion: 2, id: preview.sessionId, athleteId: "", revision: "", revisionNumber: 0,
      verdict: "blocked", reason,
      capability: { mode: "unavailable", available: false, fitSport: null, reason, deviceTested: false },
    },
    nutrition: null,
    content: {
      summary: reason,
      steps: preview.session.steps.map(step => [phases[step.phase], step.componentSport ? `${es ? "Componente" : "Component"}: ${sports[step.componentSport]}` : "",
        step.zone.toUpperCase(), `${step.target.label} (${sources[step.target.source]})`, step.target.missingReason].filter(Boolean).join(" · ")),
      before: [], during: [], after: [], preparation: [], limitations: [reason],
    },
    // Required structural fields for the shared component prop; never rendered.
    breathing: { beforeSeconds: 120, afterSeconds: 300, inhaleSeconds: 4, exhaleSeconds: 6, instructions: "", limitation: "" },
  };
}

export async function fetchSavedWorkoutPreview(sessionId: string, options: {
  signal: AbortSignal;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<SavedWorkoutPreview> {
  if (!validSavedSessionId(sessionId)) throw Error("Invalid session ID");
  if (options.signal.aborted) throw new DOMException("Preview closed", "AbortError");
  const abort = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => { abort.abort(); reject(new DOMException("Preview closed", "AbortError")); };
    options.signal.addEventListener("abort", cancel, { once: true });
    timeout = setTimeout(() => {
      abort.abort();
      reject(Error("The saved preview took too long to load. Retry to check the saved session."));
    }, options.timeoutMs ?? 15000);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await (options.fetcher ?? fetch)(`/api/plan/preview?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: abort.signal });
        let value: unknown;
        try { value = await response.json(); } catch { throw Error("Could not read the saved preview. Please retry."); }
        if (!response.ok) throw Error(response.status === 401 ? "Sign in to view the saved session." : "Could not load the saved session. Please retry.");
        if (!isSavedWorkoutPreview(value) || value.sessionId !== sessionId) throw Error("The saved preview could not be verified. Please retry.");
        return value;
      })(),
      cancelled,
    ]);
  } finally {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", cancel);
  }
}
