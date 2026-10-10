"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";

export type ImportCounts = {
  new: number;
  updated: number;
  duplicate: number;
  skipped: number;
  rejected: number;
};

type GarminPreview = {
  previewToken?: string;
  format: "activities-csv" | "tcx" | "unsupported";
  counts: ImportCounts;
  coverage: { start: string | null; end: string | null; accepted: number; completeArchive: false };
  warnings: string[];
  diagnostics: { row?: number; severity: string; code: string; message: string }[];
  sample: { date: string; sport: string; title: string; distanceKm?: number | null; durationMin: number; status: string; reason?: string }[];
  canCommit: boolean;
};

type DistanceUnit = "" | "km" | "mi" | "m" | "yd";
type ImportOptions = { unitSystem: "" | "metric" | "imperial"; timezone: string; swimDistanceUnit: DistanceUnit; distanceUnit: DistanceUnit; numberFormat: "" | "decimal-dot" | "decimal-comma" };
const INITIAL_OPTIONS: ImportOptions = { unitSystem: "", timezone: "", swimDistanceUnit: "", distanceUnit: "", numberFormat: "" };
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const SPANISH_DIAGNOSTICS: Record<string, string> = {
  BINARY_CONTENT: "El archivo contiene datos binarios. Usa un CSV de Actividades o un TCX original.",
  COLUMN_COUNT_MISMATCH: "La fila no tiene el mismo número de columnas que la cabecera. Vuelve a exportar el CSV original.",
  CONFLICTING_DISTANCE_UNITS: "Las unidades de distancia se contradicen. Comprueba la cabecera y las opciones del archivo.",
  CONFLICTING_IDENTITY: "Hay datos distintos para la misma actividad en este archivo. Revisa el origen; no se guardan las versiones en conflicto.",
  CSV_LIMIT: "El CSV supera el límite de columnas o el tamaño permitido por campo. Exporta un archivo más pequeño.",
  DISTANCE_UNIT_REQUIRED: "Confirma la unidad de distancia de esta actividad. Las distancias sin unidad de caminar u otros deportes no se deducen de las unidades de carrera.",
  DUPLICATE_HEADER: "El CSV contiene cabeceras duplicadas. Vuelve a exportar la lista de Actividades.",
  DUPLICATE_IN_FILE: "Esta misma actividad ya aparece en el archivo. La copia repetida se omite.",
  DURATION_ROUNDED: "La duración se guarda redondeada al minuto más cercano, con un mínimo de un minuto. Se conserva la duración original en segundos como referencia.",
  INTEGER_REQUIRED: "El pulso y las calorías deben ser números enteros. Revisa el valor original del archivo.",
  EMPTY_FILE: "El archivo está vacío.",
  FILE_TOO_LARGE: "El archivo supera 10 MB. Divide la exportación en intervalos más pequeños.",
  FIT_UNSUPPORTED: "No se admite FIT. Exporta la actividad como TCX o la lista de Actividades como CSV.",
  FUTURE_ACTIVITY: "La actividad empieza en el futuro. Revisa su fecha y la zona horaria de la exportación.",
  INCOMPLETE_TCX_METRICS: "Faltan resúmenes de calorías o pulso en algunas vueltas. Esas métricas incompletas se dejan sin valor.",
  INCONSISTENT_HEART_RATE: "El pulso medio y el máximo no son coherentes. Revisa los datos originales.",
  INCONSISTENT_TCX_TIME: "Las horas o duraciones de las vueltas TCX no son coherentes. Revisa la exportación original.",
  INVALID_ACTIVITY_ID: "El identificador de la actividad no es válido. Vuelve a exportar el archivo original.",
  INVALID_CLOCK: "No se pudo verificar la hora del servidor. Intenta previsualizar de nuevo.",
  INVALID_DATE: "La fecha no es válida o es ambigua. Usa una exportación con fecha YYYY-MM-DD y hora.",
  INVALID_DISTANCE_UNIT: "Las unidades de distancia deben ser km, mi, m o yd.",
  INVALID_DURATION: "La duración debe ser positiva, en formato HH:MM:SS y no superar 31 días.",
  INVALID_ENCODING: "Usa una exportación original en UTF-8. No se aceptan otras codificaciones ni archivos binarios.",
  INVALID_FILE: "No se pudo leer el archivo de forma segura. Vuelve a exportar un CSV de Actividades o un TCX.",
  INVALID_INPUT: "Selecciona un archivo de actividades exportado de Garmin.",
  INVALID_NUMBER: "Un número no coincide con el formato decimal seleccionado. Revisa el valor original y la opción de formato.",
  INVALID_NUMBER_FORMAT: "Selecciona punto decimal o coma decimal según los valores del archivo.",
  INVALID_TCX_FIELD: "Un campo TCX no es válido. Revisa la exportación original.",
  INVALID_TCX_LAPS: "La actividad TCX no contiene vueltas válidas. Vuelve a exportarla.",
  INVALID_TCX_TOTALS: "Los totales TCX no son válidos. Revisa la exportación original.",
  INVALID_TIMEZONE: "Elige una zona horaria IANA válida, como America/New_York o Europe/Madrid.",
  LOCAL_TIME_AMBIGUOUS: "Esta hora local ocurre dos veces por un cambio de horario. Exporta una fecha con desplazamiento UTC explícito.",
  LOCAL_TIME_NONEXISTENT: "Esta hora local no existe por un cambio de horario. Revisa la fecha o exporta una fecha con desplazamiento UTC explícito.",
  MALFORMED_CSV: "El CSV tiene comillas o filas mal formadas. Vuelve a exportar el CSV original de Actividades.",
  MALFORMED_XML: "El XML no está bien formado. Vuelve a exportar la actividad como TCX.",
  NO_ACTIVITIES: "No se encontraron actividades en el archivo.",
  NUMBER_FORMAT_REQUIRED: "Confirma el formato de números del archivo: punto decimal (1,234.5) o coma decimal (1.234,5). No se puede deducir de forma segura.",
  NUMBER_OUT_OF_RANGE: "Un valor numérico está fuera del intervalo admitido. Revisa la actividad original.",
  PARTIAL_HISTORY: "Los totales y fechas corresponden solo a las actividades de este archivo. No confirman todo el historial de Garmin ni incluyen el historial de bienestar.",
  RECORD_LIMIT: "El archivo contiene demasiadas actividades. Exporta un intervalo menor.",
  SPORT_OTHER: "Caminar y los deportes no reconocidos se conservan como «otro»; no se convierten en carrera.",
  SUMMARY_ROW: "Esta fila es un resumen, no una actividad individual, y se omite.",
  SWIM_DISTANCE_UNIT_REQUIRED: "Confirma la unidad de natación del archivo: metros, yardas, kilómetros o millas. No se deduce de las unidades de carrera.",
  TIMESTAMP_OFFSET_REQUIRED: "La fecha TCX debe incluir Z o un desplazamiento UTC explícito. Vuelve a exportar la actividad.",
  TIMEZONE_REQUIRED: "Confirma la zona horaria del CSV para interpretar las horas que no incluyen zona.",
  UNIT_SYSTEM_REQUIRED: "Confirma las unidades del CSV antes de interpretar las distancias sin unidad.",
  UNSAFE_XML: "El XML contiene funciones no admitidas por seguridad. Exporta un TCX original de la actividad.",
  UNSUPPORTED_CSV_SCHEMA: "Este CSV no tiene las columnas de la lista de Actividades. Los CSV de Informes y las exportaciones de todos los datos no se admiten.",
  UNSUPPORTED_FILE_TYPE: "Selecciona un CSV de la lista de Actividades o un TCX.",
  UNSUPPORTED_XML_SCHEMA: "El XML no es un archivo de actividades TCX compatible.",
  XML_LIMIT: "El TCX supera los límites de tamaño o complejidad. Exporta una actividad más pequeña.",
  ZIP_UNSUPPORTED: "No se admiten archivos ZIP. Selecciona un CSV de la lista de Actividades o un TCX individual; no se ha examinado el contenido del ZIP.",
};

export function garminDiagnosticText(code: string, fallback: string, es: boolean): string {
  return es ? SPANISH_DIAGNOSTICS[code] || fallback : fallback;
}

function garminDetailText(message: string, es: boolean): string {
  if (!es) return message;
  const translations: Record<string, string> = {
    "Sign in to preview or import your activity file.": "Inicia sesión para previsualizar o importar tus actividades.",
    "Choose a nonempty Activities CSV or TCX file.": "Elige un CSV de Actividades o un TCX que no esté vacío.",
    "Review at most 1000 activities at once. Export a smaller date range.": "Puedes revisar hasta 1000 actividades a la vez. Exporta un intervalo de fechas menor.",
    "This date range has too much saved history to review safely at once. Export a smaller date range.": "Este intervalo contiene demasiado historial guardado para revisarlo de forma segura. Exporta un intervalo menor.",
    "Review the file before confirming its import.": "Revisa la vista previa antes de confirmar la importación.",
    "The selected file or import options changed. Review a new preview.": "El archivo o sus opciones han cambiado. Revisa una vista previa nueva.",
    "The file, options or saved history changed. Review a fresh preview before importing.": "El archivo, las opciones o el historial guardado han cambiado. Revisa una vista previa nueva antes de importar.",
    "There are no valid new or updated activities to save. Review the preview diagnostics.": "No hay actividades válidas nuevas o por actualizar. Revisa los avisos de la vista previa.",
    "Saved history changed during import. Review a new preview.": "El historial guardado cambió durante la importación. Revisa una vista previa nueva.",
    "This is only the activity data in the selected file, not a complete Garmin account export, wellness record or training baseline.": "Solo se revisan las actividades del archivo seleccionado. No es una exportación completa de la cuenta de Garmin, un historial de bienestar ni una base de entrenamiento.",
    "Possible duplicates from another format or provider are kept unchanged. Conflicts are skipped for review, not silently merged.": "Los posibles duplicados de otro formato o proveedor se conservan sin cambios. Los conflictos se omiten para que puedas revisarlos.",
    "Confirmation saves completed activity history only. Your training cycle, planned sessions, notes, feedback and messaging preferences are preserved. No messages are sent by this file import.": "La confirmación guarda solo el historial de actividades realizadas. Se conservan tu ciclo, sesiones planificadas, notas, comentarios y preferencias de mensajes. Esta importación no envía mensajes.",
    "Conflicting rows share the same activity identity. Review the source file; neither version is saved.": "Varias filas con datos distintos tienen la misma identidad. Revisa el archivo; no se guarda ninguna de las versiones.",
    "A matching or conflicting activity already appears in this file. No second activity is added.": "Ya aparece una actividad coincidente o en conflicto en este archivo. No se añade otra copia.",
    "More than one saved activity has this identity. Review existing history first.": "Más de una actividad guardada tiene esta identidad. Revisa primero el historial existente.",
    "This identity belongs to protected or separately recorded history. It will not be overwritten.": "Esta identidad pertenece a un historial protegido o registrado por otra vía. No se sobrescribe.",
    "The saved activity has a different time or sport. Review the conflicting history before replacing it.": "La actividad guardada tiene otra hora o deporte. Revisa el conflicto antes de sustituirla.",
    "Matched the same Garmin file activity identity. Only supplied imported measurements change; notes, feedback and plans stay saved.": "Coincide con la misma actividad de archivo Garmin. Solo cambian las medidas incluidas; se conservan las notas, comentarios y planes.",
    "A similar completed activity is already saved, possibly from another format or provider. It is kept unchanged.": "Ya hay una actividad realizada similar, quizá de otro formato o proveedor. Se conserva sin cambios.",
    "Possible duplicate or conflicting activity near this start time. Review history; nothing is overwritten or added.": "Hay un posible duplicado o conflicto cerca de esta hora de inicio. Revisa el historial; no se sobrescribe ni añade nada.",
    "A performed planned session is already recorded for this sport and day. Review the possible match in history before adding another completed activity.": "Ya hay una sesión planificada y realizada registrada para este deporte y día. Revisa la posible coincidencia en el historial antes de añadir otra actividad realizada.",
    "No matching saved activity found. A completed activity will be added without replacing a training plan.": "No se encontró una actividad guardada coincidente. Se añadirá una actividad realizada sin sustituir el plan de entrenamiento.",
  };
  return translations[message] || message;
}

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-700";

// Treat an incomplete response as unknown, never as zero successful imports.
export function hasImportCounts(value: unknown): value is ImportCounts {
  if (!value || typeof value !== "object") return false;
  const counts = value as Record<string, unknown>;
  return ["new", "updated", "duplicate", "skipped", "rejected"].every(
    key => typeof counts[key] === "number" && Number.isSafeInteger(counts[key]) && (counts[key] as number) >= 0,
  );
}

export function hasGarminCoverage(value: unknown): value is GarminPreview["coverage"] {
  if (!value || typeof value !== "object") return false;
  const coverage = value as GarminPreview["coverage"];
  return coverage.completeArchive === false && Number.isSafeInteger(coverage.accepted) && coverage.accepted >= 0
    && [coverage.start, coverage.end].every(date => date === null || (typeof date === "string" && Number.isFinite(Date.parse(date))))
    && ((coverage.start === null && coverage.end === null) || (coverage.start !== null && coverage.end !== null && Date.parse(coverage.start) <= Date.parse(coverage.end)));
}

export function isGarminPreview(value: unknown): value is GarminPreview {
  if (!value || typeof value !== "object") return false;
  const data = value as GarminPreview;
  return ["activities-csv", "tcx", "unsupported"].includes(data.format)
    && hasImportCounts(data.counts)
    && typeof data.canCommit === "boolean"
    && (!data.canCommit || (typeof data.previewToken === "string" && /^[a-f0-9]{64}$/.test(data.previewToken)))
    && hasGarminCoverage(data.coverage)
    && Array.isArray(data.warnings) && data.warnings.every(w => typeof w === "string")
    && Array.isArray(data.diagnostics) && data.diagnostics.every(d => d && typeof d.message === "string" && typeof d.code === "string")
    && Array.isArray(data.sample) && data.sample.every(row => row && typeof row.date === "string" && typeof row.title === "string" && typeof row.sport === "string" && ["new", "updated", "duplicate", "skipped", "rejected"].includes(row.status) && Number.isFinite(row.durationMin) && row.durationMin > 0 && (row.distanceKm == null || (typeof row.distanceKm === "number" && Number.isFinite(row.distanceKm) && row.distanceKm >= 0)));
}

export function canSaveGarminPreview(preview: GarminPreview | null): boolean {
  return !!preview?.canCommit && !!preview.previewToken && preview.format !== "unsupported"
    && preview.counts.new + preview.counts.updated > 0;
}

function CountSummary({ counts, es, saved = false }: { counts: ImportCounts; es: boolean; saved?: boolean }) {
  const labels: [keyof ImportCounts, string][] = es
    ? [["new", saved ? "Nuevas guardadas" : "Nuevas"], ["updated", saved ? "Actualizadas" : "Por actualizar"], ["duplicate", "Duplicadas"], ["skipped", "Omitidas"], ["rejected", "Rechazadas"]]
    : [["new", saved ? "Newly saved" : "New"], ["updated", saved ? "Updated" : "To update"], ["duplicate", "Duplicates"], ["skipped", "Skipped"], ["rejected", "Rejected"]];
  return <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
    {labels.map(([key, label]) => <div key={key} className="min-w-0 rounded-lg bg-slate-50 p-2">
      <dt className="break-words text-slate-700">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums text-slate-900">{counts[key]}</dd>
    </div>)}
  </dl>;
}

function displayDate(date: string | null, timezone: string, es: boolean): string {
  if (!date) return "—";
  try {
    return new Intl.DateTimeFormat(es ? "es" : "en", {
      dateStyle: "medium", timeStyle: "short", timeZone: timezone || "UTC",
    }).format(new Date(date));
  } catch { return date; }
}

/** Files and preview tokens live only in this mounted component, never browser storage. */
export function GarminImportPanel({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const es = lang === "es";
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const request = useRef<{ generation: number; controller: AbortController | null; mode: "preview" | "save" | null }>({ generation: 0, controller: null, mode: null });
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ImportOptions>(INITIAL_OPTIONS);
  const [preview, setPreview] = useState<GarminPreview | null>(null);
  const [saved, setSaved] = useState<{ counts: ImportCounts; coverage: GarminPreview["coverage"]; timezone: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isCsv = !!file && /\.csv$/i.test(file.name);

  const invalidate = useCallback(() => {
    request.current.generation++;
    // Aborting a save cannot undo server writes. Only previews are abortable.
    if (request.current.mode === "preview") request.current.controller?.abort();
    request.current.controller = null;
    request.current.mode = null;
    setBusy(null);
    setPreview(null);
    setSaved(null);
    setError("");
    setNotice("");
  }, []);

  const discard = useCallback(() => {
    invalidate();
    setFile(null);
    setOptions(INITIAL_OPTIONS);
    if (fileInput.current) fileInput.current.value = "";
  }, [invalidate]);

  useEffect(() => {
    // Back/forward cache must not restore an old confirmation or raw file.
    window.addEventListener("pagehide", discard);
    // The ref object is never replaced; its fields track the latest request.
    const activeRequest = request.current;
    return () => {
      window.removeEventListener("pagehide", discard);
      activeRequest.generation++;
      if (activeRequest.mode === "preview") activeRequest.controller?.abort();
    };
  }, [discard]);

  useEffect(() => { if (preview) previewHeading.current?.focus(); }, [preview]);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);

  function formData() {
    const body = new FormData();
    if (file) body.append("file", file);
    if (isCsv) {
      body.append("unitSystem", options.unitSystem);
      body.append("timezone", options.timezone.trim());
      if (options.swimDistanceUnit) body.append("swimDistanceUnit", options.swimDistanceUnit);
      if (options.distanceUnit) body.append("distanceUnit", options.distanceUnit);
      if (options.numberFormat) body.append("numberFormat", options.numberFormat);
    }
    return body;
  }

  async function createPreview() {
    if (request.current.mode) return;
    invalidate();
    if (!file) {
      setError(es ? "Elige primero un archivo de actividades de Garmin." : "Choose a Garmin activity file first.");
      fileInput.current?.focus();
      return;
    }
    if (!/\.(csv|tcx|xml)$/i.test(file.name)) {
      setError(es ? "Usa el CSV de la lista de Actividades o un TCX. No se admiten FIT, ZIP ni el archivo completo de la cuenta." : "Use an Activities-list CSV or TCX. FIT, ZIP and the full account archive are not supported.");
      return;
    }
    if (!file.size || file.size > MAX_FILE_BYTES) {
      setError(es ? "Elige un archivo no vacío de hasta 10 MB. Exporta menos actividades si es mayor." : "Choose a non-empty file up to 10 MB. Export fewer activities if it is larger.");
      return;
    }
    if (isCsv && (!options.unitSystem || !options.timezone.trim())) {
      setError(es ? "Confirma las unidades y la zona horaria del CSV antes de previsualizar." : "Confirm the CSV's units and time zone before previewing.");
      return;
    }
    if (isCsv) {
      try { new Intl.DateTimeFormat("en", { timeZone: options.timezone.trim() }).format(); }
      catch {
        setError(es ? "Introduce una zona horaria válida, por ejemplo America/New_York o Europe/Madrid." : "Enter a valid time zone, for example America/New_York or Europe/Madrid.");
        return;
      }
    }
    const generation = request.current.generation;
    const controller = new AbortController();
    request.current.controller = controller;
    request.current.mode = "preview";
    setBusy("preview");
    try {
      const response = await fetch("/api/import/garmin/preview", { method: "POST", body: formData(), signal: controller.signal });
      const data: unknown = await response.json();
      if (request.current.generation !== generation) return;
      if (!response.ok) {
        const message = data && typeof data === "object" && "error" in data ? String(data.error) : "";
        throw new Error(garminDetailText(message, es) || (es ? "No se pudo preparar la vista previa." : "Could not prepare a preview."));
      }
      if (!isGarminPreview(data)) throw new Error(es ? "La respuesta de vista previa está incompleta. No se ha guardado nada; vuelve a intentarlo." : "The preview response is incomplete. Nothing has been saved; try again.");
      setPreview(data);
    } catch (cause) {
      if (request.current.generation === generation && !controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : (es ? "No se pudo crear la vista previa." : "Could not create a preview."));
    } finally {
      if (request.current.generation === generation) {
        request.current.mode = null;
        request.current.controller = null;
        setBusy(null);
      }
    }
  }

  async function saveImport() {
    if (request.current.mode || !file || !canSaveGarminPreview(preview)) return;
    const generation = request.current.generation;
    request.current.mode = "save";
    setBusy("save");
    setError("");
    const body = formData();
    body.append("previewToken", preview!.previewToken!);
    try {
      const response = await fetch("/api/import/garmin/commit", { method: "POST", body });
      const data = await response.json();
      if (request.current.generation !== generation) return;
      if (!response.ok || data?.ok !== true || !hasImportCounts(data.counts) || !hasGarminCoverage(data.coverage)) {
        throw new Error(typeof data?.error === "string" ? data.error : "");
      }
      setSaved({ counts: data.counts, coverage: data.coverage, timezone: isCsv ? options.timezone.trim() : "UTC" });
      setPreview(null);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      // Connector refresh failure cannot turn a verified save into a failed save.
      void Promise.resolve().then(onDone).catch(() => undefined);
    } catch (cause) {
      if (request.current.generation === generation) {
        // A lost response is not proof of failure. Re-preview reads current data
        // before the athlete can explicitly confirm another save.
        setPreview(null);
        const detail = cause instanceof Error && cause.message ? ` ${garminDetailText(cause.message, es)}` : "";
        setError((es ? "No se pudo confirmar el resultado del guardado. Algunas actividades podrían haberse guardado. Vuelve a previsualizar el archivo antes de intentarlo otra vez." : "The save result could not be confirmed. Some activities may have been saved. Preview the file again before retrying.") + detail);
      }
    } finally {
      if (request.current.generation === generation) {
        request.current.mode = null;
        setBusy(null);
      }
    }
  }

  function editOptions(next: Partial<ImportOptions>) {
    if (request.current.mode === "save") return;
    invalidate();
    setOptions(current => ({ ...current, ...next }));
  }

  const formatName = preview?.format === "activities-csv" ? (es ? "CSV de la lista de Actividades" : "Activities-list CSV") : preview?.format === "tcx" ? "TCX" : (es ? "Formato no admitido" : "Unsupported format");
  const dateZone = isCsv ? options.timezone.trim() : "UTC";

  return <section aria-labelledby={`${id}-title`} className="min-w-0 space-y-3 text-sm text-slate-700">
    <h3 id={`${id}-title`} className="font-semibold text-slate-900">{es ? "Importar actividades de Garmin" : "Import Garmin activities"}</h3>
    <p id={`${id}-formats`}>
      {es ? "Acepta el CSV de Actividades → Todas las actividades de Garmin Connect, o un TCX (máximo 10 MB y 1000 actividades por revisión). El CSV de Informes es un resumen y no sirve aquí. Tampoco se admiten «Todos los datos», FIT ni ZIP." : "Accepts Garmin Connect Activities → All Activities CSV, or a TCX (up to 10 MB and 1,000 activities per review). Reports CSV is a summary and cannot be used here. All-data account exports, FIT and ZIP are also unsupported."}
    </p>
    <p className="text-xs">{es ? "Primero revisa la vista previa. Las actividades se guardan solo cuando pulses «Confirmar y guardar». El archivo y la vista previa no se guardan en el almacenamiento persistente del navegador." : "Review a preview first. Activities are saved only when you choose “Confirm and save”. The file and preview are not kept in persistent browser storage."}</p>

    <div className="space-y-3">
      <label htmlFor={`${id}-file`} className="block font-medium">{es ? "Archivo de actividades" : "Activity file"}</label>
      <input ref={fileInput} id={`${id}-file`} type="file" accept=".csv,.tcx,.xml" aria-describedby={`${id}-formats`}
        disabled={busy === "save"} className={`input min-h-11 max-w-full text-xs ${FOCUS}`}
        onChange={event => {
          if (request.current.mode === "save") return;
          invalidate();
          setFile(event.target.files?.[0] ?? null);
          setOptions(INITIAL_OPTIONS);
        }} />
      {file && <p className="break-all text-xs">{file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MB</p>}

      {isCsv && <fieldset disabled={busy === "save"} className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 font-semibold">{es ? "Cómo leer este CSV" : "How to read this CSV"}</legend>
        <p className="text-xs">{es ? "Usa las unidades y la zona horaria de la exportación, que pueden ser distintas de las actuales. No se deducen de tu ubicación ni del idioma." : "Use the export's units and time zone, which may differ from your current settings. These are not inferred from your location or language."}</p>
        <div>
          <label htmlFor={`${id}-units`} className="mb-1 block font-medium">{es ? "Unidades del archivo (obligatorio)" : "File units (required)"}</label>
          <select id={`${id}-units`} className="input min-h-11" value={options.unitSystem} required onChange={event => editOptions({ unitSystem: event.target.value as ImportOptions["unitSystem"] })}>
            <option value="">{es ? "Selecciona las unidades" : "Select the units"}</option>
            <option value="metric">{es ? "Métricas (km para carrera y bicicleta)" : "Metric (km for running and cycling)"}</option>
            <option value="imperial">{es ? "Imperiales (millas para carrera y bicicleta)" : "Imperial (miles for running and cycling)"}</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-timezone`} className="mb-1 block font-medium">{es ? "Zona horaria del archivo (obligatorio)" : "File time zone (required)"}</label>
          <input id={`${id}-timezone`} value={options.timezone} className="input min-h-11" placeholder="America/New_York" autoComplete="off" autoCapitalize="none" spellCheck={false} required list={`${id}-zones`} aria-describedby={`${id}-zone-help`} onChange={event => editOptions({ timezone: event.target.value })} />
          <datalist id={`${id}-zones`}><option value="America/New_York" /><option value="America/Chicago" /><option value="America/Denver" /><option value="America/Los_Angeles" /><option value="Europe/Madrid" /><option value="UTC" /></datalist>
          <p id={`${id}-zone-help`} className="mt-1 text-xs">{es ? "Se usa cuando la fecha no incluye zona horaria. Si viajaste y las horas pertenecen a distintas zonas, separa las exportaciones para confirmar cada una." : "Used when a date has no time zone. If travel means the file contains local times from different zones, split the exports so you can confirm each one."}</p>
        </div>
        <div>
          <label htmlFor={`${id}-numbers`} className="mb-1 block font-medium">{es ? "Formato de números del archivo" : "Number format in this file"}</label>
          <select id={`${id}-numbers`} className="input min-h-11" value={options.numberFormat} onChange={event => editOptions({ numberFormat: event.target.value as ImportOptions["numberFormat"] })}>
            <option value="">{es ? "Sin confirmar" : "Not confirmed"}</option>
            <option value="decimal-dot">{es ? "Punto decimal: 1,234.5" : "Decimal point: 1,234.5"}</option>
            <option value="decimal-comma">{es ? "Coma decimal: 1.234,5" : "Decimal comma: 1.234,5"}</option>
          </select>
          <p className="mt-1 text-xs">{es ? "Obligatorio si hay decimales o separadores de miles. Comprueba un valor en el CSV; el idioma de JMM no determina este formato." : "Required for decimal values or thousands separators. Check a value in the CSV; JMM's language does not determine this format."}</p>
        </div>
        <div>
          <label htmlFor={`${id}-swim`} className="mb-1 block font-medium">{es ? "Unidad de natación, si hay distancias sin unidad" : "Swimming unit, if swim distances have no unit"}</label>
          <select id={`${id}-swim`} className="input min-h-11" value={options.swimDistanceUnit} onChange={event => editOptions({ swimDistanceUnit: event.target.value as DistanceUnit })}>
            <option value="">{es ? "No confirmada / no hay natación" : "Not confirmed / no swimming"}</option>
            <option value="m">{es ? "Metros" : "Meters"}</option><option value="yd">{es ? "Yardas" : "Yards"}</option><option value="km">{es ? "Kilómetros" : "Kilometers"}</option><option value="mi">{es ? "Millas" : "Miles"}</option>
          </select>
          <p className="mt-1 text-xs">{es ? "No adivines: comprueba las unidades de natación en Garmin. La vista previa indicará si faltan." : "Do not guess: check Garmin's swimming units. The preview will flag any missing units."}</p>
        </div>
        <details>
          <summary className={`min-h-11 cursor-pointer content-center font-medium ${FOCUS}`}>{es ? "Más opciones de distancia" : "More distance options"}</summary>
          <label htmlFor={`${id}-distance`} className="mb-1 mt-2 block font-medium">{es ? "Unidad de distancia explícita (opcional)" : "Explicit distance unit (optional)"}</label>
          <select id={`${id}-distance`} className="input min-h-11" value={options.distanceUnit} onChange={event => editOptions({ distanceUnit: event.target.value as DistanceUnit })}>
            <option value="">{es ? "Sin unidad adicional confirmada" : "No additional unit confirmed"}</option>
            <option value="km">{es ? "Kilómetros" : "Kilometers"}</option><option value="mi">{es ? "Millas" : "Miles"}</option><option value="m">{es ? "Metros" : "Meters"}</option><option value="yd">{es ? "Yardas" : "Yards"}</option>
          </select>
          <p className="mt-1 text-xs">{es ? "Úsala si la vista previa pide la unidad de caminar u otro deporte. Confirma que corresponde a todas las distancias sin unidad del archivo; natación usa su selector aparte." : "Use this if the preview requests a unit for walking or another sport. Confirm it matches every unlabeled distance in the file; swimming has its own selector."}</p>
        </details>
      </fieldset>}
      {file && !isCsv && /\.(tcx|xml)$/i.test(file.name) && <p className="text-xs">{es ? "TCX usa sus distancias en metros y las zonas horarias incluidas. Las fechas sin zona horaria no se aceptan." : "TCX uses its distances in meters and embedded time zones. Dates without a time zone are not accepted."}</p>}
    </div>

    {error && <p ref={errorMessage} tabIndex={-1} role="alert" className={`break-words rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 ${FOCUS}`}>{error}</p>}
    <p role="status" aria-live="polite" className="text-sm">
      {busy === "preview" ? (es ? "Analizando el archivo. Aún no se guarda ninguna actividad…" : "Checking the file. No activities are being saved yet…") : busy === "save" ? (es ? "Guardando las actividades confirmadas. Espera al resultado…" : "Saving the confirmed activities. Wait for the result…") : notice}
    </p>

    {preview && <div className="space-y-3 rounded-xl border border-ocean-200 p-3">
      <h4 ref={previewHeading} tabIndex={-1} className={`font-semibold text-ocean-900 ${FOCUS}`}>{es ? "Vista previa: todavía no se ha guardado" : "Preview: nothing saved yet"}</h4>
      <p>{es ? "Origen" : "Source"}: Garmin · {formatName}</p>
      <p className="break-all text-xs">{file?.name}</p>
      <CountSummary counts={preview.counts} es={es} />
      <div className="space-y-1 text-xs">
        <p>{es ? "Actividades aceptadas en este archivo" : "Accepted activities in this file"}: {preview.coverage.accepted}</p>
        <p>{es ? "Desde" : "From"}: {displayDate(preview.coverage.start, dateZone, es)}</p>
        <p>{es ? "Hasta" : "To"}: {displayDate(preview.coverage.end, dateZone, es)}</p>
        <p>{es ? "Fechas mostradas en" : "Dates shown in"}: {dateZone}</p>
        {!preview.coverage.start && <p>{es ? "No hay un intervalo de fechas válido que mostrar." : "No valid date range is available."}</p>}
        <p>{es ? "La cobertura corresponde solo a este archivo. No confirma que sea todo tu historial de Garmin ni incluye necesariamente peso, zonas o recuperación." : "Coverage describes only this file. It does not confirm your complete Garmin history or necessarily include weight, zones or recovery data."}</p>
      </div>
      {(preview.warnings.length > 0 || preview.diagnostics.length > 0) && <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-amber-900">
        <p className="font-semibold">{es ? "Avisos y filas que revisar" : "Warnings and rows to review"}</p>
        <ul className="list-disc space-y-1 break-words pl-4 text-xs">
          {preview.warnings.map((warning, index) => <li key={`warning-${index}`}>{garminDetailText(warning, es)}</li>)}
          {preview.diagnostics.slice(0, 20).map((diagnostic, index) => <li key={`diagnostic-${index}`}>{diagnostic.row != null ? `${es ? "Fila" : "Row"} ${diagnostic.row}: ` : ""}{garminDiagnosticText(diagnostic.code, diagnostic.message, es)}</li>)}
        </ul>
        {preview.diagnostics.length > 20 && <p className="text-xs">{es ? "Se muestran los primeros 20 avisos. Los totales incluyen todas las filas." : "Showing the first 20 diagnostics. Counts include all rows."}</p>}
      </div>}
      {preview.sample.length > 0 && <details>
        <summary className={`min-h-11 cursor-pointer content-center font-medium ${FOCUS}`}>{es ? "Revisar muestra de actividades" : "Review activity sample"}</summary>
        <p className="pt-2 text-xs">{es ? `Se muestran ${preview.sample.length} actividades de ${preview.coverage.accepted} aceptadas.` : `Showing ${preview.sample.length} of ${preview.coverage.accepted} accepted activities.`}</p>
        <ul className="space-y-2 pt-2">
          {preview.sample.map((row, index) => <li key={index} className="break-words rounded-lg bg-slate-50 p-2 text-xs">
            <p className="font-semibold">{row.title}</p>
            <p>{displayDate(row.date, dateZone, es)} · {es ? ({ run: "Carrera", bike: "Bicicleta", swim: "Natación", strength: "Fuerza", other: "Otro" } as Record<string, string>)[row.sport] || row.sport : row.sport}</p>
            <p>{row.durationMin.toLocaleString(es ? "es" : "en", { maximumFractionDigits: 2 })} min · {row.distanceKm == null ? (es ? "Distancia: — (no disponible)" : "Distance: — (unavailable)") : `${row.distanceKm.toLocaleString(es ? "es" : "en", { maximumFractionDigits: 3 })} km`}</p>
            <p>{({ new: es ? "Nueva" : "New", updated: es ? "Por actualizar" : "To update", duplicate: es ? "Duplicada, sin cambios" : "Duplicate, unchanged", skipped: es ? "Omitida" : "Skipped", rejected: es ? "Rechazada" : "Rejected" } as Record<string, string>)[row.status] || row.status}</p>
            {row.reason && <p className="mt-1">{garminDetailText(row.reason, es)}</p>}
          </li>)}
        </ul>
      </details>}
      <p className="text-xs">{es ? "Solo se guardan las actividades nuevas o por actualizar. Las duplicadas no cambian; las omitidas y rechazadas no se guardan." : "Only new or updated activities are saved. Duplicates stay unchanged; skipped and rejected rows are not saved."}</p>
      {!canSaveGarminPreview(preview) && <p role="status" className="font-medium">{preview.counts.new + preview.counts.updated + preview.counts.skipped + preview.counts.rejected === 0 && preview.counts.duplicate > 0
        ? (es ? "Las actividades válidas ya están guardadas. No hay cambios que guardar." : "Valid activities are already saved. There are no changes to save.")
        : (es ? "No hay una importación lista para guardar. Revisa los avisos y corrige el archivo o sus opciones." : "No import is ready to save. Review the warnings and correct the file or its options.")}</p>}
      <div className="flex flex-col gap-2">
        <button type="button" onClick={saveImport} disabled={busy !== null || !canSaveGarminPreview(preview)} className={`btn-primary min-h-11 max-w-full justify-center whitespace-normal ${FOCUS}`}>
          {busy === "save" ? (es ? "Guardando…" : "Saving…") : (es ? "Confirmar y guardar" : "Confirm and save")}
        </button>
        <button type="button" disabled={busy === "save"} onClick={() => { if (request.current.mode === "save") return; invalidate(); setNotice(es ? "Vista previa descartada. Revisa las opciones y crea otra antes de guardar." : "Preview discarded. Review the options and create a new preview before saving."); fileInput.current?.focus(); }} className={`btn-secondary min-h-11 justify-center whitespace-normal ${FOCUS}`}>{es ? "Volver y revisar" : "Back and review"}</button>
      </div>
    </div>}

    {saved && <div role="status" className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
      <p className="font-semibold">{es ? "Guardado confirmado" : "Save confirmed"}</p>
      <CountSummary counts={saved.counts} es={es} saved />
      <p className="text-xs">{es ? "Origen: archivo de actividades Garmin" : "Source: Garmin activity file"}</p>
      <p className="break-words text-xs">{displayDate(saved.coverage.start, saved.timezone, es)} → {displayDate(saved.coverage.end, saved.timezone, es)} ({saved.timezone})</p>
      <p className="text-xs">{es ? "Este intervalo corresponde al archivo revisado; no confirma todo tu historial." : "This range covers the reviewed file; it does not confirm your complete history."}</p>
      <p className="text-xs">{es ? "Estos son los resultados confirmados por el servidor. Revisa los datos disponibles antes de continuar; importar no completa los campos que faltan." : "These results were confirmed by the server. Review available data before continuing; importing does not fill missing fields."}</p>
      <a className={`block min-h-11 content-center underline ${FOCUS}`} href="/onboard?redo=1&step=profile">{es ? "Revisar datos y continuar" : "Review data and continue"}</a>
    </div>}

    {!preview && <button type="button" onClick={createPreview} disabled={!file || busy !== null} className={`btn-secondary min-h-11 w-full justify-center whitespace-normal disabled:opacity-50 ${FOCUS}`}>{busy === "preview" ? (es ? "Preparando vista previa…" : "Preparing preview…") : (es ? "Previsualizar actividades" : "Preview activities")}</button>}
    {(file || preview) && <button type="button" onClick={() => { if (request.current.mode === "save") return; discard(); setNotice(es ? "Archivo y vista previa descartados." : "File and preview discarded."); }} disabled={busy === "save"} className={`min-h-11 w-full rounded-xl px-3 underline disabled:opacity-50 ${FOCUS}`}>{es ? "Cancelar importación" : "Cancel import"}</button>}
  </section>;
}
