"use client";
import { NutritionContextEditor } from "@/components/nutrition-context-editor";
import {BaselineTests} from "@/components/baseline-tests";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { settingsProfileForm, settingsProfilePatch } from "@/lib/settings-profile";
import { saveReviewedProfile } from "@/lib/profile-client";
import { PLANNABLE_GOALS, planningGoal } from "@/lib/planning-setup";
import { fmtWeight, fmtHeight } from "@/lib/units";
import { EstimateBanner } from "@/components/estimate-banner";
import { PrsCard } from "@/components/prs-card";
import {
  Save,
  HeartPulse,
  Zap,
  Info,
  Plug,
  Dna,
  Bike,
  FlaskConical,
  ArrowRight,
} from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { HR_ZONES, estimateVo2max, buildZoneTable } from "@/lib/science";
import { TRAINING_WINDOWS } from "@/lib/adaptive";
import { t, fmtNum, type Lang } from "@/lib/i18n";

export default function SettingsPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [revision, setRevision] = useState<string>();
  const [profile, setProfile] = useState<any>(null);
  const [zones, setZones] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [nutritionDraft, setNutritionDraft] = useState<any>(null);
  const [nutritionDirty, setNutritionDirty] = useState(false);
  const [form, setForm] = useState(()=>settingsProfileForm(null));
  const loadedForm = useRef(settingsProfileForm(null));
  const loadRequest = useRef(0);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [vo2Estimate, setVo2Estimate] = useState<any>(null);
  const [vo2Source, setVo2Source] = useState<string | null>(null);
  const [modules, setModules] = useState<any>({});

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true); setRevision(undefined); setError("");
    try {
      const response = await fetch("/api/profile", {cache:"no-store",signal:AbortSignal.timeout(15000)});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not load your saved profile.");
      if (typeof data.revision !== "string" || !data.revision) throw Error("Your saved profile could not be verified. Reload before editing.");
      if (requestId !== loadRequest.current) return;
      const current = settingsProfileForm(data.profile ?? null, user?.timezone);
      loadedForm.current = current; setForm(current);
      setRevision(data.revision); setProfile(data.profile);
      try { setNutritionDraft(data.profile?.nutritionContext ? JSON.parse(data.profile.nutritionContext) : null); }
      catch { setNutritionDraft(null); }
      setNutritionDirty(false); setZones(data.zones); setVo2Source(data.vo2maxSource || null);
    } catch (failure) { if (requestId === loadRequest.current) setError((failure as Error).message); }
    finally { if (requestId === loadRequest.current) setLoading(false); }
  }, [user?.timezone]);
  const cancelLoad = useCallback(()=>{loadRequest.current++;},[]);
  useEffect(() => { if (user?.id) void load(); return cancelLoad; }, [user?.id,load,cancelLoad]);

  async function loadModules() {
    try {
      const [c, d, b, g] = await Promise.all([
        fetch("/api/connectors")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/dna")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/blood")
          .then((r) => r.json())
          .catch(() => null),
        fetch("/api/gear")
          .then((r) => r.json())
          .catch(() => null),
      ]);
      setModules({ connectors: c, dna: d, blood: b, gear: g });
    } catch {}
  }
  useEffect(() => {
    if (user) loadModules();
  }, [user]);

  function estimate() {
    if (!form.birthYear || (form.sex !== "male" && form.sex !== "female") || !form.weightKg || !form.heightCm)
      return;
    const age = new Date().getFullYear() - parseInt(form.birthYear, 10);
    const heightM = parseFloat(form.heightCm) / 100;
    const bmi = parseFloat(form.weightKg) / (heightM * heightM);
    const activityLevel =
      form.experience === "pro"
        ? 5
        : form.experience === "advanced"
          ? 4
          : form.experience === "amateur"
            ? 3
            : 2;
    const est = estimateVo2max({ sex: form.sex, age, bmi, activityLevel });
    setVo2Estimate({ ...est, age, bmi: Math.round(bmi * 10) / 10 });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    setSaved(false); setNotice(""); setError("");
    try {
      const body = settingsProfilePatch(form, loadedForm.current);
      if (nutritionDirty) body.nutritionContext = nutritionDraft;
      if (!Object.keys(body).length) { setNotice(lang === "es" ? "No hay cambios para guardar." : "No changes to save."); return; }
      savingRef.current = true; setSaving(true);
      const result = await saveReviewedProfile(body, revision ?? null);
      if (!result.profile || typeof result.profile !== "object") throw Error("The saved profile could not be verified. Reload and review before trying again.");
      // The acknowledged response is the new reviewed baseline; never fetch a fresh revision to retry stale edits.
      const current = settingsProfileForm(result.profile ?? null,user?.timezone);
      loadedForm.current = current; setForm(current); setProfile(result.profile);
      setRevision(result.revision); setNutritionDirty(false); setSaved(true);
      try { setNutritionDraft(result.profile?.nutritionContext ? JSON.parse(result.profile.nutritionContext) : null); } catch { setNutritionDraft(null); }
      // Recompute display ranges only from the acknowledged saved references, never from unsaved input.
      setZones(buildZoneTable({maxHr:result.profile.maxHr ?? undefined,lthr:result.profile.lthr ?? undefined,ftp:result.profile.ftp ?? undefined,thresholdPaceSecPerKm:result.profile.runPaceBase ?? undefined,thresholdPaceSecPer100m:result.profile.swimPaceBase ?? undefined,restingHr:result.profile.restingHr ?? undefined}));
      setVo2Source(result.profile.vo2max ? "saved reference; provenance unverified" : null);
    } catch (failure) { setError((failure as Error).message); }
    finally { savingRef.current = false; setSaving(false); }
  }

  if (loading) {
    return (
      <ProtectedPage>
        {error && (
          <p role="alert" className="card text-red-700">
            {error}
          </p>
        )}
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProtectedPage>
    );
  }

  // Module status summaries for the integrated hub.
  const connProviders = modules.connectors?.providers || [];
  const connectedCount = connProviders.filter(
    (c: any) => c.status === "connected",
  ).length;
  const dnaTraits = (modules.dna?.results || []).reduce(
    (a: number, r: any) => a + (r.variants?.length || 0),
    0,
  );
  const panels = modules.blood?.panels || [];
  const bloodFlags = panels.reduce(
    (a: number, p: any) =>
      a +
      (p.results || []).filter(
        (r: any) => r.status === "low" || r.status === "high",
      ).length,
    0,
  );
  const gearTracked = modules.gear?.profile
    ? Object.values(modules.gear.profile).filter((v) => v === true).length
    : 0;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">
            {t(lang, "nav.settings")}
          </h1>
          <p className="text-slate-500 text-sm">
            {lang === "es"
              ? "Introduce solo lo que sepas. Los datos desconocidos siguen visibles; las estimaciones son provisionales."
              : "Your physiology drives every session. Enter what you know. Missing values remain visible; any estimates are provisional."}
          </p>
        </div>

        <section className="card space-y-2"><h2 className="font-semibold">{lang === "es" ? "Objetivos y plan de entrenamiento" : "Goals and training plan"}</h2><p className="text-sm">{lang === "es" ? "Revisa objetivos, disponibilidad y seguridad. Guardar el perfil conserva tu historial y no reemplaza el plan actual." : "Review goals, availability and safety. Saving profile edits keeps your history and does not replace your current plan."}</p><div className="flex flex-wrap gap-4"><Link className="underline min-h-11 inline-flex items-center" href="/onboard?redo=1&step=race&return=training">{lang === "es" ? "Revisar configuración guiada" : "Review guided planning setup"}</Link><Link className="underline min-h-11 inline-flex items-center" href="/training">{lang === "es" ? "Ver mi plan guardado" : "View my saved plan"}</Link></div></section>
        {error && <p role="alert" className="rounded-lg border border-red-300 p-3 text-red-700">{error} {!revision && <button type="button" className="underline" onClick={()=>void load()}>{lang === "es" ? "Recargar perfil" : "Reload profile"}</button>}</p>}
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {saved && (
          <div role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {lang === "es" ? "Perfil guardado. Tu plan e historial se conservan." : "Profile saved. Your existing plan and history are preserved."}
          </div>
        )}

        <EstimateBanner
          vo2maxMissing={!profile?.vo2max}
          lthrMissing={!profile?.lthr}
          vo2maxSource={vo2Source}
        />

        <PrsCard lang={lang === "es" ? "es" : "en"} />

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">
              Athlete Profile
            </h2>
            <form onSubmit={save} onChangeCapture={()=>{setSaved(false);setNotice("");}} className="space-y-3"><fieldset disabled={!revision || saving} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-birthYear" className="label">Birth year</label>
                  <input
                    id="profile-birthYear"
                    className="input"
                    type="number"
                    value={form.birthYear}
                    onChange={(e) =>
                      setForm({ ...form, birthYear: e.target.value })
                    }
                    placeholder="1990"
                  />
                </div>
                <div>
                  <label htmlFor="profile-sex" className="label">Sex</label>
                  <select
                    id="profile-sex"
                    className="input"
                    value={form.sex}
                    onChange={(e) => setForm({ ...form, sex: e.target.value })}
                  >
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="profile-heightCm" className="label">Height (cm)</label>
                  <input
                    id="profile-heightCm"
                    className="input"
                    type="number"
                    step="0.1"
                    value={form.heightCm}
                    onChange={(e) =>
                      setForm({ ...form, heightCm: e.target.value })
                    }
                    placeholder="175"
                  />
                </div>
                <div>
                  <label htmlFor="profile-weightKg" className="label">Weight (kg)</label>
                  <input
                    id="profile-weightKg"
                    className="input"
                    type="number"
                    step="0.1"
                    value={form.weightKg}
                    onChange={(e) =>
                      setForm({ ...form, weightKg: e.target.value })
                    }
                    placeholder="70"
                  />
                </div>
                <div>
                  <label htmlFor="profile-experience" className="label">Experience</label>
                  <select
                    id="profile-experience"
                    className="input"
                    value={form.experience}
                    onChange={(e) =>
                      setForm({ ...form, experience: e.target.value })
                    }
                  >
                    <option value="">Not provided</option>
                    <option value="beginner">Beginner</option>
                    <option value="amateur">Amateur</option>
                    <option value="advanced">Advanced</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="profile-goal" className="label">Goal distance</label>
                  <select
                    id="profile-goal"
                    className="input"
                    value={form.goal}
                    onChange={(e) => setForm({ ...form, goal: e.target.value })}
                  >
                    <option value="">Not provided</option>
                    {form.goal && !PLANNABLE_GOALS.includes(planningGoal(form.goal)!) && <option value={form.goal} disabled>Saved legacy goal: {form.goal}</option>}
                    <option value="sprint">Sprint</option>
                    <option value="olympic">Olympic</option>
                    <option value="half">Half Ironman</option>
                    <option value="full">Full Ironman</option>
                    <option value="hyrox">HYROX</option>
                    <option value="cycle">Cycling (no triathlon)</option>
                    <option value="run-only">Running only</option>
                    <option value="swim-only">Swimming only</option>
                    <option value="track-sprint">Track sprint</option><option value="5k">5K</option><option value="10k">10K</option><option value="half-marathon">Half marathon</option><option value="marathon">Marathon</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="profile-weeklyHours" className="label">Weekly hours</label>
                  <input
                    id="profile-weeklyHours"
                    className="input"
                    type="number"
                    step="0.5"
                    value={form.weeklyHours}
                    onChange={(e) =>
                      setForm({ ...form, weeklyHours: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="profile-raceDate" className="label">Race date</label>
                  <input
                    id="profile-raceDate"
                    type="date"
                    className="input"
                    value={form.raceDate}
                    onChange={(e) =>
                      setForm({ ...form, raceDate: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="profile-trainingWindow" className="label">Preferred training time</label>
                  <select
                    id="profile-trainingWindow"
                    className="input"
                    value={form.trainingWindow}
                    onChange={(e) =>
                      setForm({ ...form, trainingWindow: e.target.value })
                    }
                  >
                    {TRAINING_WINDOWS.map((w) => (
                      <option key={w.key} value={w.key}>
                        {w.label}
                        {w.startTime ? ` (default ${w.startTime})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    New plans get this default start time. You can still move
                    any individual session in the calendar.
                  </p>
                </div>
                <div className="col-span-2">
                  <label htmlFor="profile-units" className="label">Units</label>
                  <select
                    id="profile-units"
                    className="input"
                    value={form.units || "auto"}
                    onChange={(e) => setForm({ ...form, units: e.target.value })}
                  >
                    <option value="auto">{lang === "es" ? "Automático por idioma (español: km; inglés: mi)" : "Automatic by language (English: mi; Spanish: km)"}</option>
                    <option value="metric">
                      Metric (kg · km · ml · °C)
                    </option>
                    <option value="imperial">
                      Imperial (lb · mi · oz · °F)
                    </option>
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Saved choices override the language default. Training distance and pace use
                    this preference; profile reference inputs keep their labeled storage units. {form.units === "imperial" && form.weightKg
                      ? `Your weight: ${fmtWeight(Number(form.weightKg), "imperial")} · height: ${fmtHeight(Number(form.heightCm), "imperial")}.`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="border-t border-sand-200 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="label mb-0">
                    Measured physiology (optional)
                  </h3>
                  <button
                    type="button"
                    onClick={estimate}
                    className="text-xs text-ocean-600 hover:underline flex items-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5" /> Estimate VO2max
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="profile-vo2max" className="label">VO2max (ml/kg/min)</label>
                    <input
                      id="profile-vo2max"
                      className="input"
                      type="number"
                      step="0.1"
                      value={form.vo2max}
                      onChange={(e) =>
                        setForm({ ...form, vo2max: e.target.value })
                      }
                      placeholder="e.g. 48"
                    />
                  </div>
                  <div>
                    <label htmlFor="profile-lthr" className="label">
                      LTHR (bpm) — from a 30-min all-out test
                    </label>
                    <input
                      id="profile-lthr"
                    className="input"
                      type="number"
                      value={form.lthr}
                      onChange={(e) =>
                        setForm({ ...form, lthr: e.target.value })
                      }
                      placeholder="e.g. 165"
                    />
                    <div className="text-[11px] text-slate-400">
                      LTHR = the heart rate you could hold for a hard one-hour
                      effort. Test it in{" "}
                      <a href="/labs" className="underline">
                        Labs
                      </a>
                      .
                    </div>
                  </div>
                  <div>
                    <label htmlFor="profile-maxHr" className="label">Max HR</label>
                    <input
                      id="profile-maxHr"
                    className="input"
                      type="number"
                      value={form.maxHr}
                      onChange={(e) =>
                        setForm({ ...form, maxHr: e.target.value })
                      }
                      placeholder="e.g. 185"
                    />
                  </div>
                  {([['cp','Critical power (watts)'],['restingHr','Resting heart rate (bpm)'],['hrvBaseline','Reviewed HRV baseline (ms)'],['sweatRateMlH','Reported sweat rate (mL/hour)'],['sodiumMgPerL','Reported sweat sodium (mg/L)']] as const).map(([field,label])=><label key={field} className="label">{label}<input className="input" type="number" step="any" value={form[field] ?? ''} onChange={e=>setForm({...form,[field]:e.target.value})}/></label>)}
                  <label className="label flex gap-2 items-center"><input type="checkbox" checked={!!form.injured} onChange={e=>setForm({...form,injured:e.target.checked})}/>Injury restriction active — pause training for review</label>
                  <div>
                    <label htmlFor="profile-ftp" className="label">FTP (watts)</label>
                    <input
                      id="profile-ftp"
                    className="input"
                      type="number"
                      step="0.1"
                      value={form.ftp}
                      onChange={(e) =>
                        setForm({ ...form, ftp: e.target.value })
                      }
                      placeholder="e.g. 250"
                    />
                    <div className="text-[11px] text-slate-400">
                      FTP = the watts you could hold for about one hour.
                    </div>
                  </div>
                  <div>
                    <label htmlFor="profile-runPaceBase" className="label">Run T-pace (sec/km)</label>
                    <input
                      id="profile-runPaceBase"
                    className="input"
                      type="number"
                      value={form.runPaceBase}
                      onChange={(e) =>
                        setForm({ ...form, runPaceBase: e.target.value })
                      }
                      placeholder="e.g. 285"
                    />
                    <div className="text-[11px] text-slate-400">
                      T-pace = the pace you could race for about one hour.
                    </div>
                  </div>
                  <div>
                    <label htmlFor="profile-swimPaceBase" className="label">Swim T-pace (sec/100m)</label>
                    <input
                      id="profile-swimPaceBase"
                    className="input"
                      type="number"
                      value={form.swimPaceBase}
                      onChange={(e) =>
                        setForm({ ...form, swimPaceBase: e.target.value })
                      }
                      placeholder="e.g. 95"
                    />
                    <div className="text-[11px] text-slate-400">
                      Your CSS pace — from the 400 m + 200 m test in{" "}
                      <a href="/labs" className="underline">
                        Labs
                      </a>
                      .
                    </div>
                  </div>
                </div>
              </div>

              <NutritionContextEditor value={nutritionDraft} onChange={value=>{setNutritionDraft(value);setNutritionDirty(true);setSaved(false);}} />

              <button
                type="submit"
                className="btn-primary w-full justify-center"
              >
                <Save className="w-4 h-4" /> {saving ? (lang === "es" ? "Guardando…" : "Saving…") : (lang === "es" ? "Guardar perfil" : "Save Profile")}
              </button>
            </fieldset></form>
            {vo2Estimate && (
              <div className="mt-3 text-sm bg-ocean-50 border border-ocean-200 rounded-xl p-3">
                <strong>Estimated VO2max:</strong>{" "}
                {fmtNum(vo2Estimate.vo2max, lang, 1)} ml/kg/min (
                {vo2Estimate.label}, {fmtNum(vo2Estimate.pctile, lang)}th
                percentile)
                <div className="text-xs text-slate-500 mt-1">
                  Jurca 2005 non-exercise regression · age {vo2Estimate.age} ·
                  BMI {vo2Estimate.bmi}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="card">
              <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-coral-500" /> Your HR Zones
                — max HR {zones?.anchorHr || "—"} bpm
              </h2>
              {zones?.hr ? (
                <div className="space-y-1.5">
                  {HR_ZONES.map((z) => {
                    const r = zones.hr[z.key];
                    const b = zones.bikeHr?.[z.key];
                    return (
                      <div
                        key={z.key}
                        className="flex items-center gap-3 text-sm"
                      >
                        <span
                          className={`chip ${`chip-${z.key}`} w-28 justify-center`}
                        >
                          {z.name}
                        </span>
                        <span className="font-display font-bold w-24">
                          {r.low}-{r.high} bpm
                        </span>
                        <span className="text-xs text-slate-400 flex-1 truncate">
                          {z.description}{" "}
                          <span className="text-slate-500">(RPE {z.rpe})</span>
                        </span>
                        {b && (
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            Bike {b.low}-{b.high}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {zones.swim && (
                    <div className="border-t border-sand-200 pt-2 mt-2 text-xs text-slate-500">
                      Swim (sec/100m): Z1 {zones.swim.z1.high}-
                      {zones.swim.z1.low} · Z2 {zones.swim.z2.high}-
                      {zones.swim.z2.low} · Z3 {zones.swim.z3.high}-
                      {zones.swim.z3.low} · Z4 {zones.swim.z4.high}-
                      {zones.swim.z4.low} · Z5 {zones.swim.z5.high}-
                      {zones.swim.z5.low} (threshold {zones.anchorSwim}s)
                    </div>
                  )}
                  {zones.power && (
                    <div className="border-t border-sand-200 pt-2 mt-2 text-xs text-slate-500">
                      Power: Z1 &lt;{zones.power.z1.high}W · Z2{" "}
                      {zones.power.z2.low}-{zones.power.z2.high}W · Z3{" "}
                      {zones.power.z3.low}-{zones.power.z3.high}W · Z4{" "}
                      {zones.power.z4.low}-{zones.power.z4.high}W · Z5+{" "}
                      {zones.power.z5.low}+W (FTP {zones.anchorPower}W)
                    </div>
                  )}
                  {zones.vo2maxHr && (
                    <div className="border-t border-sand-200 pt-2 mt-2 text-xs text-slate-500">
                      VO2max ≈ {fmtNum(zones.vo2maxHr, lang, 1)} ml/kg/min (Uth
                      2004: 15.3 × HRmax ÷ HRrest)
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Enter your max HR to see personalized zones.
                </p>
              )}
              <p className="text-[11px] text-slate-400 mt-3">
                Zones follow the MyProCoach 5-zone model anchored on max HR
                (run). Bike = run − 6 bpm. Swim uses CSS/threshold pace. Gym,
                Strength &amp; HYROX use the same zones guided by RPE. Run the
                tests in{" "}
                <a href="/labs" className="text-ocean-600 underline">
                  Labs &amp; Tests
                </a>{" "}
                to fill in your real numbers.
              </p>
            </div>
          </div>
        </div>

        {/* ── Where your numbers come from ── */}
        <div className="card bg-ocean-50 border-ocean-200">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" />
            <div className="text-sm text-ocean-900">
              <strong>{lang === "es" ? "De dónde vienen tus números:" : "Where your numbers come from:"}</strong>{" "}
              {lang === "es"
                ? "Los tests de campo (Labs) llenan tus umbrales reales. Los dispositivos sincronizados llenan tus métricas diarias. El chequeo diario adapta el entreno. Cada dato hace el coach más preciso."
                : "Field tests (Labs) fill your real thresholds. Connected devices fill your daily metrics. The daily check-in adapts the training. Every piece of data makes the coach more precise."}
            </div>
          </div>
        </div>

        {/* ── Integrated modules hub (Conectores · ADN · Equipamiento · Sangre) ── */}
        <div className="border-t border-sand-200 pt-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-display font-bold text-lg">
              {t(lang, "settings.modulesTitle")}
            </h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            {t(lang, "settings.modulesSub")}
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                href: "/connectors",
                icon: Plug,
                tint: "text-ocean-600 bg-ocean-100",
                name: t(lang, "settings.mod.connectors"),
                desc: t(lang, "settings.mod.connectorsDesc"),
                status:
                  connectedCount > 0
                    ? t(lang, "settings.mod.connected").replace(
                        "{n}",
                        String(connectedCount),
                      )
                    : t(lang, "settings.mod.notSetUp"),
              },
              {
                href: "/dna",
                icon: Dna,
                tint: "text-coral-500 bg-coral-100",
                name: t(lang, "settings.mod.dna"),
                desc: t(lang, "settings.mod.dnaDesc"),
                status:
                  dnaTraits > 0
                    ? t(lang, "settings.mod.traits").replace(
                        "{n}",
                        String(dnaTraits),
                      )
                    : t(lang, "settings.mod.notSetUp"),
              },
              {
                href: "/gear",
                icon: Bike,
                tint: "text-emerald-600 bg-emerald-100",
                name: t(lang, "settings.mod.gear"),
                desc: t(lang, "settings.mod.gearDesc"),
                status:
                  gearTracked > 0
                    ? t(lang, "settings.mod.gearCount").replace(
                        "{n}",
                        String(gearTracked),
                      )
                    : t(lang, "settings.mod.notSetUp"),
              },
              {
                href: "/blood",
                icon: FlaskConical,
                tint: "text-vermillion-500 bg-vermillion-400/10",
                name: t(lang, "settings.mod.blood"),
                desc: t(lang, "settings.mod.bloodDesc"),
                status:
                  panels.length > 0
                    ? t(lang, "settings.mod.panels")
                        .replace("{n}", String(panels.length))
                        .replace("{f}", String(bloodFlags))
                    : t(lang, "settings.mod.notSetUp"),
              },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <Link
                  key={m.href}
                  href={m.href}
                  className="card flex flex-col hover:shadow-md transition-shadow group"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.tint}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="font-semibold mt-3">{m.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                    {m.desc}
                  </div>
                  <div className="mt-auto pt-3 flex items-center justify-between text-sm">
                    <span className="text-xs font-medium text-slate-400">
                      {m.status}
                    </span>
                    <span className="text-xs font-semibold text-ocean-600 flex items-center gap-1">
                      {t(lang, "settings.mod.open")}{" "}
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    <BaselineTests onSaved={load} />
      </ProtectedPage>
  );
}
