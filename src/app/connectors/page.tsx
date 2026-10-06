"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plug,
  Upload,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Cloud,
  RefreshCw,
  Medal,
} from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { useSearchParams } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

export default function ConnectorsPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [syncing, setSyncing] = useState(false);
  const handledCallback = useRef(false);
  // Real-time sync progress: devices sync ONE per request so the bar moves
  // truthfully (no fake animation). Athlete sees per-device status + elapsed.
  const [sync, setSync] = useState<{
    running: boolean;
    current: number;
    total: number;
    currentName: string;
    results: {
      provider: string;
      name: string;
      ok: boolean;
      imported: number;
      error?: string;
    }[];
    startedAt: number;
    elapsed: number;
    done: boolean;
  } | null>(null);

  async function syncAll() {
    const connected = providers.filter(
      (p) => p.method === "oauth" && ["connected", "error"].includes(p.status),
    );
    if (connected.length === 0) {
      setErr(
        lang === "es"
          ? "No hay dispositivos conectados todavía — conecta uno arriba."
          : "No connected devices yet — connect one above.",
      );
      return;
    }
    setSyncing(true);
    setErr("");
    setMsg("");
    setSync({
      running: true,
      current: 0,
      total: connected.length,
      currentName: "",
      results: [],
      startedAt: Date.now(),
      elapsed: 0,
      done: false,
    });
    const timer = setInterval(
      () =>
        setSync((s) =>
          s && s.running
            ? { ...s, elapsed: Math.round((Date.now() - s.startedAt) / 1000) }
            : s,
        ),
      500,
    );
    for (let i = 0; i < connected.length; i++) {
      const p = connected[i];
      setSync((s) => (s ? { ...s, current: i + 1, currentName: p.name } : s));
      try {
        const res = await fetch("/api/connectors/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: p.id }),
        });
        const d = await res.json();
        const r = d.synced?.[0];
        setSync((s) =>
          s
            ? {
                ...s,
                results: [
                  ...s.results,
                  {
                    provider: p.id,
                    name: p.name,
                    ok: res.ok && r?.ok === true,
                    imported: r?.imported ?? 0,
                    error: r?.error,
                  },
                ],
              }
            : s,
        );
        if (!res.ok || r?.error)
          setErr(`${p.name}: ${r?.error || d.error || "sync failed"}`);
      } catch (e: any) {
        setSync((s) =>
          s
            ? {
                ...s,
                results: [
                  ...s.results,
                  {
                    provider: p.id,
                    name: p.name,
                    ok: false,
                    imported: 0,
                    error: e.message,
                  },
                ],
              }
            : s,
        );
        setErr(`${p.name}: ${e.message}`);
      }
    }
    clearInterval(timer);
    setSyncing(false);
    setSync((s) =>
      s
        ? {
            ...s,
            running: false,
            done: true,
            elapsed: Math.round((Date.now() - s.startedAt) / 1000),
          }
        : s,
    );
    load();
  }

  async function load() {
    const res = await fetch("/api/connectors");
    const d = await res.json();
    setProviders(d.providers || []);
    setLoading(false);
  }
  useEffect(() => {
    if (!user) return;
    load();
    if (handledCallback.current) return;
    handledCallback.current = true;
    const query = new URLSearchParams(window.location.search);
    const error = query.get("error");
    const ok = query.get("ok");
    if (error) {
      const messages: Record<string, string> = {
        session_expired: "Your login expired during authorization. Sign in and connect again.",
        invalid_state: "The authorization response could not be verified. Connect again.",
        authorization_declined: "Authorization was cancelled or declined.",
        connection_failed: "Authorization returned, but the provider connection could not be saved. Connect again.",
        provider_account_already_linked: "This Intervals.icu account is linked to another JMM athlete. Use your own account or contact support.",
        disconnect_previous_account: "Disconnect your previous Intervals.icu account before linking a different one.",
        insufficient_scope: "Allow activity, wellness and calendar access to finish connecting Intervals.icu.",
        invalid_token_response: "Intervals.icu did not return a valid authorization. Connect again.",
        token_exchange_failed: "Intervals.icu authorization could not be completed. Connect again.",
        state_unavailable: "The authorization request expired or was already used. Connect again.",
        authorization_storage_failed: "The authorization request could not be stored. Please retry connecting.",
        denied: "Authorization was cancelled or declined.",
      };
      setErr(messages[error] || "The provider connection failed.");
      window.history.replaceState({}, "", "/connectors");
      return;
    }
    if (!ok) return;
    const provider = ok === "google-cal" ? "google_cal" : ok;
    const name = provider === "google_cal" ? "Google Calendar" : provider === "whoop" ? "WHOOP" : provider;
    setMsg(`${name} authorized. Verifying the connection and importing data…`);
    setSyncing(true);
    fetch("/api/connectors/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    })
      .then(async (res) => {
        const body = await res.json();
        const result = body.synced?.[0];
        if (!res.ok || !result?.ok)
          throw new Error(result?.error || body.error || "Verification failed");
        setErr("");
        setMsg(`${name} connected and verified. ${result.imported || 0} records imported.`);
      })
      .catch((e) => {
        setMsg(`${name} authorization was saved.`);
        setErr(`${name} data check failed: ${e.message}`);
      })
      .finally(() => {
        setSyncing(false);
        load();
        window.history.replaceState({}, "", "/connectors");
      });
  }, [user]);

  async function uploadImport(source: string) {
    const input = document.getElementById(`file-${source}`) as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) {
      setErr(`Choose a file for ${source} first.`);
      setMsg("");
      return;
    }
    setImporting(source);
    setErr("");
    setMsg("");
    const fd = new FormData();
    fd.append("source", source);
    fd.append("file", file);
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t(lang, "conn.importFailed"));
      setMsg(
        `${source}: ${data.workoutsImported ?? 0} workouts imported${data.metricsImported ? `, ${data.metricsImported} days of metrics` : ""}.`,
      );
      input.value = "";
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setImporting(null);
    }
  }

  // Device connection steps + external links. Steps are localized (es default,
  // en fallback); brand/path strings stay identical across languages.
  const LINKS: Record<string, { url: string; label: string }> = {
    strava: { url: "https://www.strava.com", label: "strava.com" },
    garmin: { url: "https://connect.garmin.com", label: "connect.garmin.com" },
    google_cal: {
      url: "https://calendar.google.com",
      label: "calendar.google.com",
    },
    apple: {
      url: "https://support.apple.com/en-us/102246",
      label: "Apple Health export guide",
    },
    whoop: { url: "https://www.whoop.com", label: "whoop.com" },
    coros: { url: "https://www.coros.com", label: "coros.com" },
    oura: { url: "https://cloud.ouraring.com", label: "cloud.ouraring.com" },
  };

  function stepsFor(p: any, lang: Lang): string[] {
    const es = lang === "es";
    switch (p.id) {
      case "strava":
        return es
          ? [
              "Pulsa «Conectar Strava» e inicia sesión con tu cuenta.",
              "Autoriza a JasMiamiMethod a leer tus actividades (pantalla de Strava).",
              "La primera sincronización consulta hasta 365 días de actividades disponibles; las siguientes consultan actividades desde un día antes de la última sincronización.",
            ]
          : [
              'Click "Connect Strava" and log in.',
              "Authorize JasMiamiMethod to read your activities.",
              "The first sync requests up to 365 days of available activities; later syncs request activities from one day before the last sync onward.",
            ];
      case "garmin":
        return p.method === "oauth" && p.configured
          ? es
            ? [
                "Pulsa «Conectar Garmin» e inicia sesión en Garmin Connect.",
                "Autoriza el acceso de lectura a tus actividades.",
                "Los entrenamientos sincronizan solos tras cada subida del reloj.",
              ]
            : [
                'Click "Connect Garmin" and log in to Garmin Connect.',
                "Authorize read access to your activities.",
                "Workouts sync after each watch upload.",
              ]
          : es
            ? [
                "Entra en connect.garmin.com con tu cuenta.",
                "Abre una actividad y elige «Exportar a TCX» en el menú de exportación. «Exportar original» puede generar un FIT, que este importador no acepta.",
                "Sube el archivo .tcx aquí abajo.",
              ]
            : [
                "Go to connect.garmin.com and log in.",
                'Open an activity and choose "Export to TCX" from its export menu. "Export Original" may produce a FIT file, which this importer does not accept.',
                "Upload the .tcx file here.",
              ];
      case "google_cal":
        return es
          ? [
              "Pulsa «Conectar Google Calendar» e inicia sesión.",
              "Permite el acceso al calendario.",
              "El coach ve tus horas ocupadas, adapta el entrenamiento y publica el plan en tu calendario.",
            ]
          : [
              'Click "Connect Google Calendar" and log in.',
              "Allow Calendar access.",
              "The coach reads busy time, fits training around it, and publishes the plan to your calendar.",
            ];
      case "apple":
        return es
          ? [
              "En el iPhone abre la app Salud → toca tu foto/nombre arriba → baja hasta «Exportar todos los datos de salud» → confirma.",
              "Apple prepara un .zip y lo envía por correo (puede tardar de minutos a horas) — descarga ese zip.",
              "Descomprime el zip y sube el archivo export.xml aquí abajo.",
            ]
          : [
              'On iPhone open the Health app → tap your picture/name at top → scroll to "Export All Health Data" → confirm.',
              "Apple builds a .zip and emails it to you (minutes to hours) — download that zip.",
              "Unzip it and upload the export.xml file below.",
            ];
      case "whoop":
        return p.method === "oauth" && p.configured
          ? es
            ? [
                "Pulsa «Conectar Whoop» e inicia sesión.",
                "Autoriza el acceso de lectura.",
                "Recuperación, VFC y sueño sincronizan solos.",
              ]
            : [
                'Click "Connect Whoop" and log in.',
                "Authorize read access.",
                "Recovery, HRV & sleep sync automatically.",
              ]
          : es
            ? [
                "App Whoop → Más → Ajustes → «Exportar datos» → solicita el archivo — llega por correo de Whoop.",
                "El correo trae un .zip: descomprímelo y sube aquí el CSV de recuperación (recovery).",
                "VFC, sueño y puntuación quedan guardados para el análisis del coach.",
              ]
            : [
                'Whoop app → More → Settings → "Export your data" → request it — arrives by Whoop email.',
                "The email contains a .zip: unzip it and upload the recovery CSV here.",
                "HRV, sleep and recovery scores are stored for the coach's analysis.",
              ];
      case "coros":
        return es
          ? [
              "COROS sincronizará solo vía API cuando esté configurado.",
              "Para acceso oficial a la API: api@coros.com.",
              "Mientras tanto, sube un archivo .fit o .tcx aquí.",
            ]
          : [
              "COROS syncs via Terra API (auto) when configured.",
              "For official API access, email api@coros.com.",
              "Otherwise upload a .fit/.tcx file here.",
            ];
      case "oura":
        // Honest state: without server keys the auto flow cannot start — the
        // old wording promised a connection that doesn't exist yet and left
        // athletes stranded on Oura's own site.
        if (!p.configured) {
          return es
            ? [
                "La conexión automática con Oura aún no está activada en el servidor.",
                "Mientras tanto: registra tu sueño manualmente en la página Sleep (o en el chequeo diario).",
                "El administrador puede activarla añadiendo las claves de API de Oura.",
              ]
            : [
                "Oura auto-connect isn't enabled on the server yet.",
                "Meanwhile: log your sleep manually on the Sleep page (or in the daily check-in).",
                "The administrator can enable it by adding the Oura API keys.",
              ];
        }
        return es
          ? [
              "Pulsa «Conectar Oura» e inicia sesión en tu cuenta Oura.",
              "Autoriza a JasMiamiMethod.",
              "Sueño, recuperación y VFC sincronizan solos.",
            ]
          : [
              'Click "Connect Oura" and log in to your Oura account.',
              "Authorize JasMiamiMethod.",
              "Sleep, readiness & HRV sync automatically.",
            ];
      default:
        return [];
    }
  }

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {t(lang, "conn.title")}
          </h1>
          <p className="text-slate-500 text-sm">
            {lang === "es"
              ? "Conecta tus dispositivos o importa tu historial. Dos caminos: autoriza una vez y los datos llegan solos — o sube un archivo cuando quieras."
              : "Connect your devices or import your history. Two paths: authorize once and data flows in automatically — or upload a file anytime."}
          </p>
        </div>

        {/* How it works — 3 steps, always visible */}
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            {
              n: "1",
              es: "Conecta y autoriza tu cuenta",
              en: "Connect & authorize your account",
            },
            {
              n: "2",
              es: "Los datos entran solos, cada día",
              en: "Data flows in by itself, daily",
            },
            {
              n: "3",
              es: "¿Sin API? Sube un archivo (.tcx / .csv / .xml)",
              en: "No API? Upload a file (.tcx / .csv / .xml)",
            },
          ].map((s) => (
            <div key={s.n} className="card flex items-center gap-3 !py-3">
              <span className="w-8 h-8 rounded-full bg-ocean-600 text-white font-display font-bold flex items-center justify-center shrink-0">
                {s.n}
              </span>
              <span className="text-sm font-medium text-slate-700">
                {lang === "es" ? s.es : s.en}
              </span>
            </div>
          ))}
        </div>

        {msg && (
          <div role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            ✓ {msg}
          </div>
        )}
        {err && (
          <div role="alert" className="text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2">
            ✗ {err}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button
            onClick={syncAll}
            disabled={syncing}
            className="btn-secondary shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />{" "}
            {syncing
              ? lang === "es"
                ? "Sincronizando…"
                : "Syncing…"
              : lang === "es"
                ? "Sincronizar todos los dispositivos"
                : "Sync all devices"}
          </button>
          <span className="text-xs text-slate-400">
            {lang === "es"
              ? "Auto-sincroniza cada día a las 5:00 AM"
              : "Auto-syncs daily at 5:00 AM"}
          </span>
        </div>

        {/* Live sync progress — real per-device steps, elapsed time, errors inline */}
        {sync && (
          <div className="card border-ocean-200 bg-ocean-50/50">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="font-semibold text-sm text-ocean-900">
                {sync.running
                  ? lang === "es"
                    ? `Sincronizando ${sync.currentName} (${sync.current}/${sync.total})…`
                    : `Syncing ${sync.currentName} (${sync.current}/${sync.total})…`
                  : lang === "es"
                    ? `Sincronización completa — ${sync.total} dispositivo${sync.total === 1 ? "" : "s"} en ${sync.elapsed}s`
                    : `Sync complete — ${sync.total} device${sync.total === 1 ? "" : "s"} in ${sync.elapsed}s`}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">
                {sync.elapsed}s
              </div>
            </div>
            <div className="h-3 bg-white rounded-full overflow-hidden border border-ocean-100">
              <div
                className={`h-full transition-all duration-500 ${sync.results.some((r) => !r.ok) ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{
                  width: `${Math.round((sync.results.length / Math.max(1, sync.total)) * 100)}%`,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {sync.results.map((r) => (
                <span
                  key={r.provider}
                  className={`text-xs rounded-full px-2.5 py-1 font-medium ${r.ok ? "bg-emerald-100 text-emerald-700" : "bg-coral-100 text-coral-700"}`}
                >
                  {r.ok ? "✓" : "✗"} {r.name}
                  {r.ok ? ` · +${r.imported}` : ""}
                </span>
              ))}
              {sync.running && (
                <span className="text-xs rounded-full px-2.5 py-1 font-medium bg-ocean-100 text-ocean-700 animate-pulse">
                  ⏳ {sync.currentName}
                </span>
              )}
            </div>
            {sync.done && sync.results.some((r) => !r.ok) && (
              <p className="text-xs text-coral-700 mt-2">
                {lang === "es"
                  ? "Algún dispositivo falló — el error está marcado arriba y está disponible en el panel del administrador."
                  : "A device failed — the error is marked above and is available in the administrator panel."}
              </p>
            )}
            {sync.done && !sync.results.some((r) => !r.ok) && (
              <p className="text-xs text-emerald-700 mt-2">
                {lang === "es"
                  ? "Todo sincronizado sin errores."
                  : "Everything synced without errors."}
              </p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {providers.map((p) => {
            const connected = p.status === "connected";
            // Health chip: green = connected & fresh; amber = connected but
            // delayed (no sync in 26h) or reconnect advised; red = error;
            // grey = disconnected. Users never see token terminology.
            const lastSync = p.lastSyncAt ? new Date(p.lastSyncAt).getTime() : 0;
            const stale = connected && Date.now() - lastSync > 26 * 3600000;
            const needsReconnect =
              p.status === "error" && /reconnect|expired|authorization/i.test(p.lastError || "");
            const chip = !connected && p.status !== "error"
              ? { cls: "chip chip-z1", dot: "bg-slate-400", label: t(lang, "conn.disconnected") }
              : needsReconnect
                ? { cls: "chip chip-z3", dot: "bg-amber-500", label: lang === "es" ? "Reconectar" : "Reconnect needed" }
                : p.status === "error"
                  ? { cls: "chip chip-z5", dot: "bg-red-500", label: lang === "es" ? "Error" : "Error" }
                  : stale
                    ? { cls: "chip chip-z3", dot: "bg-amber-500", label: lang === "es" ? "Sincronización retrasada" : "Sync delayed" }
                    : { cls: "chip chip-z2", dot: "bg-emerald-500", label: t(lang, "conn.connected") };
            if (p.method === "athlinks") {
              return (
                <AthlinksCard key={p.id} lang={lang} onDone={load} configured={p.configured} status={p.status} lastError={p.lastError} lastSyncAt={p.lastSyncAt} />
              );
            }
            return (
              <div
                key={p.id}
                className={`card ${connected ? "border-emerald-300" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center ${connected ? "bg-emerald-100 text-emerald-600" : "bg-ocean-100 text-ocean-600"}`}
                    >
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-display font-bold capitalize flex items-center gap-1.5">
                        {p.name}
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${p.method === "oauth" && p.configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {p.method === "oauth" && p.configured
                            ? lang === "es"
                              ? "Auto"
                              : "Auto"
                            : p.method === "upload"
                              ? lang === "es"
                                ? "Archivo"
                                : "Upload"
                              : p.method === "api_key"
                                ? "API key"
                                : "Unavailable"}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 max-w-[240px]">
                        {p.description}
                        <span className="block mt-2">
                          Last successful sync:{" "}
                          {p.lastSyncAt
                            ? new Date(p.lastSyncAt).toLocaleString()
                            : "not yet synced"}
                        </span>
                        {p.lastError && (
                          <span className="block text-red-700 mt-1">
                            {p.lastError}
                          </span>
                        )}
                        {["connected", "error", "disconnecting"].includes(p.status) && (
                          <button
                            className="underline mt-2"
                            onClick={async () => {
                              const r = await fetch("/api/connectors", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ provider: p.id }),
                              });
                              if (r.ok) await load();
                              else { const d = await r.json().catch(() => ({})); setErr(d.error || "Could not disconnect"); await load(); }
                            }}
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={chip.cls}>
                    <span className={`inline-block w-2 h-2 rounded-full ${chip.dot}`} /> {chip.label}
                  </span>
                </div>

                <div className="mt-4">
                  {p.id === "intervals" && <IntervalsGarminHelp lang={lang} configured={p.configured === true} />}
                  {p.id === "intervals" && p.status === "connected" && <IntervalsPreferences lang={lang} />}
                  {p.method === "oauth" &&
                    (p.configured ? (
                      <a
                        href={p.connectUrl}
                        className="btn-primary w-full justify-center"
                      >
                        <ExternalLink className="w-4 h-4" />{" "}
                        {p.status === "connected"
                          ? lang === "es"
                            ? "Reconectar"
                            : "Reconnect"
                          : lang === "es"
                            ? `Conectar ${p.name}`
                            : `Connect ${p.name}`}
                      </a>
                    ) : (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        {lang === "es"
                          ? `La conexión automática de ${p.name} aún no está activada. Mientras tanto: registra tus actividades en Strava o Apple Health y sube el archivo aquí (funciona hoy).`
                          : `${p.name} auto-connect isn't enabled yet. Meanwhile: log activities in Strava or Apple Health and upload the file here (works today).`}
                        <div className="text-[10px] text-amber-500 mt-1">
                          {lang === "es"
                            ? "(Ajuste del servidor: "
                            : "(Server setting: "}
                          {(p.setupEnv || []).join(" / ")})
                        </div>
                      </div>
                    ))}
                  {p.method === "unavailable" && (
                    <div className="text-sm text-slate-500">
                      <p>
                        {lang === "es"
                          ? "Conexión no configurada por el propietario."
                          : "Connection not configured by the owner."}
                      </p>
                      <p className="text-[10px] text-amber-600 mt-1">
                        {lang === "es" ? "Ajuste necesario: " : "Required setting: "}
                        {(p.setupEnv || []).join(" / ")}
                      </p>
                      <RequestButton provider={p.id} label={p.name} lang={lang} />
                    </div>
                  )}
                  {p.method === "upload" && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          id={`file-${p.id}`}
                          type="file"
                          className="input text-xs"
                          accept={
                            p.id === "garmin"
                              ? ".tcx,.xml,.csv"
                              : p.id === "apple"
                                ? ".xml"
                                : ".csv,.txt"
                          }
                        />
                        <button
                          onClick={() => uploadImport(p.id)}
                          disabled={importing === p.id}
                          className="btn-secondary shrink-0"
                        >
                          <Upload className="w-4 h-4" />{" "}
                          {importing === p.id
                            ? lang === "es"
                              ? "Importando…"
                              : "Importing…"
                            : t(lang, "conn.import")}
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {lang === "es"
                          ? p.id === "garmin"
                            ? "Acepta .tcx, .xml de Garmin Connect, o el Activities.csv (Actividades → Exportar CSV) para importar TODO tu historial de golpe."
                            : p.id === "apple"
                              ? "Acepta el export.xml de Apple Health."
                              : "Acepta el CSV exportado de Whoop."
                          : p.id === "garmin"
                            ? "Accepts .tcx, .xml from Garmin Connect, or the Activities.csv (Activities → Export CSV) to import your WHOLE history at once."
                            : p.id === "apple"
                              ? "Accepts the Apple Health export.xml."
                              : "Accepts the CSV exported from Whoop."}
                      </div>
                    </div>
                  )}
                  {p.id === "oura" && !p.configured && (
                    <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                      {lang === "es"
                        ? "Conexión automática de Oura aún no activada. Mientras tanto, tus datos pueden llegar vía Apple Health o Whoop."
                        : "Oura auto-connect isn't enabled yet. Meanwhile, your data can arrive via Apple Health or Whoop."}
                      <div className="text-[10px] text-amber-500 mt-1">
                        {lang === "es"
                          ? "(Ajuste del servidor: OURA_CLIENT_ID / OURA_CLIENT_SECRET — cuenta dev gratis en cloud.ouraring.com)"
                          : "(Server setting: OURA_CLIENT_ID / OURA_CLIENT_SECRET — free dev account at cloud.ouraring.com)"}
                      </div>
                    </div>
                  )}
                  {p.id === "oura" && p.configured && (
                    <div className="text-xs text-slate-500">
                      {t(lang, "conn.oura")}
                    </div>
                  )}
                  {/* Info links are separate from authorization: only show the
                      vendor portal link for CONFIGURED providers — an
                      unconfigured provider's CTA is the request button above. */}
                  {stepsFor(p, lang).length > 0 && p.configured !== false && (
                    <div className="mt-3 text-xs text-slate-600">
                      <div className="font-medium text-ocean-700 mb-1">
                        {lang === "es"
                          ? "Pasos para conectar:"
                          : "Steps to connect:"}
                      </div>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-500">
                        {stepsFor(p, lang).map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      {LINKS[p.id] && (
                        <a
                          href={LINKS[p.id].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-ocean-600 hover:underline mt-2"
                        >
                          <ExternalLink className="w-3 h-3" />{" "}
                          {LINKS[p.id].label}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {!loading && !providers.some(p => p.id === "intervals") && (
          <div className="card"><IntervalsGarminHelp lang={lang} configured={false} /></div>
        )}

        {/* Strava imports completed activities; it does not deliver planned workouts. */}
        <div className="card border-emerald-200 bg-emerald-50/60">
          <div className="flex gap-3">
            <RefreshCw className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <strong>
                {lang === "es"
                  ? "Garmin o COROS: importar actividades mediante Strava"
                  : "Garmin or COROS: import activities through Strava"}
              </strong>{" "}
              {lang === "es"
                ? "Conecta tu cuenta de Garmin o COROS a Strava y después autoriza Strava aquí, si está disponible. Esto permite importar actividades completadas que Strava autorice compartir. No envía entrenamientos estructurados de JMM a Garmin Connect ni al reloj."
                : "Connect your Garmin or COROS account to Strava, then authorize Strava here if available. This imports completed activities that Strava permits sharing. It does not send JMM structured workouts to Garmin Connect or your watch."}
            </div>
          </div>
        </div>

        <div className="card bg-ocean-50 border-ocean-200">
          <div className="flex gap-3">
            <Plug className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" />
            <div className="text-sm text-ocean-900">
              <strong>{t(lang, "conn.which")}</strong>{" "}
              {lang === "es"
                ? "Strava consulta hasta 365 días de actividades disponibles en la primera sincronización. Los archivos TCX y Garmin CSV permiten añadir historial anterior. Whoop y Oura aportan recuperación y sueño; Apple Health acepta export.xml hasta 40 MB."
                : "Strava requests up to 365 days of available activities on first sync. TCX and Garmin CSV imports can add earlier history. Whoop and Oura supply recovery and sleep; Apple Health accepts export.xml up to 40 MB."}
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}

// ---- Athlinks card: search → confirm identity → race history flows in ----
function AthlinksCard({
  lang,
  onDone,
  configured,
  status,
  lastError,
  lastSyncAt,
}: {
  lang: Lang;
  onDone: () => void;
  configured: boolean;
  status: string;
  lastError?: string | null;
  lastSyncAt?: string | null;
}) {
  const [linked, setLinked] = useState(status === "connected");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [raceCount, setRaceCount] = useState<number | null>(null);

  async function search() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/connectors/athlinks/search?q=${encodeURIComponent(query)}`);
      const d = await r.json();
      if (!r.ok) setMsg({ ok: false, text: d.error || "Search failed" });
      else {
        setCandidates(d.athletes || []);
        if (!d.athletes?.length)
          setMsg({ ok: false, text: lang === "es" ? "Sin resultados — prueba otro nombre." : "No matches — try another name." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(athlete: any) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/connectors/athlinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ racerId: athlete.racerId, name: athlete.name }),
      });
      const d = await r.json();
      if (r.ok) {
        setLinked(true);
        setRaceCount(d.racesImported ?? 0);
        setMsg({
          ok: true,
          text:
            lang === "es"
              ? `Conectado: ${d.racesImported} resultados importados${d.racesMerged ? `, ${d.racesMerged} combinados con tus carreras` : ""}.`
              : `Connected: ${d.racesImported} race results imported${d.racesMerged ? `, ${d.racesMerged} merged with your existing races` : ""}.`,
        });
        setCandidates([]);
        onDone();
      } else setMsg({ ok: false, text: d.error || "Link failed" });
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/connectors/athlinks", { method: "PATCH" });
      const d = await r.json();
      if (r.ok) {
        setRaceCount((d.racesImported || 0) + (d.racesMerged || 0));
        setMsg({ ok: true, text: lang === "es" ? "Historial actualizado." : "Race history refreshed." });
        onDone();
      } else setMsg({ ok: false, text: d.error || "Refresh failed" });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    await fetch("/api/connectors/athlinks", { method: "DELETE" });
    setLinked(false);
    setRaceCount(null);
    onDone();
  }

  return (
    <div className={`card ${linked ? "border-emerald-300" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${linked ? "bg-emerald-100 text-emerald-600" : "bg-ocean-100 text-ocean-600"}`}>
            <Medal className="w-5 h-5" />
          </div>
          <div>
            <div className="font-display font-bold">
              Athlinks{" "}
              <span className={`text-[9px] font-bold uppercase tracking-wide rounded-full px-1.5 py-0.5 ${configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {lang === "es" ? "Carreras" : "Races"}
              </span>
            </div>
            <div className="text-xs text-slate-500 max-w-[240px]">
              {lang === "es"
                ? "Tu historial oficial de carreras: resultados, puestos y récords — se concilia a diario."
                : "Your official race history: results, places and PRs — reconciled daily."}
              {linked && (
                <span className="block mt-2">
                  {lang === "es" ? "Última sincronización" : "Last sync"}:{" "}
                  {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : (lang === "es" ? "aún sin sincronizar" : "not yet synced")}
                </span>
              )}
              {linked && raceCount != null && raceCount > 0 && (
                <span className="block mt-1 font-semibold text-emerald-700">
                  {raceCount} {lang === "es" ? "resultados nuevos" : "new results"}
                </span>
              )}
              {lastError && <span className="block text-red-700 mt-1">{lastError}</span>}
            </div>
          </div>
        </div>
        {linked ? (
          <span className="chip chip-z2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" /> {t(lang, "conn.connected")}
          </span>
        ) : (
          <span className="chip chip-z1">
            <span className="inline-block w-2 h-2 rounded-full bg-slate-400" /> {t(lang, "conn.disconnected")}
          </span>
        )}
      </div>

      <div className="mt-4">
        {!configured ? (
          <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {lang === "es"
              ? "Athlinks aún no está activada en el servidor (se necesita la clave de API de Athlinks)."
              : "Athlinks isn't enabled on the server yet (the Athlinks API key is needed)."}
            <div className="text-[10px] text-amber-500 mt-1">(Server setting: ATHLINKS_API_KEY)</div>
          </div>
        ) : !linked ? (
          <div className="space-y-2">
            <div className="text-xs text-slate-600">
              {lang === "es"
                ? "1. Busca tu perfil de atleta. 2. Confirma que eres tú — solo entonces vinculamos tu historial."
                : "1. Search your athlete profile. 2. Confirm it's you — only then do we link your history."}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={lang === "es" ? "Tu nombre en Athlinks" : "Your name on Athlinks"}
                onKeyDown={(e) => e.key === "Enter" && query.trim().length >= 3 && search()}
              />
              <button onClick={search} disabled={busy || query.trim().length < 3} className="btn-secondary shrink-0">
                {lang === "es" ? "Buscar" : "Search"}
              </button>
            </div>
            {candidates.map((c) => (
              <button
                key={String(c.racerId)}
                onClick={() => confirm(c)}
                disabled={busy}
                className="w-full text-left rounded-xl border border-sand-200 px-3 py-2 text-sm hover:bg-ocean-50"
              >
                <span className="font-semibold">{c.name}</span>
                {c.location && <span className="text-slate-400"> · {c.location}</span>}
                <span className="block text-[10px] text-slate-400">Athlinks ID: {c.racerId}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={refresh} disabled={busy} className="btn-secondary flex-1 justify-center">
              <RefreshCw className="w-4 h-4" /> {lang === "es" ? "Actualizar historial" : "Refresh race history"}
            </button>
            <button onClick={unlink} className="underline text-sm self-center">
              {lang === "es" ? "Desvincular" : "Unlink"}
            </button>
          </div>
        )}
        {msg && (
          <div className={`text-xs rounded-lg px-2 py-1.5 mt-2 ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {msg.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Request-a-connector button: one tap pings the owner's Telegram ----
function RequestButton({
  provider,
  label,
  lang,
}: {
  provider: string;
  label: string;
  lang: Lang;
}) {
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [localErr, setLocalErr] = useState("");
  const es = lang === "es";
  if (state === "sent")
    return (
      <div className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 mt-2">
        ✓ {es ? "Solicitud enviada — el administrador fue notificado." : "Request sent — the administrator has been notified."}
      </div>
    );
  return (
    <button
      className="mt-2 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border border-ocean-300 text-ocean-700 hover:bg-ocean-50 disabled:opacity-50"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          const r = await fetch("/api/connectors/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider }),
          });
          const d = await r.json().catch(() => ({}));
          if (r.status === 429)
            setState("sent"); // already requested — treat as done
          else if (r.ok) setState("sent");
          else setLocalErr(d.error || "Failed");
        } catch {
          setState("idle");
        }
      }}
    >
      {localErr && <div className="text-[11px] text-red-600 mt-1">{localErr}</div>}
      🔔 {state === "busy"
        ? es ? "Enviando…" : "Sending…"
        : es ? "Pedir esta conexión" : "Request this connection"}
    </button>
  );
}

function IntervalsGarminHelp({ lang, configured }: { lang: Lang; configured: boolean }) {
  const es = lang === "es";
  const steps = es ? [
    "Cada atleta necesita sus propias cuentas de JMM, Intervals.icu y Garmin Connect. La conexión del coach no conecta a sus atletas.",
    "En Ajustes de Intervals.icu, conecta Garmin Connect y activa la descarga de actividades y los datos de bienestar disponibles. Activa también «Upload planned workouts» para enviar sesiones al dispositivo compatible.",
    "Conecta Intervals.icu desde JMM y autoriza actividad, bienestar y calendario. Revisa la última sincronización y los datos importados aquí.",
    "Completa el chequeo diario y aprueba la versión actual de tu sesión de hoy. Publica desde Hoy o activa la publicación automática cuando esté disponible. Actualmente se envían sesiones estructuradas de carrera y bicicleta mediante FIT; no otros deportes.",
    "Comprueba la sesión y sus pasos en Garmin Connect, sincroniza el reloj y abre el entrenamiento en él antes de empezar. Si falta, revisa cada paso de la conexión; no vuelvas a crear la sesión para forzar el envío.",
  ] : [
    "Each athlete needs their own JMM, Intervals.icu and Garmin Connect accounts. Connecting the coach does not connect the athletes.",
    "In Intervals.icu Settings, connect Garmin Connect and enable activity downloads and available wellness data. Also enable “Upload planned workouts” to forward sessions to your compatible device.",
    "Connect Intervals.icu from JMM and authorize activity, wellness and calendar access. Review the last successful sync and imported data here.",
    "Complete your daily check-in and approve the current version of today's workout. Publish from Today or enable automatic publication when available. Structured run and bike workouts are currently sent as FIT; other sports are not supported yet.",
    "Check the workout and its steps in Garmin Connect, sync your watch, and open the workout on it before starting. If it is missing, check each connection step; do not create a duplicate workout to force delivery.",
  ];
  return <details className="rounded-lg border border-slate-200 p-3 mb-3 text-sm text-slate-700">
    <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-600">
      {es ? "Garmin mediante Intervals.icu: configuración y límites" : "Garmin through Intervals.icu: setup and limits"}
    </summary>
    {!configured && <p className="mt-3 text-amber-800">{es
      ? "Esta conexión aún no está disponible en JMM. Puedes revisar estos pasos, pero la configuración en Intervals.icu por sí sola no activa la sincronización con JMM."
      : "This connection is not available in JMM yet. You can review these steps, but setup in Intervals.icu alone does not activate JMM synchronization."}</p>}
    <ol className="list-decimal pl-5 mt-3 space-y-2">{steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p className="mt-3">{es
      ? "Qué se importa: resúmenes de actividades y bienestar disponible, con una consulta inicial de hasta 180 días. Depende de los datos presentes en Intervals.icu y de tus permisos. No incluye el perfil completo de Garmin, zonas o umbrales, ni todos los puntos GPS, vueltas o muestras. Revisa tus zonas y objetivos en JMM; no se completan automáticamente mediante esta conexión. Se excluyen actividades de origen Strava o de origen desconocido."
      : "What imports: activity summaries and available wellness data, with an initial lookback of up to 180 days. This depends on data present in Intervals.icu and your permissions. It does not include your complete Garmin profile, zones or thresholds, or all GPS points, laps and samples. Review your zones and goals in JMM; this connection does not fill them automatically. Strava-sourced and unknown-source activities are excluded."}</p>
    <p className="mt-3 font-medium">{es
      ? "Una publicación aceptada confirma la recepción en Intervals.icu. JMM no recibe confirmación de entrega de Garmin Connect ni del reloj."
      : "An accepted publication confirms receipt by Intervals.icu. JMM does not receive delivery confirmation from Garmin Connect or your watch."}</p>
    <a href="https://forum.intervals.icu/t/upload-planned-workouts-to-garmin-connect/1521" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-3 text-ocean-700 underline">
      {es ? "Guía de Intervals.icu para Garmin" : "Intervals.icu Garmin guide"}<ExternalLink className="w-3 h-3" aria-hidden="true" />
    </a>
  </details>;
}

function IntervalsPreferences({ lang }: { lang: Lang }) {
  const [value, setValue] = useState<{ enabled: boolean; available: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/connectors/intervals/preferences").then(async r => {
      if (!r.ok) throw new Error("Could not load publication settings.");
      setValue(await r.json());
    }).catch(e => setError(e.message));
  }, []);
  return <div className="rounded-lg border p-3 mb-3 text-sm">
    <label className="flex gap-2 items-start">
      <input type="checkbox" checked={value?.enabled ?? false} disabled={busy || !value || (!value.available && !value.enabled)}
        onChange={async e => {
          setBusy(true); setError("");
          try {
            const r = await fetch("/api/connectors/intervals/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: e.target.checked }) });
            const d = await r.json(); if (!r.ok) throw new Error(d.error || "Could not save preference.");
            setValue(v => v ? { ...v, enabled: d.enabled } : v);
          } catch (e: any) { setError(e.message); } finally { setBusy(false); }
        }} />
      {lang === "es" ? "Publicar automáticamente mis sesiones aprobadas de carrera y bicicleta" : "Automatically publish my approved run and bike workouts"}
    </label>
    <p className="text-xs text-slate-500 mt-2">{lang === "es" ? "Al desactivar se detienen las publicaciones nuevas. Las sesiones publicadas siguen programadas y reciben actualizaciones o cancelaciones de seguridad. La recepción en el reloj no está confirmada." : "Turning this off stops new publications. Published sessions stay scheduled and receive safety updates or cancellations. Watch receipt is not confirmed."}</p>
    {value && !value.available && <p className="text-xs text-amber-700 mt-2">{lang === "es" ? "La publicación automática aún no está activada en este servidor." : "Automatic publication is not enabled on this server yet."}</p>}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
