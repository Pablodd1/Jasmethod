"use client";

import { useEffect, useState } from "react";
import { Save, HeartPulse, Mail, Zap } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { HR_ZONES, estimateVo2max } from "@/lib/science";

export default function SettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [zones, setZones] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<any>({});
  const [vo2Estimate, setVo2Estimate] = useState<any>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

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
        raceDate: d.profile.raceDate ? d.profile.raceDate.slice(0, 10) : "",
      });
    }
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

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

  async function sendDigest() {
    setEmailBusy(true);
    const res = await fetch("/api/email/digest", { method: "POST" });
    const d = await res.json();
    setEmailBusy(false);
    setEmailSent(res.ok);
    setTimeout(() => setEmailSent(false), 4000);
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

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Profile & Training Zones</h1>
          <p className="text-slate-500 text-sm">Your physiology drives every session. Fill in what you know — we estimate the rest from the research.</p>
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
                    <label className="label">LTHR (bpm) — from 30' TT</label>
                    <input className="input" type="number" value={form.lthr} onChange={(e) => setForm({ ...form, lthr: e.target.value })} placeholder="e.g. 165" />
                  </div>
                  <div>
                    <label className="label">Max HR</label>
                    <input className="input" type="number" value={form.maxHr} onChange={(e) => setForm({ ...form, maxHr: e.target.value })} placeholder="e.g. 185" />
                  </div>
                  <div>
                    <label className="label">FTP (watts)</label>
                    <input className="input" type="number" step="0.1" value={form.ftp} onChange={(e) => setForm({ ...form, ftp: e.target.value })} placeholder="e.g. 250" />
                  </div>
                  <div>
                    <label className="label">Run T-pace (sec/km)</label>
                    <input className="input" type="number" value={form.runPaceBase} onChange={(e) => setForm({ ...form, runPaceBase: e.target.value })} placeholder="e.g. 285" />
                  </div>
                  <div>
                    <label className="label">Swim T-pace (sec/100m)</label>
                    <input className="input" type="number" value={form.swimPaceBase} onChange={(e) => setForm({ ...form, swimPaceBase: e.target.value })} placeholder="e.g. 95" />
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-primary w-full justify-center"><Save className="w-4 h-4" /> Save Profile</button>
            </form>
            {vo2Estimate && (
              <div className="mt-3 text-sm bg-ocean-50 border border-ocean-200 rounded-xl p-3">
                <strong>Estimated VO2max:</strong> {vo2Estimate.vo2max} ml/kg/min ({vo2Estimate.label}, {vo2Estimate.pctile}th percentile)
                <div className="text-xs text-slate-500 mt-1">Jurca 2005 non-exercise regression · age {vo2Estimate.age} · BMI {vo2Estimate.bmi}</div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card">
              <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><HeartPulse className="w-5 h-5 text-coral-500" /> Your HR Zones (LTHR {zones?.anchorHr || "—"} bpm)</h2>
              {zones?.hr ? (
                <div className="space-y-1.5">
                  {HR_ZONES.map((z) => {
                    const r = zones.hr[z.key];
                    return (
                      <div key={z.key} className="flex items-center gap-3 text-sm">
                        <span className={`chip ${`chip-${z.key}`} w-28 justify-center`}>{z.name}</span>
                        <span className="font-display font-bold w-20">{r.low}-{r.high} bpm</span>
                        <span className="text-xs text-slate-400 flex-1 truncate">{z.description}</span>
                      </div>
                    );
                  })}
                  {zones.power && (
                    <div className="border-t border-sand-200 pt-2 mt-2 text-xs text-slate-500">
                      Power: Z1 &lt;{zones.power.z1.high}W · Z2 {zones.power.z2.low}-{zones.power.z2.high}W · Z3 {zones.power.z3.low}-{zones.power.z3.high}W · Z4 {zones.power.z4.low}-{zones.power.z4.high}W · Z5+ {zones.power.z5.low}+W (FTP {zones.anchorPower}W)
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Enter your LTHR (or save VO2max) to see personalized zones.</p>
              )}
              <p className="text-[11px] text-slate-400 mt-3">
                LTHR = average HR of the last 20 min of a 30-min all-out time trial (Friel protocol; Lamberts 2009 validation). Zones follow the 7-zone model anchored on LTHR.
              </p>
            </div>

            <div className="card">
              <h2 className="font-display font-bold text-lg mb-2 flex items-center gap-2"><Mail className="w-5 h-5 text-ocean-500" /> Daily Motivation Email</h2>
              <p className="text-sm text-slate-500 mb-3">Get your daily quote, coach message and today&apos;s session in your inbox ({user?.email}).</p>
              <button onClick={sendDigest} disabled={emailBusy} className="btn-primary w-full justify-center">
                <Mail className="w-4 h-4" /> {emailBusy ? "Sending…" : "Send Today's Digest Now"}
              </button>
              {emailSent && <div className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mt-2">✓ Digest sent (or queued via SMTP)</div>}
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
