"use client";

import { useEffect, useState } from "react";
import { Gauge, Waves, Bike, Zap, Fuel, Target, Flag, AlertTriangle, Info, RefreshCw, Clock, Mountain, Thermometer } from "lucide-react";
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ForecastView data={data} forecast={data?.forecast} lang={lang} />
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

function ForecastView({ data, forecast, lang }: { data: any; forecast: ForecastResult | null; lang: Lang }) {
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
      </div>

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
