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
} from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
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
              "Todo tu historial se importa automáticamente.",
            ]
          : [
              'Click "Connect Strava" and log in.',
              "Authorize JasMiamiMethod to read your activities.",
              "Your full history imports automatically.",
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
                "Abre una actividad → ⋯ (engranaje) → «Exportar original» (.tcx).",
                "Sube el archivo .tcx aquí abajo.",
              ]
            : [
                "Go to connect.garmin.com and log in.",
                'Open an activity → ⋯ (gear) → "Export Original" (.tcx).',
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
          <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            ✓ {msg}
          </div>
        )}
        {err && (
          <div className="text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2">
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
                        {["connected", "error"].includes(p.status) && (
                          <button
                            className="underline mt-2"
                            onClick={async () => {
                              const r = await fetch("/api/connectors", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ provider: p.id }),
                              });
                              if (r.ok) await load();
                              else setErr("Could not disconnect");
                            }}
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {connected ? (
                    <span className="chip chip-z2">
                      <CheckCircle2 className="w-3 h-3" />{" "}
                      {t(lang, "conn.connected")}
                    </span>
                  ) : (
                    <span className="chip chip-z1">
                      <XCircle className="w-3 h-3" />{" "}
                      {t(lang, "conn.disconnected")}
                    </span>
                  )}
                </div>

                <div className="mt-4">
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
                  {stepsFor(p, lang).length > 0 && (
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

        {/* Strava bridge — the best automatic path for Garmin/COROS today */}
        <div className="card border-emerald-200 bg-emerald-50/60">
          <div className="flex gap-3">
            <RefreshCw className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-900">
              <strong>
                {lang === "es"
                  ? "Tienes Garmin o COROS? El puente automático:"
                  : "Garmin or COROS? The automatic bridge:"}
              </strong>{" "}
              {lang === "es"
                ? "1) Conecta tu reloj con Strava (en la app del reloj: Ajustes → Aplicaciones → Strava) — se hace una sola vez. 2) Conecta Strava aquí arriba. Desde ese momento cada entrenamiento del reloj entra solo a esta app, sin subir nada."
                : "1) Link your watch to Strava (in the watch app: Settings → Applications → Strava) — a one-time setup. 2) Connect Strava above. From then on every watch workout lands in this app by itself — no manual uploads."}
            </div>
          </div>
        </div>

        <div className="card bg-ocean-50 border-ocean-200">
          <div className="flex gap-3">
            <Plug className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" />
            <div className="text-sm text-ocean-900">
              <strong>{t(lang, "conn.which")}</strong>{" "}
              {lang === "es"
                ? "Strava importa los últimos 30 días en la primera sincronización. Los archivos TCX y Garmin CSV permiten añadir historial anterior. Whoop y Oura aportan recuperación y sueño; Apple Health acepta export.xml hasta 40 MB."
                : "Strava imports the last 30 days on first sync. TCX and Garmin CSV imports can add earlier history. Whoop and Oura supply recovery and sleep; Apple Health accepts export.xml up to 40 MB."}
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
