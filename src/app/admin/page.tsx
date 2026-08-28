"use client";

import { useEffect, useState } from "react";
import { Shield, Users, Activity, AlertTriangle, Plug, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

export default function AdminPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin");
    const d = await res.json();
    if (!res.ok) { setError(d.error || "failed"); setLoading(false); return; }
    setData(d);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  if (loading) return (<ProtectedPage><div className="flex justify-center py-32"><div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" /></div></ProtectedPage>);
  if (error) return (<ProtectedPage><div className="card text-coral-600 font-semibold">⛔ {error} — admin access required.</div></ProtectedPage>);

  const { rows, summary } = data;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2"><Shield className="w-6 h-6 text-ocean-600" /> Admin — All Athletes</h1>
          <p className="text-slate-500 text-sm">Credentials, progress, improvement, and training compliance across every account.</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card !p-4"><Users className="w-5 h-5 text-ocean-600" /><div className="font-display text-2xl font-bold mt-1">{summary.total}</div><div className="text-xs text-slate-500">Athletes</div></div>
          <div className="card !p-4"><Activity className="w-5 h-5 text-emerald-600" /><div className="font-display text-2xl font-bold mt-1">{summary.active}</div><div className="text-xs text-slate-500">Active (≤7d)</div></div>
          <div className="card !p-4 border-coral-200"><AlertTriangle className="w-5 h-5 text-coral-600" /><div className="font-display text-2xl font-bold mt-1">{summary.atRisk}</div><div className="text-xs text-slate-500">At risk (no workout)</div></div>
          <div className="card !p-4"><TrendingUp className="w-5 h-5 text-ocean-600" /><div className="font-display text-2xl font-bold mt-1">{summary.avgTss30}</div><div className="text-xs text-slate-500">Avg TSS 30d</div></div>
          <div className="card !p-4"><Plug className="w-5 h-5 text-ocean-600" /><div className="font-display text-2xl font-bold mt-1">{summary.connected}</div><div className="text-xs text-slate-500">Device connected</div></div>
        </div>

        {/* Athletes table */}
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wide border-b border-sand-200">
                <th className="py-2 pr-3">Athlete</th>
                <th className="py-2 pr-3">Goal / Level</th>
                <th className="py-2 pr-3">Key baseline</th>
                <th className="py-2 pr-3">Workouts 30d</th>
                <th className="py-2 pr-3">TSS 30d</th>
                <th className="py-2 pr-3">Last workout</th>
                <th className="py-2 pr-3">Check-in</th>
                <th className="py-2 pr-3">Benchmarks</th>
                <th className="py-2 pr-3">Devices</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-b border-sand-100">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold">{r.avatar} {r.name}</div>
                    <div className="text-xs text-slate-400">{r.email}</div>
                  </td>
                  <td className="py-2.5 pr-3 capitalize">
                    {r.goal || "—"}<div className="text-xs text-slate-400">{r.experience || ""}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.ftp ? `FTP ${r.ftp}W` : r.vo2max ? `VO2 ${r.vo2max}` : "—"}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`font-semibold ${r.workouts30 >= 8 ? "text-emerald-600" : r.workouts30 >= 4 ? "text-amber-600" : "text-coral-600"}`}>{r.workouts30}</span>
                    <div className="text-xs text-slate-400">streak {r.streak7}/7</div>
                  </td>
                  <td className="py-2.5 pr-3">{r.totalTss30}</td>
                  <td className="py-2.5 pr-3">
                    {r.lastWorkoutDays === null ? <span className="text-coral-600 font-medium">Never</span>
                      : r.lastWorkoutDays <= 3 ? <span className="text-emerald-600 font-medium">{r.lastWorkoutDays}d ago</span>
                      : r.lastWorkoutDays <= 7 ? <span className="text-amber-600 font-medium">{r.lastWorkoutDays}d ago</span>
                      : <span className="text-coral-600 font-medium">{r.lastWorkoutDays}d ago ⚠️</span>}
                  </td>
                  <td className="py-2.5 pr-3">{r.lastCheckinDays === null ? "—" : `${r.lastCheckinDays}d ago`}</td>
                  <td className="py-2.5 pr-3">
                    {r.benchmarkCount === 0 ? <span className="text-slate-400">none</span> : (
                      <div className="space-y-0.5">
                        {Object.entries(r.benchmarks).map(([type, b]: any) => (
                          <div key={type} className="flex items-center gap-1 text-xs">
                            {b.improved ? <TrendingUp className="w-3 h-3 text-emerald-600" /> : b.first !== b.latest ? <TrendingDown className="w-3 h-3 text-coral-600" /> : <Minus className="w-3 h-3 text-slate-400" />}
                            <span className="capitalize">{type}</span>
                            <span className="text-slate-400">{b.first}→{b.latest}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex gap-1 flex-wrap">
                      {r.connectors.length === 0 ? <span className="text-xs text-slate-400">—</span> :
                        r.connectors.map((c: any) => (
                          <span key={c.provider} className={`text-[10px] px-1.5 py-0.5 rounded ${c.status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {c.provider}
                          </span>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ProtectedPage>
  );
}
