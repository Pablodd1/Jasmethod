"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, ReferenceLine } from "recharts";
import { Activity, Gauge, Target } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const FORM_LABEL: Record<string, string> = { fresh: "Fresh — race-ready window", neutral: "Neutral", fatigued: "Fatigued — prioritize recovery", risky: "Risky — deep fatigue, back off" };

export default function FitnessPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/fitness");
    const d = await res.json();
    setData(d);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  const pmc = data?.pmc;
  const exec = data?.execution;
  const preds = data?.predictions || [];

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Performance Management</h1>
          <p className="text-slate-500 text-sm">Fitness / fatigue / form (TrainingPeaks PMC) · execution score (TriDot TrainX) · race predictions (RaceX).</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32"><div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* PMC chart */}
            {pmc ? (
              <div className="card">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h2 className="font-display font-bold text-lg flex items-center gap-2"><Activity className="w-5 h-5 text-ocean-500" /> Fitness · Fatigue · Form</h2>
                  <div className="text-sm text-slate-500">
                    CTL <strong>{pmc.current.ctl}</strong> · ATL <strong>{pmc.current.atl}</strong> · TSB <strong>{pmc.current.tsb}</strong>
                    <span className="ml-2 chip chip-z2">{FORM_LABEL[pmc.formZone]}</span>
                  </div>
                </div>
                {pmc.rampWarning && <div className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mb-2">⚠ {pmc.rampWarning}</div>}
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pmc.series} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={30} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#0ea5e9" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="atl" name="Fatigue (ATL)" stroke="#f59e0b" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="tsb" name="Form (TSB)" stroke="#10b981" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="card text-center py-10 text-slate-400">No completed workouts yet — the PMC builds as you log training.</div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              {/* Execution score */}
              <div className="card">
                <h2 className="font-display font-bold text-lg mb-2 flex items-center gap-2"><Gauge className="w-5 h-5 text-ocean-500" /> Execution (7 days)</h2>
                {exec ? (
                  <>
                    <div className="font-display text-3xl font-bold">{exec.score}<span className="text-base text-slate-400">/100</span></div>
                    <div className="text-sm text-slate-600">{exec.label}</div>
                    <div className="text-xs text-slate-400 mt-2">{exec.matched}/{exec.planned} sessions completed on plan · {exec.completionPct}% completion · {Math.round(exec.durationCompliance * 100)}% duration compliance</div>
                  </>
                ) : (
                  <p className="text-sm text-slate-400">No planned sessions in the last 7 days.</p>
                )}
              </div>

              {/* Race predictions */}
              <div className="card">
                <h2 className="font-display font-bold text-lg mb-2 flex items-center gap-2"><Target className="w-5 h-5 text-coral-500" /> Race Predictions</h2>
                {preds.length === 0 ? (
                  <p className="text-sm text-slate-400">Add your FTP / run &amp; swim threshold paces in Profile to see predictions.</p>
                ) : (
                  <div className="space-y-2">
                    {preds.map((p: any) => (
                      <div key={p.distance} className={`flex items-center justify-between text-sm p-2 rounded-lg ${data.goalDistance === p.distance ? "bg-ocean-50 border border-ocean-200" : ""}`}>
                        <span className="font-semibold capitalize">{p.distance}{data.goalDistance === p.distance ? " · goal" : ""}</span>
                        <span className="text-slate-600">{Math.floor(p.totalMin / 60)}h {p.totalMin % 60}m <span className="text-xs text-slate-400">(swim {p.swimMin}m / bike {p.bikeMin}m / run {p.runMin}m)</span></span>
                      </div>
                    ))}
                  </div>
                )}
                {preds.length > 0 && <div className="text-[11px] text-slate-400 mt-2">{preds[0].note}</div>}
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedPage>
  );
}
