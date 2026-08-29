"use client";

import { useEffect, useState } from "react";
import { Trophy, Flag, RefreshCw, Footprints, Bike, Waves } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const SPORT_ICON: Record<string, any> = { run: Footprints, bike: Bike, swim: Waves };

function fmtMin(m: number): string {
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
}

export default function PrsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch("/api/prs");
    const d = await res.json();
    setData(d);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function sync() {
    setSyncing(true); setErr("");
    try {
      const res = await fetch("/api/connectors/sync", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Sync failed");
      load();
    } catch (e: any) { setErr(e.message); } finally { setSyncing(false); }
  }

  if (loading) return (<ProtectedPage><div className="flex justify-center py-32"><div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" /></div></ProtectedPage>);

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Trophy className="w-6 h-6 text-amber-500" /> Personal Records</h1>
            <p className="text-slate-500 text-sm mt-1">Your best efforts, computed from every synced device — the coach uses these to set your race targets.</p>
          </div>
          <button onClick={sync} disabled={syncing} className="btn-secondary shrink-0">
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync devices"}
          </button>
        </div>

        {err && <div className="text-sm text-coral-600 bg-coral-50 rounded-lg px-3 py-2">✗ {err}</div>}

        {data?.message && !data.prs?.length && (
          <div className="card text-slate-500 text-sm">{data.message}</div>
        )}

        {/* PR grid */}
        {data?.prs?.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3">
            {data.prs.map((p: any, i: number) => {
              const Icon = SPORT_ICON[p.sport] || Trophy;
              return (
                <div key={i} className="card flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0"><Icon className="w-5 h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{p.label}</div>
                    <div className="text-xs text-slate-400 truncate">{p.title} · {new Date(p.date).toLocaleDateString()}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-bold text-lg">
                      {p.watts ? `${p.watts} W` : p.km ? `${p.km} km` : fmtMin(p.minutes)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {p.paceSecKm ? `${Math.floor(p.paceSecKm / 60)}:${String(p.paceSecKm % 60).padStart(2, "0")} /km` :
                       p.paceSec100m ? `${Math.floor(p.paceSec100m / 60)}:${String(p.paceSec100m % 60).padStart(2, "0")} /100m` :
                       p.avgSpeedKmh ? `${p.avgSpeedKmh} km/h` :
                       p.watts ? `${p.watts} W` :
                       p.km ? `${p.km} km` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Races */}
        {data?.races?.length > 0 && (
          <div>
            <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Flag className="w-5 h-5 text-ocean-600" /> Races & events</h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-sand-200">
                    <th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Event</th><th className="py-2 pr-3">Time</th><th className="py-2 pr-3">Distance</th><th className="py-2 pr-3">Avg HR</th><th className="py-2 pr-3">Avg Power</th>
                  </tr>
                </thead>
                <tbody>
                  {data.races.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-sand-100">
                      <td className="py-2 pr-3">{new Date(r.date).toLocaleDateString()}</td>
                      <td className="py-2 pr-3 font-medium capitalize">{r.title}</td>
                      <td className="py-2 pr-3">{fmtMin(r.durationMin)}</td>
                      <td className="py-2 pr-3">{r.distanceKm ? `${Math.round(r.distanceKm * 10) / 10} km` : "—"}</td>
                      <td className="py-2 pr-3">{r.avgHr || "—"}</td>
                      <td className="py-2 pr-3">{r.avgPower ? `${r.avgPower} W` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
