"use client";

import { saveReviewedProfile } from "@/lib/profile-client";
import { useEffect, useState } from "react";
import { Gauge, Waves, Bike, Zap, Fuel, Target, Flag, AlertTriangle, Info, RefreshCw, Clock, Mountain, Thermometer, Droplets, FileText, Sparkles } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { t, type Lang } from "@/lib/i18n";
import { fmtTime, fmtSecPerKm, fmtSecPer100m, FORECASTABLE_DISTANCES, type ForecastResult } from "@/lib/raceforecast";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const SPORT_ICON: Record<string, any> = { swim: Waves, bike: Bike, run: Zap };

const CONFIDENCE_STYLE: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-coral-50 text-coral-700 border-coral-200",
};

export default function RaceForecastPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [races, setRaces] = useState<any[]>([]);
  const [distance, setDistance] = useState<string>("olympic");
  const [raceId, setRaceId] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pmc, setPmc] = useState<any>(null);
  const [brief, setBrief] = useState<{ source: string; text: string } | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [pn, setPn] = useState<any>({
    sweatRateMlH: "", sodiumMgPerL: "", gutTrained: false,
    draftSkill: "", federation: "", category: "",
  });
  const [pnSaving, setPnSaving] = useState(false);
  const [pnSaved, setPnSaved] = useState(false);
  const [pnError, setPnError] = useState("");
  const [revision, setRevision] = useState<string | null>(null);

  async function loadProfile() {
    try {
      const res = await fetch("/api/profile");
      const d = await res.json();
      if (!res.ok) throw Error(d.error || "Could not load profile");
      setRevision(d.revision);
      if (d?.profile) setPn((prev: any) => ({
        ...prev,
        sweatRateMlH: d.profile.sweatRateMlH ?? "",
        sodiumMgPerL: d.profile.sodiumMgPerL ?? "",
        gutTrained: d.profile.gutTrained ?? false,
        draftSkill: d.profile.draftSkill ?? "",
        federation: d.profile.federation ?? "",
        category: d.profile.category ?? "",
      }));
    } catch(e) { setPnError((e as Error).message); }
  }

  async function savePersonalNumbers() {
    setPnSaving(true);
    setPnSaved(false);
    setPnError("");
    try {
      const body: Record<string, unknown> = {
        sweatRateMlH: pn.sweatRateMlH === "" ? null : Number(pn.sweatRateMlH),
        sodiumMgPerL: pn.sodiumMgPerL === "" ? null : Number(pn.sodiumMgPerL),
        gutTrained: Boolean(pn.gutTrained),
        draftSkill: pn.draftSkill || null,
        federation: pn.federation || null,
        category: pn.category || null,
      };
      await saveReviewedProfile(body, revision);
      setPnSaved(true);
      setRevision(null);
      setPnError("Saved. Reload to review current values before another change.");
      loadForecast();
    } catch(e) { setPnError((e as Error).message);
    } finally {
      setPnSaving(false);
    }
  }

  async function loadBrief() {
    setBriefLoading(true);
    try {
      const qs = raceId ? `?id=${encodeURIComponent(raceId)}` : `?distance=${encodeURIComponent(distance)}`;
      const res = await fetch(`/api/race-forecast/brief${qs}`);
      const d = await res.json();
      if (d?.ok) setBrief({ source: d.source, text: d.brief });
    } finally {
      setBriefLoading(false);
    }
  }

  async function loadRaces() {
    const res = await fetch("/api/races");
    const d = await res.json();
    setRaces(d.races || []);
  }

  async function loadForecast() {
    setLoading(true);
    const qs = raceId ? `?id=${encodeURIComponent(raceId)}` : `?distance=${encodeURIComponent(distance)}`;
    const res = await fetch(`/api/race-forecast${qs}`);
    const d = await res.json();
    setData(d);
    setLoading(false);
  }

  useEffect(() => {
    fetch("/api/fitness").then((r) => r.json()).then((d) => setPmc(d.pmc || null)).catch(() => {});

    if (!user) return;
    loadRaces();
    loadForecast();
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Gauge className="w-6 h-6 text-coral-500" /> {t(lang, "fc.title")}
            </h1>
            <p className="text-slate-500 text-sm mt-1">{t(lang, "fc.subtitle")}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="card">
          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="label">{t(lang, "fc.savedRace")}</label>
              <select className="input" value={raceId} onChange={(e) => { setRaceId(e.target.value); }}>
                <option value="">{t(lang, "fc.pickRace")}</option>
                {races.map((r) => (
                  <option key={r.id} value={r.id}>{r.name} · {r.distance} · {new Date(r.date).toLocaleDateString()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t(lang, "fc.orDistance")}</label>
              <select className="input" value={distance} onChange={(e) => { setRaceId(""); setDistance(e.target.value); }}>
                {FORECASTABLE_DISTANCES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <button
              onClick={loadForecast}
              className="btn-primary justify-center"
            >
              <RefreshCw className="w-4 h-4" /> {t(lang, "fc.forecast")}
            </button>
          </div>

          {/* Personal race numbers — measured inputs the engine uses directly */}
          <details className="mt-3 border-t border-sand-200 pt-3">
            <summary className="text-xs font-semibold text-ocean-700 cursor-pointer">
              {lang === "es" ? "Tus números de carrera (sudor, federación, bocas)" : "Your race numbers (sweat, federation, drafting)"}
            </summary>
            <div className="grid md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label">{lang === "es" ? "Sudoración (ml/h)" : "Sweat rate (ml/h)"}</label>
                <input type="number" className="input" value={pn.sweatRateMlH} onChange={(e) => setPn({ ...pn, sweatRateMlH: e.target.value } as any)} placeholder={lang === "es" ? "mide: peso antes/después" : "measure: weigh in/out"} />
              </div>
              <div>
                <label className="label">{lang === "es" ? "Sodio en sudor (mg/L)" : "Sweat sodium (mg/L)"}</label>
                <input type="number" className="input" value={pn.sodiumMgPerL} onChange={(e) => setPn({ ...pn, sodiumMgPerL: e.target.value } as any)} placeholder="500–1000" />
              </div>
              <div>
                <label className="label">{lang === "es" ? "Piernas en el agua" : "Open-water drafting"}</label>
                <select className="input" value={pn.draftSkill} onChange={(e) => setPn({ ...pn, draftSkill: e.target.value } as any)}>
                  <option value="">{lang === "es" ? "Nada / solo" : "None / swim alone"}</option>
                  <option value="mixed">{lang === "es" ? "A veces pies" : "Mixed"}</option>
                  <option value="good">{lang === "es" ? "Bueno (pie/olas)" : "Good (on feet)"}</option>
                </select>
              </div>
              <div>
                <label className="label">{lang === "es" ? "Federación" : "Federation"}</label>
                <select className="input" value={pn.federation} onChange={(e) => setPn({ ...pn, federation: e.target.value } as any)}>
                  <option value="">—</option>
                  <option value="USAT">USAT</option>
                  <option value="WORLD_TRIATHLON">World Triathlon</option>
                  <option value="BRITISH_TRIATHLON">British Triathlon</option>
                  <option value="IRONMAN">Ironman</option>
                </select>
              </div>
              <div>
                <label className="label">{lang === "es" ? "Categoría" : "Category"}</label>
                <select className="input" value={pn.category} onChange={(e) => setPn({ ...pn, category: e.target.value } as any)}>
                  <option value="">—</option>
                  <option value="age_group">Age group</option>
                  <option value="elite">Elite</option>
                </select>
              </div>
              <label className="flex items-end gap-2 text-sm text-slate-600 pb-2 cursor-pointer">
                <input type="checkbox" checked={!!pn.gutTrained} onChange={(e) => setPn({ ...pn, gutTrained: e.target.checked } as any)} className="w-4 h-4" />
                {lang === "es" ? "Intestino entrenado (90–120 g/h)" : "Gut-trained (90–120 g/h)"}
              </label>
            </div>
            {pnError && <div role="status" className="text-sm">{pnError} <button className="underline" onClick={() => window.location.reload()}>Reload and review</button></div>}
            <button onClick={savePersonalNumbers} disabled={pnSaving} className="btn-secondary text-xs mt-3">
              {pnSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              {lang === "es" ? "Guardar y recalcular" : "Save & re-forecast"}
              {pnSaved && <span className="text-emerald-600 ml-1">✓</span>}
            </button>
            <p className="text-[11px] text-slate-400 mt-2">
              {lang === "es"
                ? "Sin estos datos el motor usa valores poblacionales (500–1000 ml/h, 500–1000 mg/L) y lo dice en el plan."
                : "Without these the engine uses labeled population defaults (500–1000 ml/h, 500–1000 mg/L) and says so in the plan."}
            </p>
          </details>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ForecastView
            data={data}
            forecast={data?.forecast}
            lang={lang}
            brief={brief}
            briefLoading={briefLoading}
            onBrief={loadBrief}
          />
        )}
      {/* Measured course + pre-race snapshot — honest forecasting surfaced */}
      {(data?.race?.courseKm != null || data?.predictionSnapshot) && (
        <div className="card border-ocean-200 bg-ocean-50/40">
          <div className="text-xs font-bold uppercase tracking-wide text-ocean-700 mb-1.5">
            📐 {lang === "es" ? "Curso medido y snapshot previo" : "Measured course & pre-race snapshot"}
          </div>
          {data?.race?.courseKm != null && (
            <div className="text-sm text-ocean-900">
              GPX: <strong>{data.race.courseKm} km</strong> · {data.race.courseElevM} m {lang === "es" ? "ascenso medido — aplicado al pronóstico" : "ascent measured — applied to this forecast"}
            </div>
          )}
          {data?.predictionSnapshot ? (
            <div className="text-xs text-slate-600 mt-1">
              📸 {lang === "es" ? "Pronóstico previo guardado" : "Pre-race prediction saved"}{" "}
              {new Date(data.predictionSnapshot.capturedAt).toLocaleDateString()} —{" "}
              <strong>{fmtTime(data.predictionSnapshot.predictedMin)}</strong> ({data.predictionSnapshot.snapshotCount} {lang === "es" ? "snapshots" : "snapshots"}).
              {data.race?.resultMin != null && data.predictionSnapshot.errorPct != null && (
                <>
                  {" "}{lang === "es" ? "Error del pronóstico PRE-CARRERA" : "PRE-RACE prediction error"}:{" "}
                  <strong>{data.predictionSnapshot.errorPct > 0 ? "+" : ""}{data.predictionSnapshot.errorPct}%</strong>
                </>
              )}
            </div>
          ) : data?.race?.courseKm != null ? null : (
            <div className="text-xs text-slate-500 mt-1">
              {lang === "es"
                ? "Sube el GPX del recorrido en Races y el motor usará la distancia y ascenso reales."
                : "Upload the race GPX in Races and the engine will use the real distance and ascent."}
            </div>
          )}
        </div>
      )}
      {/* Prediction accuracy: predicted vs the actual logged result */}
      {data?.race?.resultMin != null && data?.forecast?.totalMin != null && (
        <div className="card border-emerald-200 bg-emerald-50/60">
          <div className="text-sm text-emerald-900">
            🎯 {lang === "es" ? "Precisión de AdvanzedRacing" : "AdvanzedRacing accuracy"}: {lang === "es" ? "predicho" : "predicted"} <strong>{fmtTime(data.forecast.totalMin)}</strong> · {lang === "es" ? "real" : "actual"} <strong>{fmtTime(data.race.resultMin)}</strong> · {lang === "es" ? "error" : "error"} <strong>{data.race.predictionErrorPct > 0 ? "+" : ""}{data.race.predictionErrorPct}%</strong>
            {Math.abs(data.race.predictionErrorPct) <= 5 ? (lang === "es" ? " — dentro del 5%: predicción de confianza." : " — within 5%: high-trust prediction.") : ""}
          </div>
        </div>
      )}

      {/* PMC — the performance curve this engine learns from */}
      <PmcCard pmc={pmc} lang={lang} />

      </div>
    </ProtectedPage>
  );
}

function PmcCard({ pmc, lang }: { pmc: any; lang: string }) {
  const es = lang === "es";
  if (!pmc?.series?.length) {
    return (
      <div className="card text-center py-8 text-sm text-slate-400">
        {es ? "La curva de rendimiento (Fitness/Fatiga/Form) aparece al completar entrenamientos." : "The performance curve (Fitness/Fatigue/Form) appears as you complete workouts."}
      </div>
    );
  }
  return (
    <div className="card">
      <div className="font-display font-bold mb-1">{es ? "Tu curva de rendimiento" : "Your performance curve"}</div>
      <div className="text-xs text-slate-500 mb-3">
        {es ? "Esta es la data que AdvanzedRacing usa para predecir: " : "This is the data AdvanzedRacing predicts from: "}
        CTL (Fitness) {Math.round(pmc.current.ctl)} · ATL (Fatigue) {Math.round(pmc.current.atl)} · TSB (Form) {Math.round(pmc.current.tsb)}.
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pmc.series}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="ctl" name={es ? "Fitness (CTL)" : "Fitness (CTL)"} stroke="#0ea5e9" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="atl" name={es ? "Fatiga (ATL)" : "Fatigue (ATL)"} stroke="#f59e0b" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="tsb" name={es ? "Forma (TSB)" : "Form (TSB)"} stroke="#10b981" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ForecastView({ data, forecast, lang, brief, briefLoading, onBrief }: {
  data: any; forecast: ForecastResult | null; lang: Lang;
  brief: { source: string; text: string } | null; briefLoading: boolean; onBrief: () => void;
}) {
  const es = lang === "es";
  if (!forecast) {
    return (
      <div className="card text-center py-16">
        <Flag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="font-display font-bold text-lg">{t(lang, "fc.noForecast")}</h3>
        <p className="text-sm text-slate-500 mt-1">
          {data?.reason === "not_forecastable"
            ? t(lang, "fc.notForecastable")
            : t(lang, "fc.addRaceFirst")}
        </p>
      </div>
    );
  }

  const confCls = CONFIDENCE_STYLE[forecast.confidence] || CONFIDENCE_STYLE.low;
  const totalSeconds = Math.round(forecast.totalMin * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const totalLabel = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Headline */}
      <div className="rounded-3xl border border-ink-200 bg-white p-6 md:p-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Flag className="w-4 h-4 text-coral-500" />
              {data?.race ? data.race.name : forecast.distanceLabel}
              {data?.race?.priority === 1 ? " · A-race" : ""}
            </div>
            <div className="font-display text-4xl md:text-5xl font-bold mt-2 tracking-tight">{totalLabel}</div>
            <div className="text-sm text-slate-500 mt-1">
              {t(lang, "fc.predictedFinish")} · {t(lang, "fc.baseline")} {fmtTime(forecast.baselineTotalMin)} {t(lang, "fc.beforeAdjust")}
            </div>
            {forecast.goalDeltaMin != null && (
              <div className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-lg ${forecast.goalDeltaMin > 0 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                <Target className="w-4 h-4" />
                {forecast.goalDeltaMin > 0
                  ? `~${fmtTime(forecast.goalDeltaMin)} ${t(lang, "fc.slowerThanGoal")}`
                  : `~${fmtTime(Math.abs(forecast.goalDeltaMin))} ${t(lang, "fc.fasterThanGoal")}`}
              </div>
            )}
          </div>
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${confCls}`}>
            {t(lang, `fc.confidence.${forecast.confidence}`)}
          </span>
        </div>

        {/* Segments */}
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {forecast.segments.map((seg) => {
            const Icon = SPORT_ICON[seg.sport] || Gauge;
            return (
              <div key={seg.sport} className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <Icon className="w-4 h-4 text-ocean-600" /> {t(lang, `fc.${seg.label}`)}
                </div>
                <div className="font-display text-2xl font-bold mt-1">{fmtTime(seg.timeMin)}</div>
                <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                  <div>{seg.distanceLabel}</div>
                  {seg.pace && <div>{t(lang, "fc.pace")}: {seg.pace}</div>}
                  {seg.speedKmh != null && <div>{t(lang, "fc.speed")}: {seg.speedKmh} km/h</div>}
                  {seg.powerTargetW != null && <div className="text-ocean-700 font-semibold">{t(lang, "fc.power")}: {seg.powerTargetW} W · {seg.intensityFactor! * 100}% FTP</div>}
                  {seg.hrTarget && <div>{t(lang, "fc.hr")}: {seg.hrTarget}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {forecast.transitionsMin > 0 && (
          <div className="text-xs text-slate-400 mt-3">+ {forecast.transitionsMin} min {t(lang, "fc.transitions")} · total {fmtTime(forecast.totalMin)}</div>
        )}

        {/* Weather scenarios: the honest band, not a single number */}
        {forecast.scenarios && forecast.scenarios.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              ☀ {es ? "Mejor clima" : "Best weather"}: {fmtTime(forecast.scenarios.find((x) => x.label === "best")?.totalMin ?? forecast.totalMin)}
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              ⛅ {es ? "Pronosticado" : "Expected"}: {fmtTime(forecast.totalMin)}
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-200">
              🔥 {es ? "Peor clima" : "Worst weather"}: {fmtTime(forecast.scenarios.find((x) => x.label === "worst")?.totalMin ?? forecast.totalMin)}
            </span>
          </div>
        )}

        {/* Per-segment pacing table — from the uploaded GPX profile + physics */}
        {data?.pacing && data.pacing.segments?.length > 0 && (
          <div className="mt-6 rounded-2xl border border-sand-200 bg-white p-4">
            <h3 className="font-display font-bold text-sm flex items-center gap-2">
              📍 {es ? "Plan de ritmo por segmento" : "Per-segment pacing plan"}
              <span className="text-xs font-normal text-slate-400">
                {data.pacing.sport === "bike"
                  ? `${es ? "vatios mantenibles" : "holdable watts"}${data.pacing.cdaUsed ? ` · CdA ${data.pacing.cdaUsed}` : ""}`
                  : es ? "ritmo objetivo" : "target pace"}
              </span>
            </h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-sand-200">
                    <th className="py-1 pr-3">{es ? "Segmento" : "Segment"}</th>
                    <th className="py-1 pr-3">{es ? "Pendiente" : "Grade"}</th>
                    <th className="py-1 pr-3">{data.pacing.sport === "bike" ? (es ? "Potencia" : "Power") : (es ? "Ritmo" : "Pace")}</th>
                    <th className="py-1 pr-3">{es ? "Acumulado" : "Cumulative"}</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {data.pacing.segments.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-sand-100">
                      <td className="py-1 pr-3">{r.fromKm}–{r.toKm} km</td>
                      <td className={`py-1 pr-3 ${r.gradePct > 2 ? "text-red-600" : r.gradePct < -2 ? "text-emerald-600" : ""}`}>
                        {r.gradePct > 0 ? "+" : ""}{r.gradePct}%
                      </td>
                      <td className="py-1 pr-3 font-semibold text-ocean-700">
                        {r.targetW != null ? `${r.targetW} W · ${r.speedKmh} km/h`
                          : r.paceSecPerKm != null
                            ? `${Math.floor(r.paceSecPerKm / 60)}:${String(Math.round(r.paceSecPerKm % 60)).padStart(2, "0")}/km`
                            : "—"}
                      </td>
                      <td className="py-1 pr-3">{Math.floor(r.cumMin / 60)}:{String(Math.round(r.cumMin % 60)).padStart(2, "0")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[11px] text-slate-500 space-y-0.5">
              <div>{data.pacing.note}</div>
              {data.pacing.gustRangeMin && data.pacing.gustRangeMin[1] > data.pacing.gustRangeMin[0] && (
                <div>
                  💨 {es ? "Banda por viento/ráfagas" : "Wind/gust band"}: {fmtTime(data.pacing.gustRangeMin[0])} – {fmtTime(data.pacing.gustRangeMin[1])}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Race-day brief (AI writes prose; the engine owns every number) */}
        <div className="mt-6">
          <button onClick={onBrief} disabled={briefLoading} className="btn-secondary text-sm">
            {briefLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-coral-500" />}
            {es ? "Generar plan de carrera (brief)" : "Generate race plan brief"}
            {brief && <span className="ml-1 text-slate-400">({brief.source === "gemini" ? "AI" : "template"})</span>}
          </button>
          {brief && (
            <pre className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 bg-sand-50 border border-sand-200 rounded-2xl p-4 font-sans max-h-96 overflow-y-auto">{brief.text}</pre>
          )}
        </div>
      </div>

      {/* Conditions: WBGT + wetsuit legality (federation-specific) */}
      {(forecast.wbgt || forecast.wetsuit) && (
        <div className="card">
          <h2 className="font-display font-bold text-lg flex items-center gap-2 mb-3">
            <Thermometer className="w-5 h-5 text-coral-500" /> {es ? "Condiciones de carrera" : "Race conditions"}
          </h2>
          {forecast.wbgt && (
            <div className="rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm">
              <div className="font-semibold text-slate-700">
                WBGT {forecast.wbgt.value}°C · {es ? "punto de rocío" : "dew point"} {forecast.wbgt.dewPointC}°C
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full border ${forecast.wbgt.zone === "ok" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : forecast.wbgt.zone === "red_flag" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                  {forecast.wbgt.zone === "ok" ? (es ? "manejable" : "manageable") : forecast.wbgt.zone === "red_flag" ? (es ? "banda roja" : "red flag") : (es ? "banda negra" : "black flag")}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{forecast.wbgt.note}</p>
              {forecast.wbgt.advisory && <p className="text-xs text-amber-600 mt-1">{forecast.wbgt.advisory}</p>}
              <p className="text-[10px] text-slate-400 mt-1">{forecast.wbgt.method}</p>
            </div>
          )}
          {forecast.wetsuit && (
            <div className="rounded-xl border border-sand-200 bg-sand-50 p-4 text-sm mt-3">
              <div className="font-semibold text-slate-700 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-ocean-600" /> {es ? "Traje" : "Wetsuit"} ({forecast.wetsuit.federation})
                <span className={`text-xs px-2 py-0.5 rounded-full border ${forecast.wetsuit.verdict === "forbidden" ? "bg-red-50 text-red-700 border-red-200" : forecast.wetsuit.verdict === "mandatory" ? "bg-ocean-50 text-ocean-700 border-ocean-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                  {forecast.wetsuit.verdict.replace(/_/g, " ")}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{forecast.wetsuit.note}</p>
              <p className="text-[10px] text-slate-400 mt-1">⚠ {forecast.wetsuit.citation} — {es ? "verifica el reglamento vigente" : "verify the current rulebook"}.</p>
            </div>
          )}
        </div>
      )}

      {/* Factors */}
      {forecast.factors.length > 0 && (
        <div className="card">
          <h2 className="font-display font-bold text-lg flex items-center gap-2 mb-3">
            <Thermometer className="w-5 h-5 text-coral-500" /> {t(lang, "fc.whyMoved")}
          </h2>
          <ul className="space-y-2 text-sm text-slate-600">
            {forecast.factors.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-vermillion-500 mt-0.5">▸</span>
                <span className="leading-relaxed">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fuel plans */}
      <div className="card">
        <h2 className="font-display font-bold text-lg flex items-center gap-2 mb-3">
          <Fuel className="w-5 h-5 text-ocean-500" /> {t(lang, "fc.fuelPerLeg")}
        </h2>
        {forecast.fuelTotal && (
          <div className="rounded-xl border border-ocean-200 bg-ocean-50/50 p-4 mb-4 text-sm">
            <div className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4 text-ocean-600" /> {es ? "Plan completo + calorías" : "Full plan + calories"}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><div className="text-slate-400">{es ? "Carboshidratos" : "Carbs"}</div><strong>{forecast.fuelTotal.carbsGPerHour} g/h</strong> · {forecast.fuelTotal.totalCarbsG} g</div>
              <div><div className="text-slate-400">{es ? "Calorías (ingesta)" : "Calories (intake)"}</div><strong>~{forecast.fuelTotal.totalKcalIntake} kcal</strong></div>
              <div><div className="text-slate-400">{es ? "Líquido" : "Fluid"}</div><strong>{forecast.fuelTotal.fluidMlPerHour} ml/h</strong> · {(forecast.fuelTotal.totalFluidMl / 1000).toFixed(1)} L</div>
              <div><div className="text-slate-400">Sodio</div><strong>{forecast.fuelTotal.sodiumMgPerHour} mg/h</strong> · {forecast.fuelTotal.totalSodiumMg} mg</div>
            </div>
            {forecast.fuelTotal.estimatedKcalBurned != null && (
              <div className="text-xs text-slate-500 mt-2">
                {es ? "Gasto total estimado" : "Estimated total burn"}: <strong>~{forecast.fuelTotal.estimatedKcalBurned} kcal</strong> — {es ? "la ingesta reemplaza solo una parte; es fisiología normal en distancia larga" : "intake deliberately replaces only part; that's normal long-course physiology"}.
              </div>
            )}
            {forecast.fuelTotal.slots.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs font-semibold text-ocean-700 cursor-pointer">{es ? "Cronograma de nutrición" : "Fueling timeline"}</summary>
                <ul className="mt-1.5 text-xs text-slate-500 space-y-1 list-disc list-inside">
                  {forecast.fuelTotal.slots.map((s, i) => (
                    <li key={i}>
                      <strong>{s.fromMin < 0 ? `${-s.fromMin}' ${es ? "antes" : "before"}` : `${s.fromMin}–${s.toMin}'`}</strong> {s.what}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <div className="grid sm:grid-cols-3 gap-4">
          {forecast.segments.map((seg) => (
            <div key={seg.sport} className="rounded-xl border border-sand-200 p-4">
              <div className="text-sm font-semibold text-slate-700">{seg.label}</div>
              <div className="text-xs text-slate-500 mt-1 space-y-1">
                <div>Carbs: <strong>{seg.fuel.carbsPerHourG} g/h</strong></div>
                <div>Sodium: <strong>{seg.fuel.sodiumMgPerHour} mg/h</strong></div>
                <div>Fluid: <strong>{seg.fuel.fluidMlPerHour} ml/h</strong></div>
                {seg.fuel.caffeineMg != null && <div>Caffeine: <strong>{seg.fuel.caffeineMg} mg</strong></div>}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{seg.fuel.notes}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Gaps / warnings */}
      {(forecast.measurementGaps.length > 0 || data?.pmc == null) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4" /> {t(lang, "fc.tighten")}
          </div>
          <ul className="mt-1.5 text-xs text-amber-700 space-y-1 list-disc list-inside">
            {data?.pmc == null && <li>{t(lang, "fc.noWorkouts")}</li>}
            {forecast.measurementGaps.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-start gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>{t(lang, "fc.disclaimer")}</span>
      </p>
    </div>
  );
}
