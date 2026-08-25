"use client";

import { useEffect, useState } from "react";
import { Apple, Droplets, UtensilsCrossed, Calculator, Info } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { NUTRITION_GUIDELINES } from "@/lib/science";

export default function NutritionPage() {
  const { user } = useAuth();
  const [daily, setDaily] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ meal: "breakfast", food: "", calories: "", proteinG: "", carbsG: "", fatG: "" });
  const [waterForm, setWaterForm] = useState({ ml: "250", source: "water" });
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/nutrition?days=7");
    const d = await res.json();
    setDaily(d.daily || []);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function logFood(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ meal: "breakfast", food: "", calories: "", proteinG: "", carbsG: "", fatG: "" });
    setSaved(true);
    load();
    setTimeout(() => setSaved(false), 2000);
  }

  async function logWater(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/nutrition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "hydration", ml: waterForm.ml, source: waterForm.source }),
    });
    setWaterForm({ ml: "250", source: "water" });
    setSaved(true);
    load();
    setTimeout(() => setSaved(false), 2000);
  }

  const today = daily[0];
  const todayWater = today?.waterMl || 0;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Nutrition & Hydration</h1>
          <p className="text-slate-500 text-sm">Fuel like a pro: 1.2-1.6 g/kg protein, 60-90 g carbs/hour during long sessions, electrolytes in heat (Thomas 2016; Jeukendrup 2011).</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><UtensilsCrossed className="w-5 h-5 text-ocean-500" /> Log Food</h2>
            <form onSubmit={logFood} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Meal</label>
                  <select className="input" value={form.meal} onChange={(e) => setForm({ ...form, meal: e.target.value })}>
                    <option value="breakfast">Breakfast</option>
                    <option value="lunch">Lunch</option>
                    <option value="dinner">Dinner</option>
                    <option value="snack">Snack</option>
                    <option value="fuel">Race fuel</option>
                  </select>
                </div>
                <div>
                  <label className="label">Food</label>
                  <input className="input" value={form.food} onChange={(e) => setForm({ ...form, food: e.target.value })} placeholder="Oatmeal + banana" required />
                </div>
                <div>
                  <label className="label">Calories</label>
                  <input className="input" type="number" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} placeholder="450" />
                </div>
                <div>
                  <label className="label">Protein (g)</label>
                  <input className="input" type="number" step="0.1" value={form.proteinG} onChange={(e) => setForm({ ...form, proteinG: e.target.value })} placeholder="30" />
                </div>
                <div>
                  <label className="label">Carbs (g)</label>
                  <input className="input" type="number" step="0.1" value={form.carbsG} onChange={(e) => setForm({ ...form, carbsG: e.target.value })} placeholder="60" />
                </div>
                <div>
                  <label className="label">Fat (g)</label>
                  <input className="input" type="number" step="0.1" value={form.fatG} onChange={(e) => setForm({ ...form, fatG: e.target.value })} placeholder="10" />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Log Meal</button>
            </form>
          </div>

          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Droplets className="w-5 h-5 text-sky-500" /> Hydration</h2>
            <div className="bg-sky-50 rounded-xl p-4 mb-3">
              <div className="text-sm text-slate-600">Today: <strong className="font-display text-xl text-sky-700">{Math.round(todayWater / 100) / 10} L</strong> / ~3L target</div>
              <div className="mt-2 bg-white rounded-full h-2.5 overflow-hidden">
                <div className="bg-sky-500 h-full rounded-full" style={{ width: `${Math.min(100, (todayWater / 3000) * 100)}%` }} />
              </div>
            </div>
            <form onSubmit={logWater} className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="label">Amount (ml)</label>
                <select className="input" value={waterForm.ml} onChange={(e) => setWaterForm({ ...waterForm, ml: e.target.value })}>
                  <option value="250">250 ml (glass)</option>
                  <option value="500">500 ml (bottle)</option>
                  <option value="750">750 ml</option>
                  <option value="1000">1 L</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="label">Type</label>
                <select className="input" value={waterForm.source} onChange={(e) => setWaterForm({ ...waterForm, source: e.target.value })}>
                  <option value="water">Water</option>
                  <option value="sports drink">Sports drink</option>
                  <option value="electrolytes">Electrolytes</option>
                </select>
              </div>
              <button type="submit" className="btn-secondary">+ Add</button>
            </form>
            <p className="text-[11px] text-slate-400 mt-3">
              Sweat rate 0.4-1.2 L/h; sodium 400-1000 mg/L in hot weather (ACSM 2007). Weigh before/after sessions to find YOUR rate.
            </p>
          </div>
        </div>

        {/* Daily summary */}
        <div className="card">
          <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Apple className="w-5 h-5 text-emerald-500" /> Last 7 Days</h2>
          {daily.length === 0 ? (
            <p className="text-slate-400 text-sm py-6 text-center">No nutrition logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 text-xs uppercase tracking-wide">
                    <th className="pb-2">Date</th>
                    <th className="pb-2">Calories</th>
                    <th className="pb-2">Protein</th>
                    <th className="pb-2">Carbs</th>
                    <th className="pb-2">Fat</th>
                    <th className="pb-2">Water</th>
                    <th className="pb-2">Meals</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.map((d) => (
                    <tr key={d.date} className="border-t border-sand-100">
                      <td className="py-2 text-slate-500">{new Date(d.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</td>
                      <td className="py-2 font-semibold">{d.calories || "—"}</td>
                      <td className="py-2">{d.proteinG ? `${d.proteinG}g` : "—"}</td>
                      <td className="py-2">{d.carbsG ? `${d.carbsG}g` : "—"}</td>
                      <td className="py-2">{d.fatG ? `${d.fatG}g` : "—"}</td>
                      <td className="py-2">{Math.round(d.waterMl / 100) / 10} L</td>
                      <td className="py-2">{d.meals}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Guidelines */}
        <div className="card bg-ocean-50 border-ocean-200">
          <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><Calculator className="w-5 h-5 text-ocean-600" /> Your Fueling Guidelines</h2>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-ocean-900">
            <div className="bg-white rounded-xl p-4">
              <div className="font-semibold">Daily protein</div>
              <div className="text-2xl font-display font-bold">{NUTRITION_GUIDELINES.dailyProtein.endurance}-{NUTRITION_GUIDELINES.dailyProtein.strength} g/kg</div>
              <div className="text-xs text-slate-500">{NUTRITION_GUIDELINES.dailyProtein.source}</div>
            </div>
            <div className="bg-white rounded-xl p-4">
              <div className="font-semibold">Carbs during sessions</div>
              <div className="text-2xl font-display font-bold">60-90 g/h</div>
              <div className="text-xs text-slate-500">{NUTRITION_GUIDELINES.carbLong.source} — multiple transportable carbs</div>
            </div>
            <div className="bg-white rounded-xl p-4">
              <div className="font-semibold">Post-workout protein</div>
              <div className="text-2xl font-display font-bold">0.3 g/kg</div>
              <div className="text-xs text-slate-500">within 2h ({NUTRITION_GUIDELINES.proteinPost.source})</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3 text-xs text-slate-500">
            <Info className="w-4 h-4 shrink-0" /> Carbs are not the enemy: periodize them around training — high on hard days, lower on easy/rest days (Burke 2011).
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
