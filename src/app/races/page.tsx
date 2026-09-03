"use client";

import { useEffect, useState } from "react";
import { Flag, Plus, Trash2, Thermometer, Mountain, Waves, Clock, Gauge } from "lucide-react";
import Link from "next/link";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const DISTANCES = ["sprint", "olympic", "half", "full", "5k", "10k", "half-marathon", "marathon", "40k", "100k", "180k", "gran-fondo", "750m", "1500m", "1900m", "3800m", "hyrox", "boxing"];
const TERRAINS = ["flat", "rolling", "hilly", "mountain", "trail"];
const VENUES = ["pool", "lake", "ocean", "river"];

const empty = {
  name: "", distance: "olympic", date: "", startTime: "", location: "",
  targetTempC: "", humidity: "", baseElevM: "", goalTimeMin: "", priority: "1",
  bikeElevM: "", bikeTerrain: "", runElevM: "", runTerrain: "",
  swimVenue: "", waterTempC: "", swimCurrent: "", notes: "",
};

export default function RacesPage() {
  const { user } = useAuth();
  const lang = (user?.language || "en") as string;
  const [races, setRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch("/api/races");
    const d = await res.json();
    setRaces(d.races || []);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  function set(k: string, v: string) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/races", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          date: form.date ? new Date(form.date + "T00:00:00").toISOString() : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setForm(empty); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function del(id: string) {
    await fetch(`/api/races?id=${id}`, { method: "DELETE" });
    load();
  }

  const num = (v: any) => (v === "" || v === null || v === undefined ? null : Number(v));

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Races &amp; Venues</h1>
          <p className="text-slate-500 text-sm">Goal races with full venue data — temperature, elevation, terrain, and water conditions drive your plan.</p>
        </div>

        <Link href="/races/forecast" className="btn-primary justify-center w-fit">
          <Gauge className="w-4 h-4" /> AdvanzedRacing
        </Link>

        {err && <div className="text-sm text-coral-600 bg-coral-50 rounded-lg px-3 py-2">{err}</div>}

        {/* Races list */}
        {!loading && races.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {races.map((r) => (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display font-bold flex items-center gap-2"><Flag className="w-4 h-4 text-coral-500" /> {r.name}</div>
                    <div className="text-xs text-slate-500">
                      {r.distance} · {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      {r.startTime ? ` · ${r.startTime}` : ""}
                      {r.priority === 1 ? " · A-race" : ""}
                    </div>
                  </div>
                  <button onClick={() => del(r.id)} className="text-slate-400 hover:text-coral-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                  {r.weather && (
                    <div className="bg-sky-50 text-sky-800 rounded-lg px-2 py-1 mb-1">
                      🌤 {lang === "es" ? "Pronóstico día de carrera" : "Race-day forecast"}: {r.weather.tempC}°C ({lang === "es" ? "sensación" : "feels"} {r.weather.feelsLikeC}°C) · 💨 {r.weather.windKph} km/h · {r.weather.condition}
                    </div>
                  )}
                  {r.targetTempC != null && <div><Thermometer className="w-3 h-3 inline mr-1" />{r.targetTempC}°C{r.humidity != null ? ` · ${r.humidity}% RH` : ""}</div>}
                  {r.baseElevM != null && <div><Mountain className="w-3 h-3 inline mr-1" />{r.baseElevM}m base elevation</div>}
                  {r.bikeTerrain && <div>Bike: {r.bikeTerrain}{r.bikeElevM ? ` (${r.bikeElevM}m climb)` : ""}</div>}
                  {r.runTerrain && <div>Run: {r.runTerrain}{r.runElevM ? ` (${r.runElevM}m)` : ""}</div>}
                  {r.swimVenue && <div><Waves className="w-3 h-3 inline mr-1" />{r.swimVenue}{r.waterTempC != null ? ` · ${r.waterTempC}°C` : ""}{r.swimCurrent && r.swimCurrent !== "none" ? ` · ${r.swimCurrent} current` : ""}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add race */}
        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> Add Race</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Miami 70.3" required /></div>
              <div><label className="label">Distance</label>
                <select className="input" value={form.distance} onChange={(e) => set("distance", e.target.value)}>{DISTANCES.map((d) => <option key={d}>{d}</option>)}</select>
              </div>
              <div><label className="label">Priority</label>
                <select className="input" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
                  <option value="1">1 — A-race (anchor)</option><option value="2">2 — B-race</option><option value="3">3 — C-race</option>
                </select>
              </div>
              <div><label className="label">Date</label><input type="date" className="input" value={form.date} onChange={(e) => set("date", e.target.value)} required /></div>
              <div><label className="label">Start time</label><input type="time" className="input" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
              <div><label className="label">Location</label><input className="input" value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Miami, FL" /></div>
            </div>

            <div className="border-t border-sand-200 pt-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Environment</div>
              <div className="grid md:grid-cols-3 gap-3">
                <div><label className="label">Air temp (°C)</label><input type="number" className="input" value={form.targetTempC} onChange={(e) => set("targetTempC", e.target.value)} placeholder="28" /></div>
                <div><label className="label">Humidity (%)</label><input type="number" className="input" value={form.humidity} onChange={(e) => set("humidity", e.target.value)} placeholder="70" /></div>
                <div><label className="label">Base elevation (m)</label><input type="number" className="input" value={form.baseElevM} onChange={(e) => set("baseElevM", e.target.value)} placeholder="1600" /></div>
              </div>
            </div>

            <div className="border-t border-sand-200 pt-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Bike &amp; Run</div>
              <div className="grid md:grid-cols-4 gap-3">
                <div><label className="label">Bike terrain</label><select className="input" value={form.bikeTerrain} onChange={(e) => set("bikeTerrain", e.target.value)}><option value="">—</option>{TERRAINS.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div><label className="label">Bike climb (m)</label><input type="number" className="input" value={form.bikeElevM} onChange={(e) => set("bikeElevM", e.target.value)} placeholder="650" /></div>
                <div><label className="label">Run terrain</label><select className="input" value={form.runTerrain} onChange={(e) => set("runTerrain", e.target.value)}><option value="">—</option>{TERRAINS.map((t) => <option key={t}>{t}</option>)}</select></div>
                <div><label className="label">Run climb (m)</label><input type="number" className="input" value={form.runElevM} onChange={(e) => set("runElevM", e.target.value)} placeholder="120" /></div>
              </div>
            </div>

            <div className="border-t border-sand-200 pt-3">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Water</div>
              <div className="grid md:grid-cols-3 gap-3">
                <div><label className="label">Swim venue</label><select className="input" value={form.swimVenue} onChange={(e) => set("swimVenue", e.target.value)}><option value="">—</option>{VENUES.map((v) => <option key={v}>{v}</option>)}</select></div>
                <div><label className="label">Water temp (°C)</label><input type="number" className="input" value={form.waterTempC} onChange={(e) => set("waterTempC", e.target.value)} placeholder="21" /></div>
                <div><label className="label">Current</label><select className="input" value={form.swimCurrent} onChange={(e) => set("swimCurrent", e.target.value)}><option value="">—</option><option value="none">None</option><option value="mild">Mild</option><option value="strong">Strong</option></select></div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div><label className="label">Goal time (min)</label><input type="number" className="input" value={form.goalTimeMin} onChange={(e) => set("goalTimeMin", e.target.value)} placeholder="300" /></div>
              <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            </div>

            <button type="submit" disabled={busy} className="btn-primary justify-center"><Plus className="w-4 h-4" /> {busy ? "Saving…" : "Add Race"}</button>
          </form>
        </div>
      </div>
    </ProtectedPage>
  );
}
