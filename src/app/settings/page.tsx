"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Save, HeartPulse, Zap, Plug, Dna, Bike, FlaskConical, ArrowRight } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { HR_ZONES, estimateVo2max } from "@/lib/science";
import { TRAINING_WINDOWS } from "@/lib/adaptive";
import { t, fmtNum, type Lang } from "@/lib/i18n";

export default function SettingsPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [profile, setProfile] = useState<any>(null);
  const [zones, setZones] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<any>({});
  const [vo2Estimate, setVo2Estimate] = useState<any>(null);
  const [modules, setModules] = useState<any>({});

  async function load() {
    const res = await fetch("/api/profile");
    const d = await res.json();
    setProfile(d.profile);
    setZones(d.zones);
    if (d.profile) {
      setForm({
        birthYear: d.profile.birthYear || "",
        sex: d.profile.sex || "",
        heightCm: d.profile.heightCm || "",
        weightKg: d.profile.weightKg || "",
        experience: d.profile.experience || "amateur",
        goal: d.profile.goal || "olympic",
        weeklyHours: d.profile.weeklyHours || 8,
        vo2max: d.profile.vo2max || "",
        lthr: d.profile.lthr || "",
        maxHr: d.profile.maxHr || "",
        ftp: d.profile.ftp || "",
        runPaceBase: d.profile.runPaceBase || "",
        swimPaceBase: d.profile.swimPaceBase || "",
        trainingWindow: d.profile.trainingWindow || "any",
        raceDate: d.profile.raceDate ? d.profile.raceDate.slice(0, 10) : "",
      });
    }
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function loadModules() {
    try {
      const [c, d, b, g] = await Promise.all([
        fetch("/api/connectors").then((r) => r.json()).catch(() => null),
        fetch("/api/dna").then((r) => r.json()).catch(() => null),
        fetch("/api/blood").then((r) => r.json()).catch(() => null),
        fetch("/api/gear").then((r) => r.json()).catch(() => null),
      ]);
      setModules({ connectors: c, dna: d, blood: b, gear: g });
    } catch {}
  }
  useEffect(() => { if (user) loadModules(); }, [user]);

  function estimate() {
    if (!form.birthYear || !form.sex || !form.weightKg || !form.heightCm) return;
    const age = new Date().getFullYear() - parseInt(form.birthYear, 10);
    const heightM = parseFloat(form.heightCm) / 100;
    const bmi = parseFloat(form.weightKg) / (heightM * heightM);
    const activityLevel = form.experience === "pro" ? 5 : form.experience === "advanced" ? 4 : form.experience === "amateur" ? 3 : 2;
    const est = estimateVo2max({ sex: form.sex, age, bmi, activityLevel });
    setVo2Estimate({ ...est, age, bmi: Math.round(bmi * 10) / 10 });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: any = {};
    for (const k of Object.keys(form)) {
      if (form[k] !== "" && form[k] !== null && form[k] !== undefined) body[k] = form[k];
    }
    if (body.birthYear) body.birthYear = parseInt(body.birthYear, 10);
    if (body.heightCm) body.heightCm = parseFloat(body.heightCm);
    if (body.weightKg) body.weightKg = parseFloat(body.weightKg);
    if (body.weeklyHours) body.weeklyHours = parseFloat(body.weeklyHours);
    if (body.vo2max) body.vo2max = parseFloat(body.vo2max);
    if (body.lthr) body.lthr = parseInt(body.lthr, 10);
    if (body.maxHr) body.maxHr = parseInt(body.maxHr, 10);
    if (body.ftp) body.ftp = parseFloat(body.ftp);
    if (body.runPaceBase) body.runPaceBase = parseFloat(body.runPaceBase);
    if (body.swimPaceBase) body.swimPaceBase = parseFloat(body.swimPaceBase);
    if (body.raceDate) body.raceDate = new Date(body.raceDate);
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setSaved(true);
      load();
      setTimeout(() => setSaved(false), 2500);
    }
  }

  if (loading) {
    return (
      <ProtectedPage>
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProtectedPage>
    );
  }

  // Module status summaries for the integrated hub.
  const connProviders = modules.connectors?.providers || [];
  const connectedCount = connProviders.filter((c: any) => c.status === "connected").length;
  const dnaTraits = (modules.dna?.results || []).reduce((a: number, r: any) => a + (r.variants?.length || 0), 0);
  const panels = modules.blood?.panels || [];
  const bloodFlags = panels.reduce((a: number, p: any) => a + (p.results || []).filter((r: any) => r.status === "low" || r.status === "high").length, 0);
  const gearTracked = modules.gear?.profile ? Object.values(modules.gear.profile).filter((v) => v === true).length : 0;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t(lang, "nav.settings")}</h1>
          <p className="text-slate-500 text-sm">{lang === "es" ? "Tu fisiología mueve cada sesión. Llena lo que sepas — nosotros estimamos el resto desde la investigación." : "Your physiology drives every session. Fill in what you know — we estimate the rest from the research."}</p>
        </div>

        {saved && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ Profile saved — zones updated</div>}

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">Athlete Profile</h2>
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Birth year</label>
                  <input className="input" type="number" value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} placeholder="1990" />
                </div>
                <div>
                  <label className="label">Sex</label>
                  <select className="input" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="label">Height (cm)</label>
                  <input className="input" type="number" step="0.1" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} placeholder="175" />
                </div>
                <div>
                  <label className="label">Weight (kg)</label>
                  <input className="input" type="number" step="0.1" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} placeholder="70" />
                </div>
                <div>
                  <label className="label">Experience</label>
                  <select className="input" value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })}>
                    <option value="beginner">Beginner</option>
                    <option value="amateur">Amateur</option>
                    <option value="advanced">Advanced</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div>
                  <label className="label">Goal distance</label>
                  <select className="input" value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}>
                    <option value="sprint">Sprint</option>
                    <option value="olympic">Olympic</option>
                    <option value="half">Half Ironman</option>
                    <option value="full">Full Ironman</option>
                    <option value="hyrox">HYROX</option>
                    <option value="boxing">Boxing</option>
                    <option value="cycle">Cycling (no triathlon)</option>
                    <option value="run-only">Running only</option>
                    <option value="swim-only">Swimming only</option>
                    <option value="lifting">Lifting / Strength only</option>
                  </select>
                </div>
                <div>
                  <label className="label">Weekly hours</label>
                  <input className="input" type="number" step="0.5" value={form.weeklyHours} onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })} />
                </div>
                <div>
                  <label className="label">Race date</label>
                  <input type="date" className="input" value={form.raceDate} onChange={(e) => setForm({ ...form, raceDate: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Preferred training time</label>
                  <select className="input" value={form.trainingWindow} onChange={(e) => setForm({ ...form, trainingWindow: e.target.value })}>
                    {TRAINING_WINDOWS.map((w) => <option key={w.key} value={w.key}>{w.label}{w.startTime ? ` (default ${w.startTime})` : ""}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">New plans get this default start time. You can still move any individual session in the calendar.</p>
                </div>
              </div>

              <div className="border-t border-sand-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Measured physiology (optional)</label>
                  <button type="button" onClick={estimate} className="text-xs text-ocean-600 hover:underline flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Estimate VO2max</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">VO2max (ml/kg/min)</label>
                    <input className="input" type="number" step="0.1" value={form.vo2max} onChange={(e) => setForm({ ...form, vo2max: e.target.value })} placeholder="e.g. 48" />
                  </div>
                  <div>
                    <label className="label">LTHR (bpm) — from a 30-min all-out test</label>
                    <input className="input" type="number" value={form.lthr} onChange={(e) => setForm({ ...form, lthr: e.target.value })} placeholder="e.g. 165" />
                    <div className="text-[11px] text-slate-400">LTHR = the heart rate you could hold for a hard one-hour effort. Test it in <a href="/labs" className="underline">Labs</a>.</div>
                  </div>
                  <div>
                    <label className="label">Max HR</label>
                    <input className="input" type="number" value={form.maxHr} onChange={(e) => setForm({ ...form, maxHr: e.target.value })} placeholder="e.g. 185" />
                  </div>
                  <div>
                    <label className="label">FTP (watts)</label>
                    <input className="input" type="number" step="0.1" value={form.ftp} onChange={(e) => setForm({ ...form, ftp: e.target.value })} placeholder="e.g. 250" />
                    <div className="text-[11px] text-slate-400">FTP = the watts you could hold for about one hour.</div>
                  </div>
                  <div>
                    <label className="label">Run T-pace (sec/km)</label>
                    <input className="input" type="number" value={form.runPaceBase} onChange={(e) => setForm({ ...form, runPaceBase: e.target.value })} placeholder="e.g. 285" />
                    <div className="text-[11px] text-slate-400">T-pace = the pace you could race for about one hour.</div>
                  </div>
                  <div>
                    <label className="label">Swim T-pace (sec/100m)</label>
                    <input className="input" type="number" value={form.swimPaceBase} onChange={(e) => setForm({ ...form, swimPaceBase: e.target.value })} placeholder="e.g. 95" />
                    <div className="text-[11px] text-slate-400">Your CSS pace — from the 400 m + 200 m test in <a href="/labs" className="underline">Labs</a>.</div>
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-primary w-full justify-center"><Save className="w-4 h-4" /> Save Profile</button>
            </form>
            {vo2Estimate && (
              <div className="mt-3 text-sm bg-ocean-50 border border-ocean-200 rounded-xl p-3">
                <strong>Estimated VO2max:</strong> {fmtNum(vo2Estimate.vo2max, lang, 1)} ml/kg/min ({vo2Estimate.label}, {fmtNum(vo2Estimate.pctile, lang)}th percentile)
                <div className="text-xs text-slate-500 mt-1">Jurca 2005 non-exercise regression · age {vo2Estimate.age} · BMI {vo2Estimate.bmi}</div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card">
              <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><HeartPulse className="w-5 h-5 text-coral-500" /> Your HR Zones — max HR {zones?.anchorHr || "—"} bpm</h2>
              {zones?.hr ? (
                <div className="space-y-1.5">
                  {HR_ZONES.map((z) => {
                    const r = zones.hr[z.key];
                    const b = zones.bikeHr?.[z.key];
                    return (
                      <div key={z.key} className="flex items-center gap-3 text-sm">
                        <span className={`chip ${`chip-${z.key}`} w-28 justify-center`}>{z.name}</span>
                        <span className="font-display font-bold w-24">{r.low}-{r.high} bpm</span>
                        <span className="text-xs text-slate-400 flex-1 truncate">{z.description} <span className="text-slate-500">(RPE {z.rpe})</span></span>
                        {b && <span className="text-xs text-slate-400 whitespace-nowrap">Bike {b.low}-{b.high}</span>}
                      </div>
                    );
                  })}
                  {zones.swim && (
                    <div className="border-t border-sand-200 pt-2 mt-2 text-xs text-slate-500">
                      Swim (sec/100m): Z1 {zones.swim.z1.high}-{zones.swim.z1.low} · Z2 {zones.swim.z2.high}-{zones.swim.z2.low} · Z3 {zones.swim.z3.high}-{zones.swim.z3.low} · Z4 {zones.swim.z4.high}-{zones.swim.z4.low} · Z5 {zones.swim.z5.high}-{zones.swim.z5.low} (threshold {zones.anchorSwim}s)
                    </div>
                  )}
                  {zones.power && (
                    <div className="border-t border-sand-200 pt-2 mt-2 text-xs text-slate-500">
                      Power: Z1 &lt;{zones.power.z1.high}W · Z2 {zones.power.z2.low}-{zones.power.z2.high}W · Z3 {zones.power.z3.low}-{zones.power.z3.high}W · Z4 {zones.power.z4.low}-{zones.power.z4.high}W · Z5+ {zones.power.z5.low}+W (FTP {zones.anchorPower}W)
                    </div>
                  )}
                  {zones.vo2maxHr && (
                    <div className="border-t border-sand-200 pt-2 mt-2 text-xs text-slate-500">
                      VO2max ≈ {fmtNum(zones.vo2maxHr, lang, 1)} ml/kg/min (Uth 2004: 15.3 × HRmax ÷ HRrest)
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Enter your max HR to see personalized zones.</p>
              )}
              <p className="text-[11px] text-slate-400 mt-3">
                Zones follow the MyProCoach 5-zone model anchored on max HR (run). Bike = run − 6 bpm. Swim uses CSS/threshold pace. Gym, boxing &amp; HYROX use the same zones guided by RPE. Run the tests in <a href="/labs" className="text-ocean-600 underline">Labs &amp; Tests</a> to fill in your real numbers.
              </p>
            </div>
          </div>
        </div>

        {/* ── Integrated modules hub (Conectores · ADN · Equipamiento · Sangre) ── */}
        <div className="border-t border-sand-200 pt-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-display font-bold text-lg">{t(lang, "settings.modulesTitle")}</h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">{t(lang, "settings.modulesSub")}</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                href: "/connectors",
                icon: Plug,
                tint: "text-ocean-600 bg-ocean-100",
                name: t(lang, "settings.mod.connectors"),
                desc: t(lang, "settings.mod.connectorsDesc"),
                status: connectedCount > 0 ? t(lang, "settings.mod.connected").replace("{n}", String(connectedCount)) : t(lang, "settings.mod.notSetUp"),
              },
              {
                href: "/dna",
                icon: Dna,
                tint: "text-coral-500 bg-coral-100",
                name: t(lang, "settings.mod.dna"),
                desc: t(lang, "settings.mod.dnaDesc"),
                status: dnaTraits > 0 ? t(lang, "settings.mod.traits").replace("{n}", String(dnaTraits)) : t(lang, "settings.mod.notSetUp"),
              },
              {
                href: "/gear",
                icon: Bike,
                tint: "text-emerald-600 bg-emerald-100",
                name: t(lang, "settings.mod.gear"),
                desc: t(lang, "settings.mod.gearDesc"),
                status: gearTracked > 0 ? t(lang, "settings.mod.gearCount").replace("{n}", String(gearTracked)) : t(lang, "settings.mod.notSetUp"),
              },
              {
                href: "/blood",
                icon: FlaskConical,
                tint: "text-vermillion-500 bg-vermillion-400/10",
                name: t(lang, "settings.mod.blood"),
                desc: t(lang, "settings.mod.bloodDesc"),
                status: panels.length > 0 ? t(lang, "settings.mod.panels").replace("{n}", String(panels.length)).replace("{f}", String(bloodFlags)) : t(lang, "settings.mod.notSetUp"),
              },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <Link key={m.href} href={m.href} className="card flex flex-col hover:shadow-md transition-shadow group">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.tint}`}><Icon className="w-5 h-5" /></div>
                  <div className="font-semibold mt-3">{m.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.desc}</div>
                  <div className="mt-auto pt-3 flex items-center justify-between text-sm">
                    <span className="text-xs font-medium text-slate-400">{m.status}</span>
                    <span className="text-xs font-semibold text-ocean-600 flex items-center gap-1">{t(lang, "settings.mod.open")} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" /></span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
