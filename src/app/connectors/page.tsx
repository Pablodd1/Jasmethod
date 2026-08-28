"use client";

import { useEffect, useState } from "react";
import { Plug, Upload, ExternalLink, CheckCircle2, XCircle, Cloud } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { t, type Lang } from "@/lib/i18n";

export default function ConnectorsPage() {
  const { user } = useAuth();
  const lang = (user?.language || "en") as Lang;
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

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

  const HELP: Record<string, string> = {
    garmin: "Garmin Connect → Activity → ⋯ → Export Original (.tcx). Upload the .tcx file.",
    apple: "iPhone Health app → Profile → Export All Health Data → unzip → upload export.xml.",
    whoop: "Whoop app → Profile → Settings → Export Data (cycle CSV). Upload the cycle CSV.",
  };

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t(lang, "conn.title")}</h1>
          <p className="text-slate-500 text-sm">Bring your history in from every platform — Strava OAuth, Garmin TCX, Apple Health export, Whoop CSV, Oura API.</p>
        </div>

        {msg && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ {msg}</div>}
        {err && <div className="text-sm text-coral-600 bg-coral-50 border border-coral-200 rounded-lg px-3 py-2">✗ {err}</div>}

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
                        <ExternalLink className="w-4 h-4" /> {p.status === "connected" ? "Sync now" : `Connect ${p.name}`}
                      </a>
                    ) : (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        Add {p.id.toUpperCase()}_CLIENT_ID and {p.id.toUpperCase()}_CLIENT_SECRET to enable OAuth.
                      </div>
                    )
                  )}
                  {p.method === "upload" && (
                    <div className="space-y-2">
                      {HELP[p.id] && <p className="text-[11px] text-slate-400">{HELP[p.id]}</p>}
                      <div className="flex gap-2">
                        <input id={`file-${p.id}`} type="file" className="input text-xs" accept={p.id === "tcx" ? ".tcx,.xml" : p.id === "apple" ? ".xml" : ".csv,.txt"} />
                        <button onClick={() => uploadImport(p.id)} disabled={importing === p.id} className="btn-secondary shrink-0">
                          <Upload className="w-4 h-4" /> {importing === p.id ? "Importing…" : t(lang, "conn.import")}
                        </button>
                      </div>
                    </div>
                  )}
                  {p.id === "oura" && (
                    p.configured ? (
                      <div className="text-xs text-slate-500">{t(lang, "conn.oura")}</div>
                    ) : (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                        Add OURA_CLIENT_ID/SECRET to enable Oura Cloud OAuth (cloud.ouraring.com — free dev account).
                      </div>
                    )
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
              <strong>{t(lang, "conn.which")}</strong> Strava OAuth is the best single source if you log there — it pulls a year of history automatically. Garmin TCX preserves power/HR data precisely. Whoop CSV brings HRV + recovery + sleep. Apple Health covers everything from iPhone. They all merge into one timeline.
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
