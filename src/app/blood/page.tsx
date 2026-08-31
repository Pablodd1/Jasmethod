"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Plus, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { BLOOD_REFERENCE } from "@/lib/science";

const STATUS_ICON: Record<string, any> = { high: TrendingUp, low: TrendingDown, ok: Minus };

export default function BloodPage() {
  const { user } = useAuth();
  const [panels, setPanels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    lab: "",
    markers: [{ marker: "Ferritin", value: "", unit: "ng/mL", refLow: "", refHigh: "" }] as any[],
  });

  async function load() {
    const res = await fetch("/api/blood");
    const d = await res.json();
    setPanels(d.panels || []);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  function addMarkerRow() {
    setForm({ ...form, markers: [...form.markers, { marker: "", value: "", unit: "", refLow: "", refHigh: "" }] });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const results = form.markers
      .filter((m) => m.marker && m.value)
      .map((m) => ({
        marker: m.marker,
        value: parseFloat(m.value),
        unit: m.unit || BLOOD_REFERENCE[m.marker]?.unit,
        refLow: m.refLow || undefined,
        refHigh: m.refHigh || undefined,
      }));
    if (results.length === 0) return;
    const res = await fetch("/api/blood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: form.date, lab: form.lab, results }),
    });
    if (res.ok) {
      setShowForm(false);
      setSaved(true);
      load();
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const latestPanel = panels[0];

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Blood Panels</h1>
            <p className="text-slate-500 text-sm">Track performance-critical biomarkers — ferritin, vitamin D, testosterone, CK — against sports-medicine reference ranges.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-4 h-4" /> {showForm ? "Close" : "Add Panel"}
          </button>
        </div>
        {saved && <div className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">✓ Panel saved</div>}

        {showForm && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">New Blood Panel</h2>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3 max-w-lg">
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <label className="label">Lab</label>
                  <input className="input" value={form.lab} onChange={(e) => setForm({ ...form, lab: e.target.value })} placeholder="Quest / LabCorp" />
                </div>
              </div>
              <div className="space-y-2">
                {form.markers.map((m, i) => (
                  <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-center">
                    <input className="input" list="markers" placeholder="Marker (e.g. Ferritin)" value={m.marker} onChange={(e) => {
                      const markers = [...form.markers];
                      markers[i] = { ...markers[i], marker: e.target.value };
                      setForm({ ...form, markers });
                    }} />
                    <datalist id="markers">
                      {Object.keys(BLOOD_REFERENCE).map((k) => <option key={k} value={k} />)}
                    </datalist>
                    <input className="input" type="number" step="any" placeholder="Value" value={m.value} onChange={(e) => {
                      const markers = [...form.markers];
                      markers[i] = { ...markers[i], value: e.target.value };
                      setForm({ ...form, markers });
                    }} />
                    <input className="input" placeholder="Unit" value={m.unit} onChange={(e) => {
                      const markers = [...form.markers];
                      markers[i] = { ...markers[i], unit: e.target.value };
                      setForm({ ...form, markers });
                    }} />
                    <input className="input" placeholder="Ref low" value={m.refLow} onChange={(e) => {
                      const markers = [...form.markers];
                      markers[i] = { ...markers[i], refLow: e.target.value };
                      setForm({ ...form, markers });
                    }} />
                    <input className="input" placeholder="Ref high" value={m.refHigh} onChange={(e) => {
                      const markers = [...form.markers];
                      markers[i] = { ...markers[i], refHigh: e.target.value };
                      setForm({ ...form, markers });
                    }} />
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={addMarkerRow} className="btn-secondary">+ Add marker</button>
                <button type="submit" className="btn-primary">Save Panel</button>
              </div>
            </form>
          </div>
        )}

        {panels.length === 0 ? (
          <div className="card text-center py-16 text-slate-400">
            <FlaskConical className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">No blood panels yet</p>
            <p className="text-sm">Upload your lab results to get athlete-specific interpretation.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {panels.map((p) => (
              <div key={p.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2 className="font-display font-bold">{new Date(p.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</h2>
                    {p.lab && <div className="text-xs text-slate-400">{p.lab}</div>}
                  </div>
                  {p.id === latestPanel?.id && <span className="chip chip-z2">Latest</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 text-xs uppercase tracking-wide">
                        <th className="pb-2">Marker</th>
                        <th className="pb-2">Value</th>
                        <th className="pb-2">Reference</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Athlete note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.results.map((r: any) => {
                        const Icon = STATUS_ICON[r.status] || Minus;
                        return (
                          <tr key={r.id} className="border-t border-sand-100">
                            <td className="py-2.5 font-semibold">{r.marker}</td>
                            <td className="py-2.5 font-display font-bold">{r.value} <span className="text-xs text-slate-400 font-normal">{r.unit}</span></td>
                            <td className="py-2.5 text-slate-500">{r.refLow ?? "—"} – {r.refHigh ?? "—"}</td>
                            <td className="py-2.5">
                              <span className={`chip ${r.status === "high" ? "chip-z6" : r.status === "low" ? "chip-z5" : r.status === "optimize" ? "chip-z4" : "chip-z2"}`}>
                                <Icon className="w-3 h-3" /> {r.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-xs text-slate-400 max-w-xs">{r.athleteNote || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card bg-amber-50 border-amber-200">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <strong>Medical note:</strong> Blood results are educational, not diagnostic. Flagged values are compared against general reference ranges plus athlete-specific guidance (e.g. ferritin ≥50-60 ng/mL for endurance athletes). Always discuss with your physician — especially ferritin, testosterone, CK and thyroid.
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
