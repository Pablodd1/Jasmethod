"use client";

import { useEffect, useState } from "react";
import { Plug, Upload, ExternalLink, CheckCircle2, XCircle, Cloud, RefreshCw } from "lucide-react";
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
  // Real-time sync progress: devices sync ONE per request so the bar moves
  // truthfully (no fake animation). Athlete sees per-device status + elapsed.
  const [sync, setSync] = useState<{
    running: boolean; current: number; total: number; currentName: string;
    results: { provider: string; name: string; ok: boolean; imported: number; error?: string }[];
    startedAt: number; elapsed: number; done: boolean;
  } | null>(null);

  async function syncAll() {
    const connected = providers.filter((p) => p.status === "connected");
    if (connected.length === 0) {
      setErr(lang === "es" ? "No hay dispositivos conectados todavía — conecta uno arriba." : "No connected devices yet — connect one above.");
      return;
    }
    setSyncing(true);
    setErr(""); setMsg("");
    setSync({ running: true, current: 0, total: connected.length, currentName: "", results: [], startedAt: Date.now(), elapsed: 0, done: false });
    const timer = setInterval(() => setSync((s) => (s && s.running ? { ...s, elapsed: Math.round((Date.now() - s.startedAt) / 1000) } : s)), 500);
    for (let i = 0; i < connected.length; i++) {
      const p = connected[i];
      setSync((s) => (s ? { ...s, current: i + 1, currentName: p.name } : s));
      try {
        const res = await fetch("/api/connectors/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: p.id }) });
        const d = await res.json();
        const r = d.synced?.[0];
        setSync((s) => s ? { ...s, results: [...s.results, { provider: p.id, name: p.name, ok: !r?.error, imported: r?.imported ?? 0, error: r?.error }] } : s);
        if (!res.ok || r?.error) setErr(`${p.name}: ${r?.error || d.error || "sync failed"}`);
      } catch (e: any) {
        setSync((s) => s ? { ...s, results: [...s.results, { provider: p.id, name: p.name, ok: false, imported: 0, error: e.message }] } : s);
        setErr(`${p.name}: ${e.message}`);
      }
    }
    clearInterval(timer);
    setSyncing(false);
    setSync((s) => (s ? { ...s, running: false, done: true, elapsed: Math.round((Date.now() - s.startedAt) / 1000) } : s));
    load();
  }

  async function load() {
    const res = await fetch("/api/connectors");
    const d = await res.json();
    setProviders(d.providers || []);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function uploadImport(source: string) {
    const input = document.getElementById(`file-${source}`) as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) { setErr(`Choose a file for ${source} first.`); setMsg(""); return; }
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
      setMsg(`${source}: ${data.workoutsImported ?? 0} workouts imported${data.metricsImported ? `, ${data.metricsImported} days of metrics` : ""}.`);
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
    google_cal: { url: "https://calendar.google.com", label: "calendar.google.com" },
    apple: { url: "https://support.apple.com/en-us/102246", label: "Apple Health export guide" },
    whoop: { url: "https://www.whoop.com", label: "whoop.com" },
    coros: { url: "https://www.coros.com", label: "coros.com" },
    oura: { url: "https://cloud.ouraring.com", label: "cloud.ouraring.com" },
  };

  function stepsFor(p: any, lang: Lang): string[] {
    const es = lang === "es";
    switch (p.id) {
      case "strava":
        return es
          ? ["Pulsa «Conectar Strava» e inicia sesión con tu cuenta.", "Autoriza a JasMiamiMethod a leer tus actividades (pantalla de Strava).", "Todo tu historial se importa automáticamente."]
          : ["Click \"Connect Strava\" and log in.", "Authorize JasMiamiMethod to read your activities.", "Your full history imports automatically."];
      case "garmin":
        return p.method === "oauth" && p.configured
          ? (es
            ? ["Pulsa «Conectar Garmin» e inicia sesión en Garmin Connect.", "Autoriza el acceso de lectura a tus actividades.", "Los entrenamientos sincronizan solos tras cada subida del reloj."]
            : ["Click \"Connect Garmin\" and log in to Garmin Connect.", "Authorize read access to your activities.", "Workouts sync after each watch upload."])
          : (es
            ? ["Entra en connect.garmin.com con tu cuenta.", "Abre una actividad → ⋯ (engranaje) → «Exportar original» (.tcx).", "Sube el archivo .tcx aquí abajo."]
            : ["Go to connect.garmin.com and log in.", "Open an activity → ⋯ (gear) → \"Export Original\" (.tcx).", "Upload the .tcx file here."]);
      case "google_cal":
        return es
          ? ["Pulsa «Conectar Google Calendar» e inicia sesión.", "Permite el acceso de solo lectura al calendario.", "El coach ve tus horas ocupadas y adapta el entrenamiento a tu agenda."]
          : ["Click \"Connect Google Calendar\" and log in.", "Allow calendar read access.", "The coach sees your busy time and fits training around it."];
      case "apple":
        return es
          ? ["En iPhone: app Salud → tu foto de perfil → «Exportar todos los datos de salud».", "Descomprime export.zip y busca export.xml.", "Sube export.xml aquí."]
          : ["On iPhone: Health app → your profile photo → \"Export All Health Data\".", "Unzip the export.zip to find export.xml.", "Upload export.xml here."];
      case "whoop":
        return p.method === "oauth" && p.configured
          ? (es
            ? ["Pulsa «Conectar Whoop» e inicia sesión.", "Autoriza el acceso de lectura.", "Recuperación, VFC y sueño sincronizan solos."]
            : ["Click \"Connect Whoop\" and log in.", "Authorize read access.", "Recovery, HRV & sleep sync automatically."])
          : (es
            ? ["App Whoop → Perfil → Ajustes → Exportar datos.", "Espera el correo con el CSV del ciclo.", "Sube el CSV aquí."]
            : ["Whoop app → Profile → Settings → Export Data.", "Wait for the cycle CSV email.", "Upload the CSV here."]);
      case "coros":
        return es
          ? ["COROS sincronizará solo vía API cuando esté configurado.", "Para acceso oficial a la API: api@coros.com.", "Mientras tanto, sube un archivo .fit o .tcx aquí."]
          : ["COROS syncs via Terra API (auto) when configured.", "For official API access, email api@coros.com.", "Otherwise upload a .fit/.tcx file here."];
      case "oura":
        return es
          ? ["Pulsa «Conectar Oura» e inicia sesión en tu cuenta Oura.", "Autoriza a JasMiamiMethod.", "Sueño, recuperación y VFC sincronizan solos."]
          : ["Click \"Connect Oura\" and log in to your Oura account.", "Authorize JasMiamiMethod.", "Sleep, readiness & HRV sync automatically."];
      default:
        return [];
    }
  }

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t(lang, "conn.title")}</h1>
          <p className="text-slate-500 text-sm">
            {lang === "es"
              ? "Conecta tus dispositivos o importa tu historial. Dos caminos: autoriza una vez y los datos llegan solos — o sube un archivo cuando quieras."
              : "Connect your devices or import your history. Two paths: authorize once and data flows in automatically — or upload a file anytime."}
          </p>
        </div>

        {/* How it works — 3 steps, always visible */}
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { n: "1", es: "Conecta y autoriza tu cuenta", en: "Connect & authorize your account" },
            { n: "2", es: "Los datos entran solos, cada día", en: "Data flows in by itself, daily" },
            { n: "3", es: "¿Sin API? Sube un archivo (.tcx / .csv / .xml)", en: "No API? Upload a file (.tcx / .csv / .xml)" },
          ].map((s) => (
            <div key={s.n} className="card flex items-center gap-3 !py-3">
              <span className="w-8 h-8 rounded-full bg-ocean-600 text-white font-display font-bold flex items-center justify-center shrink-0">{s.n}</span>
              <span className="text-sm font-medium text-slate-700">{lang === "es" ? s.es : s.en}</span>
            </div>
          ))}
        </div>

        {msg && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ {msg}</div>}
        {err && <div className="text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2">✗ {err}</div>}

        <div className="flex items-center justify-between">
          <button onClick={syncAll} disabled={syncing} className="btn-secondary shrink-0">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? (lang === "es" ? "Sincronizando…" : "Syncing…") : (lang === "es" ? "Sincronizar todos los dispositivos" : "Sync all devices")}
          </button>
          <span className="text-xs text-slate-400">{lang === "es" ? "Auto-sincroniza cada día a las 5:00 AM" : "Auto-syncs daily at 5:00 AM"}</span>
        </div>

        {/* Live sync progress — real per-device steps, elapsed time, errors inline */}
        {sync && (
          <div className="card border-ocean-200 bg-ocean-50/50">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="font-semibold text-sm text-ocean-900">
                {sync.running
                  ? (lang === "es" ? `Sincronizando ${sync.currentName} (${sync.current}/${sync.total})…` : `Syncing ${sync.currentName} (${sync.current}/${sync.total})…`)
                  : (lang === "es" ? `Sincronización completa — ${sync.total} dispositivo${sync.total === 1 ? "" : "s"} en ${sync.elapsed}s` : `Sync complete — ${sync.total} device${sync.total === 1 ? "" : "s"} in ${sync.elapsed}s`)}
              </div>
              <div className="text-xs text-slate-500 tabular-nums">{sync.elapsed}s</div>
            </div>
            <div className="h-3 bg-white rounded-full overflow-hidden border border-ocean-100">
              <div
                className={`h-full transition-all duration-500 ${sync.results.some((r) => !r.ok) ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${Math.round((sync.results.length / Math.max(1, sync.total)) * 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {sync.results.map((r) => (
                <span key={r.provider} className={`text-xs rounded-full px-2.5 py-1 font-medium ${r.ok ? "bg-emerald-100 text-emerald-700" : "bg-coral-100 text-coral-700"}`}>
                  {r.ok ? "✓" : "✗"} {r.name}{r.ok ? ` · +${r.imported}` : ""}
                </span>
              ))}
              {sync.running && <span className="text-xs rounded-full px-2.5 py-1 font-medium bg-ocean-100 text-ocean-700 animate-pulse">⏳ {sync.currentName}</span>}
            </div>
            {sync.done && sync.results.some((r) => !r.ok) && (
              <p className="text-xs text-coral-700 mt-2">
                {lang === "es"
                  ? "Algún dispositivo falló — el error está marcado arriba y el equipo ya fue notificado para ayudarte."
                  : "A device failed — the error is marked above and the team has been notified to help you."}
              </p>
            )}
            {sync.done && !sync.results.some((r) => !r.ok) && (
              <p className="text-xs text-emerald-700 mt-2">{lang === "es" ? "Todo sincronizado sin errores." : "Everything synced without errors."}</p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {providers.map((p) => {
            const connected = p.status === "connected";
            return (
              <div key={p.id} className={`card ${connected ? "border-emerald-300" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${connected ? "bg-emerald-100 text-emerald-600" : "bg-ocean-100 text-ocean-600"}`}>
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-display font-bold capitalize">{p.name}</div>
                      <div className="text-xs text-slate-500 max-w-[240px]">{p.description}</div>
                    </div>
                  </div>
                  {connected ? (
                    <span className="chip chip-z2"><CheckCircle2 className="w-3 h-3" /> {t(lang, "conn.connected")}</span>
                  ) : (
                    <span className="chip chip-z1"><XCircle className="w-3 h-3" /> {t(lang, "conn.disconnected")}</span>
                  )}
                </div>

                <div className="mt-4">
                  {p.method === "oauth" && (
                    p.configured ? (
                      <a href={p.connectUrl} className="btn-primary w-full justify-center">
                        <ExternalLink className="w-4 h-4" /> {p.status === "connected" ? (lang === "es" ? "Sincronizar ahora" : "Sync now") : (lang === "es" ? `Conectar ${p.name}` : `Connect ${p.name}`)}
                      </a>
                    ) : (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        {lang === "es"
                          ? `La conexión automática de ${p.name} aún no está activada. Mientras tanto: registra tus actividades en Strava o Apple Health y sube el archivo aquí (funciona hoy).`
                          : `${p.name} auto-connect isn't enabled yet. Meanwhile: log activities in Strava or Apple Health and upload the file here (works today).`}
                        <div className="text-[10px] text-amber-500 mt-1">
                          {lang === "es" ? "(Ajuste del servidor: " : "(Server setting: "}{p.id.toUpperCase()}_CLIENT_ID / {p.id.toUpperCase()}_CLIENT_SECRET)
                        </div>
                      </div>
                    )
                  )}
                  {p.method === "upload" && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input id={`file-${p.id}`} type="file" className="input text-xs" accept={p.id === "garmin" ? ".tcx,.xml,.fit" : p.id === "apple" ? ".xml" : ".csv,.txt"} />
                        <button onClick={() => uploadImport(p.id)} disabled={importing === p.id} className="btn-secondary shrink-0">
                          <Upload className="w-4 h-4" /> {importing === p.id ? (lang === "es" ? "Importando…" : "Importing…") : t(lang, "conn.import")}
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {lang === "es"
                          ? (p.id === "garmin" ? "Acepta archivos .tcx, .xml o .fit exportados de Garmin Connect." : p.id === "apple" ? "Acepta el export.xml de Apple Health." : "Acepta el CSV exportado de Whoop.")
                          : (p.id === "garmin" ? "Accepts .tcx, .xml or .fit files exported from Garmin Connect." : p.id === "apple" ? "Accepts the Apple Health export.xml." : "Accepts the CSV exported from Whoop.")}
                      </div>
                    </div>
                  )}
                  {p.id === "oura" && !p.configured && (
                    <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                      {lang === "es"
                        ? "Conexión automática de Oura aún no activada. Mientras tanto, tus datos pueden llegar vía Apple Health o Whoop."
                        : "Oura auto-connect isn't enabled yet. Meanwhile, your data can arrive via Apple Health or Whoop."}
                      <div className="text-[10px] text-amber-500 mt-1">
                        {lang === "es" ? "(Ajuste del servidor: OURA_CLIENT_ID / OURA_CLIENT_SECRET — cuenta dev gratis en cloud.ouraring.com)" : "(Server setting: OURA_CLIENT_ID / OURA_CLIENT_SECRET — free dev account at cloud.ouraring.com)"}
                      </div>
                    </div>
                  )}
                  {p.id === "oura" && p.configured && (
                    <div className="text-xs text-slate-500">{t(lang, "conn.oura")}</div>
                  )}
                  {stepsFor(p, lang).length > 0 && (
                    <div className="mt-3 text-xs text-slate-600">
                      <div className="font-medium text-ocean-700 mb-1">{lang === "es" ? "Pasos para conectar:" : "Steps to connect:"}</div>
                      <ol className="list-decimal pl-4 space-y-1 text-slate-500">
                        {stepsFor(p, lang).map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                      {LINKS[p.id] && (
                        <a href={LINKS[p.id].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-ocean-600 hover:underline mt-2">
                          <ExternalLink className="w-3 h-3" /> {LINKS[p.id].label}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="card bg-ocean-50 border-ocean-200">
          <div className="flex gap-3">
            <Plug className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" />
            <div className="text-sm text-ocean-900">
              <strong>{t(lang, "conn.which")}</strong>{" "}
              {lang === "es"
                ? "Strava es la mejor fuente única si registras ahí — trae un año de historial automáticamente. Garmin TCX conserva la potencia y la FC con precisión. El CSV de Whoop trae VFC + recuperación + sueño. Apple Health cubre todo lo del iPhone. Todo se fusiona en una sola línea de tiempo."
                : "Strava OAuth is the best single source if you log there — it pulls a year of history automatically. Garmin TCX preserves power/HR data precisely. Whoop CSV brings HRV + recovery + sleep. Apple Health covers everything from iPhone. They all merge into one timeline."}
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
