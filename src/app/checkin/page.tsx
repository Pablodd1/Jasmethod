"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Flame, Pill, Zap, Wind, ShoppingCart, BookOpen, HeartPulse, Mic, CheckCircle2, CalendarClock, Apple, Music } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { t, type Lang } from "@/lib/i18n";
import { parseCheckinTranscript, type VoiceCheckinAnswers } from "@/lib/voice-parse";

const QUESTIONS = [
  { key: "sleep", label: "Sleep quality last night", hint: "1 = terrible, 5 = great" },
  { key: "soreness", label: "Muscle soreness", hint: "1 = fresh, 5 = wrecked" },
  { key: "motivation", label: "Motivation", hint: "1 = none, 5 = fired up" },
  { key: "energy", label: "Energy", hint: "1 = drained, 5 = buzzing" },
  { key: "stress", label: "Life stress", hint: "1 = calm, 5 = overwhelmed" },
];

const VERDICT_COLOR: Record<string, string> = { full: "text-emerald-600", trim: "text-amber-600", easy: "text-orange-600", rest: "text-coral-600" };

export default function CheckinPage() {
  const { user } = useAuth();
  const lang = (user?.language || "en") as Lang;
  const [answers, setAnswers] = useState<any>({ sleep: "3", soreness: "3", motivation: "3", energy: "3", stress: "3", sick: false, menstrual: false, weightKg: "", rhr: "" });
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [heard, setHeard] = useState<VoiceCheckinAnswers | null>(null);
  const [speechError, setSpeechError] = useState("");

  function startVoice() {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSpeechError("Voice isn't supported in this browser — use Chrome/Edge/Safari, or just type below.");
      return;
    }
    const rec = new SR();
    const langMap: Record<string, string> = { en: "en-US", es: "es-ES", ht: "ht-HT", fr: "fr-FR", ru: "ru-RU" };
    rec.lang = langMap[(user?.language as string) || "en"] || "en-US";
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setTranscript(text);
    };
    rec.onerror = (e: any) => { setListening(false); setSpeechError(`Voice error: ${e.error} — type below instead.`); };
    rec.onend = () => {
      setListening(false);
      setTranscript((tx) => {
        const clean = tx.trim();
        if (clean) setHeard(parseCheckinTranscript(clean));
        return tx;
      });
    };
    setListening(true); setSpeechError(""); setTranscript(""); setHeard(null);
    rec.start();
  }

  function applyHeard() {
    if (!heard) return;
    setAnswers((a: any) => ({
      ...a,
      sleep: String(heard.sleep ?? a.sleep),
      soreness: String(heard.soreness ?? a.soreness),
      energy: String(heard.energy ?? a.energy),
      motivation: String(heard.motivation ?? a.motivation),
      stress: String(heard.stress ?? a.stress),
      weightKg: heard.weightKg ? String(heard.weightKg) : a.weightKg,
      rhr: heard.rhr ? String(heard.rhr) : a.rhr,
      sick: heard.sick,
      menstrual: heard.menstrual,
    }));
    setHeard(null);
  }

  async function load() {
    const res = await fetch("/api/checkin");
    const d = await res.json();
    if (d.checkin?.answers) setAnswers({ ...answers, ...JSON.parse(d.checkin.answers) });
    if (d.checkin?.adaptation) setResult({ adaptation: JSON.parse(d.checkin.adaptation) });
    if (d.recovery || d.fuelBrands || d.sources) setResult((r: any) => ({ ...(r || {}), recovery: d.recovery, fuelBrands: d.fuelBrands, sources: d.sources }));
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(answers) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setResult(d);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  const setQ = (k: string, v: any) => setAnswers((a: any) => ({ ...a, [k]: v }));
  const adaptation = result?.adaptation || result;
  const fuel = result?.fuel;
  const ergos = result?.ergos?.recommended;
  const recovery = result?.recovery;
  const fuelBrands = result?.fuelBrands;
  const sources = result?.sources;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Daily Check-In</h1>
          <p className="text-slate-500 text-sm">30 seconds each morning — your answers adapt today&apos;s training, fuel, and ergogenic aids.</p>
        </div>

        {err && <div className="text-sm text-coral-600 bg-coral-50 rounded-lg px-3 py-2">{err}</div>}

        {/* Voice check-in */}
        <div className="card bg-ocean-50 border-ocean-200">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-display font-bold text-lg flex items-center gap-2"><Mic className="w-5 h-5 text-ocean-600" /> Voice Check-In</h2>
              <p className="text-xs text-slate-500 mt-0.5">Say it all at once, e.g. "sleep was 4, soreness 2, energy 3, motivation 4, stress 2, weight 74 point 2, resting heart rate 48". Or keep typing below — both work.</p>
            </div>
            <button onClick={startVoice} disabled={listening} className={`btn-primary ${listening ? "opacity-70" : ""}`}>
              <Mic className="w-4 h-4" /> {listening ? "Listening… speak now" : "Start Voice"}
            </button>
          </div>
          {listening && <div className="text-xs text-ocean-700 mt-2 animate-pulse">● Recording — say your answers, then pause.</div>}
          {transcript && <p className="text-sm text-slate-600 mt-2 italic border-l-2 border-ocean-300 pl-2">“{transcript}”</p>}
          {speechError && <p className="text-xs text-amber-700 mt-2">{speechError}</p>}

          {heard && (
            <div className="mt-3 rounded-xl bg-white border border-ocean-200 p-3">
              <div className="font-semibold text-sm mb-2 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Heard from your voice — check each:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 text-xs">
                {([["sleep", "Sleep"], ["soreness", "Soreness"], ["energy", "Energy"], ["motivation", "Motivation"], ["stress", "Stress"]] as const).map(([k, label]) => (
                  <span key={k} className={`rounded-lg px-2 py-1 ${heard[k] ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                    {heard[k] ? `✓ ${label}: ${heard[k]}` : `${label}: —`}
                  </span>
                ))}
                <span className={`rounded-lg px-2 py-1 ${heard.weightKg ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{heard.weightKg ? `✓ Weight: ${heard.weightKg} kg` : "Weight: —"}</span>
                <span className={`rounded-lg px-2 py-1 ${heard.rhr ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{heard.rhr ? `✓ RHR: ${heard.rhr} bpm` : "RHR: —"}</span>
                <span className={`rounded-lg px-2 py-1 ${heard.sick ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{heard.sick ? "✓ Sick/injured" : "Sick: no"}</span>
                <span className={`rounded-lg px-2 py-1 ${heard.menstrual ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{heard.menstrual ? "✓ Menstrual" : "Period: no"}</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Anything wrong? Fix it in the form below after applying — then submit.</p>
              <button onClick={applyHeard} className="btn-primary text-xs px-4 py-2 mt-2"><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Apply to form</button>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3 flex items-center gap-2"><ClipboardCheck className="w-5 h-5 text-ocean-500" /> Questionnaire</h2>
            <form onSubmit={submit} className="space-y-4">
              {QUESTIONS.map((q) => (
                <div key={q.key}>
                  <label className="label">{q.label}</label>
                  <select className="input" value={answers[q.key]} onChange={(e) => setQ(q.key, e.target.value)}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <div className="text-[11px] text-slate-400">{q.hint}</div>
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={answers.sick} onChange={(e) => setQ("sick", e.target.checked)} /> Feeling sick or injured today
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={answers.menstrual} onChange={(e) => setQ("menstrual", e.target.checked)} /> Menstrual phase (adjusts readiness)
              </label>
              <label className="flex items-center gap-2 text-sm">
                Cycle day (1-35):
                <input type="number" min={1} max={35} value={answers.cycleDay || ""} onChange={(e) => setQ("cycleDay", e.target.value)} className="input w-20 !py-1 !px-2 text-xs" placeholder="—" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Morning weight (kg)</label>
                  <input type="number" step="0.1" className="input" value={answers.weightKg} onChange={(e) => setQ("weightKg", e.target.value)} placeholder="e.g. 74.0" />
                  <div className="text-[11px] text-slate-400">Same scale, after bathroom, before food — trend matters more than the number.</div>
                </div>
                <div>
                  <label className="label">Resting HR (bpm)</label>
                  <input type="number" className="input" value={answers.rhr} onChange={(e) => setQ("rhr", e.target.value)} placeholder="e.g. 48" />
                  <div className="text-[11px] text-slate-400">Before coffee, still in bed. +6 over baseline = back off.</div>
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn-primary w-full justify-center"><Zap className="w-4 h-4" /> {busy ? "Checking…" : "Get Today's Plan"}</button>
            </form>
          </div>

          <div className="space-y-4">
            {adaptation && (
              <div className="card">
                <h3 className="font-display font-bold mb-2">Today&apos;s Adaptation</h3>
                <div className={`font-display text-2xl font-bold ${VERDICT_COLOR[adaptation.verdict] || ""}`}>
                  {t(lang, `adapt.${adaptation.verdict}`)} · {adaptation.score}/100
                </div>
                <p className="text-sm text-slate-600 mt-1">{t(lang, `adapt.${adaptation.verdict}.msg`)}</p>
                <div className="text-xs text-slate-400 mt-2">Duration ×{adaptation.durationFactor} · intensity cap {adaptation.intensityCap}</div>
              </div>
            )}

            {result?.prescription && (
              <div className="card border-ocean-300 bg-ocean-50">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-ocean-600" /> Today&apos;s prescription — just execute</h3>
                <div className="font-semibold text-sm text-ocean-900">{result.prescription.title} · {result.prescription.durationMin} min</div>
                {result.prescription.targets.hr && <div className="text-xs text-ocean-700 mt-0.5">HR target: {result.prescription.targets.hr} · RPE {result.prescription.targets.rpe}/10</div>}
                {result.prescription.targets.pace && <div className="text-xs text-ocean-700">Pace: {result.prescription.targets.pace}</div>}
                {result.prescription.targets.power && <div className="text-xs text-ocean-700">Power: {result.prescription.targets.power}</div>}
                <div className="text-[11px] text-ocean-500 mt-1">{result.prescription.scaled.reason}</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div><span className="font-semibold text-ocean-800">Warm-up:</span> <span className="text-slate-700">{result.prescription.detail.wu}</span></div>
                  <div><span className="font-semibold text-ocean-800">Main:</span> <span className="text-slate-700">{result.prescription.detail.main}</span></div>
                  <div><span className="font-semibold text-ocean-800">Cool-down:</span> <span className="text-slate-700">{result.prescription.detail.cd}</span></div>
                  <div><span className="font-semibold text-ocean-800">Recovery:</span> <span className="text-slate-700">{result.prescription.detail.breathing}</span></div>
                  <div><span className="font-semibold text-ocean-800">Study:</span> <span className="text-slate-700">{result.prescription.detail.study}</span></div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {result.prescription.sources.map((s: string) => <span key={s} className="text-[10px] bg-ocean-100 text-ocean-700 rounded-full px-2 py-0.5">{s}</span>)}
                </div>
              </div>
            )}

            {result?.cycle && (
              <div className="card border-rose-200 bg-rose-50">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><HeartPulse className="w-4 h-4 text-rose-500" /> Cycle-aware coaching · {result.cycle.label}</h3>
                <div className="text-xs text-rose-600 mb-1">Strength: {result.cycle.strength} · Endurance: {result.cycle.endurance} · Protein: {result.cycle.proteinPerKg.toFixed(1)} g/kg</div>
                <p className="text-sm text-rose-800">{result.cycle.trainingNote}</p>
              </div>
            )}

            {result?.protein && (
              <div className="card">
                <h3 className="font-display font-bold mb-1 flex items-center gap-2"><Apple className="w-4 h-4 text-emerald-500" /> Protein target</h3>
                <p className="text-sm text-slate-600">{result.protein.note}</p>
              </div>
            )}

            {result?.youth && !result.youth.allowed && (
              <div className="card border-coral-300 bg-coral-50">
                <h3 className="font-display font-bold mb-1">Age policy</h3>
                <p className="text-sm text-coral-800">{result.youth.note}</p>
              </div>
            )}

            {result?.calendar?.busyNote && (
              <div className="card border-amber-200 bg-amber-50">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-600" /> Calendar-aware coaching</h3>
                <p className="text-sm text-amber-800">{result.calendar.busyNote}</p>
                <p className="text-xs text-amber-600 mt-1">Synced from Google Calendar — training is fit around your real schedule.</p>
              </div>
            )}

            {fuel && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Flame className="w-4 h-4 text-orange-500" /> {t(lang, "common.today")}</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <div>{t(lang, "fuel.carbs")}: <strong>{fuel.carbsPerHourG} g/h</strong></div>
                  <div>{t(lang, "fuel.sodium")}: <strong>{fuel.sodiumMgPerHour} mg/h</strong> · {t(lang, "fuel.fluid")}: <strong>{fuel.fluidMlPerHour} ml/h</strong></div>
                  {fuel.caffeineMg && <div>{t(lang, "fuel.caffeine")}: <strong>{fuel.caffeineMg} mg</strong> pre-session</div>}
                </div>
              </div>
            )}

            {ergos && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Pill className="w-4 h-4 text-ocean-500" /> {t(lang, "fuel.ergos")}</h3>
                {ergos.length === 0 ? (
                  <p className="text-sm text-slate-500">No aids match today&apos;s session.</p>
                ) : (
                  <div className="space-y-2">
                    {ergos.map((e: any) => (
                      <div key={e.key} className="text-sm">
                        <div><strong>{t(lang, `ergo.${e.key}`)}</strong> <span className="chip chip-z2">{e.evidence}</span></div>
                        <div className="text-xs text-slate-500">{e.dose} · {e.when}</div>
                        <div className="text-xs text-slate-400">{e.benefit}{e.caution ? ` ⚠ ${e.caution}` : ""}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {result?.post && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Apple className="w-4 h-4 text-emerald-500" /> Post-workout refuel</h3>
                <div className="text-sm text-slate-600 space-y-1">
                  <div><strong>{result.post.carbsG}g carbs : {result.post.proteinG}g protein</strong> ({result.post.ratio})</div>
                  <div className="text-xs text-slate-500">{result.post.window}</div>
                  <div className="text-xs text-slate-500">{result.post.sodiumMg}mg sodium · {result.post.fluidMl}ml fluid</div>
                  <div className="text-xs text-slate-500">{result.post.examples}</div>
                  <div className="text-xs text-slate-400 mt-1">{result.post.notes}</div>
                </div>
              </div>
            )}

            {result?.stim && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Music className="w-4 h-4 text-ocean-500" /> Stimulation — music, brain & breath</h3>
                <div className="space-y-2 text-sm">
                  <div><span className="font-semibold">Pre:</span> <a href={result.stim.pre.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.pre.music.title}</a>
                    <div className="text-xs text-slate-500">{result.stim.pre.brain}</div>
                    <div className="text-xs text-slate-400">{result.stim.pre.breath}</div>
                  </div>
                  {result.stim.during && (
                    <div><span className="font-semibold">During:</span> <a href={result.stim.during.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.during.music.title}</a>
                      <div className="text-xs text-slate-500">{result.stim.during.brain}</div>
                    </div>
                  )}
                  <div><span className="font-semibold">Post:</span> <a href={result.stim.post.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.post.music.title}</a>
                    <div className="text-xs text-slate-500">{result.stim.post.brain}</div>
                    <div className="text-xs text-slate-400">{result.stim.post.breath}</div>
                  </div>
                  <div><span className="font-semibold">Night:</span> <a href={result.stim.night.music.url} target="_blank" rel="noreferrer" className="text-ocean-600 underline">{result.stim.night.music.title}</a>
                    <div className="text-xs text-slate-500">{result.stim.night.brain}</div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{result.stim.post.why}</p>
                </div>
              </div>
            )}

            {recovery && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><Wind className="w-4 h-4 text-emerald-500" /> {t(lang, "common.recovery")}</h3>
                <div className="font-semibold text-sm">{recovery.name} · {recovery.minutes} min</div>
                <p className="text-xs text-slate-500 mt-1">{recovery.instructions}</p>
              </div>
            )}

            {result?.hydration && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><HeartPulse className="w-4 h-4 text-ocean-500" /> Weight & Hydration</h3>
                {result.hydration.rhrNote && <p className="text-xs text-slate-600 mb-1">❤️ {result.hydration.rhrNote}</p>}
                {result.hydration.weightTrend && (
                  <p className={`text-xs leading-relaxed rounded-lg px-2 py-1.5 ${result.hydration.weightTrend.flag === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    ⚖️ {result.hydration.weightTrend.advice}
                  </p>
                )}
                {!result.hydration.weightTrend && !result.hydration.rhrNote && <p className="text-xs text-slate-400">Add morning weight + RHR above — trends kick in after a few days.</p>}
              </div>
            )}

            {fuelBrands && (
              <div className="card">
                <h3 className="font-display font-bold mb-2 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-ocean-500" /> {t(lang, "fuel.brands")}</h3>
                <p className="text-xs text-slate-400 mb-2">{fuelBrands.note}</p>
                <div className="space-y-1.5">
                  {fuelBrands.brands.map((b: any) => (
                    <div key={b.name} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{b.name} <span className="text-[10px] uppercase text-slate-400">({b.type})</span></span>
                      <span className="text-xs text-slate-500">{b.carbsG} carb · {b.sodiumMg} Na</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sources && sources.length > 0 && (
              <div className="card bg-slate-50 border-slate-200">
                <h3 className="font-display font-bold text-sm mb-2 flex items-center gap-2"><BookOpen className="w-4 h-4 text-slate-500" /> Evidence (human studies)</h3>
                <ul className="text-[11px] text-slate-500 space-y-1">
                  {sources.slice(0, 5).map((s: any) => (
                    <li key={s.id}>• {s.ref} — <em>{s.population}</em></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
