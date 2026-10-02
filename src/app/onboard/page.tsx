"use client";

import { ONBOARDING_STEP, onboardingNext, type OnboardingStep } from "@/lib/onboarding-flow";
import { saveReviewedProfile, onboardingProfileFields } from "@/lib/profile-client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Watch, Flag, CheckCircle2, ArrowRight, ArrowLeft, Globe } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export default function OnboardPage() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const es = user?.language === "es";
  const [step, setStep] = useState<OnboardingStep>(ONBOARDING_STEP.welcome);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState<string | null>(null);

  const [lang, setLang] = useState(user?.language || "es");
  const [checking, setChecking] = useState(true);
  useEffect(() => { if (user?.language) setLang(user.language); }, [user?.id, user?.language]);

  // First-timers only: an athlete who completed onboarding (or already has
  // profile essentials from another path) is bounced straight to Today —
  // the wizard never nags returning users. ?redo=1 forces it open.
  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(window.location.search).get("redo") === "1") {
      setChecking(false);
      return;
    }
    fetch("/api/onboard")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.onboarded && d.profileComplete) router.replace("/today");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [user, router]);

  // Profile form
  const [profile, setProfile] = useState({
    birthYear: "", sex: "", heightCm: "", weightKg: "",
    experience: "", goal: "", weeklyHours: "",
  });

  const [setupRevision, setSetupRevision] = useState<string | null>(null);
  const [setup, setSetup] = useState({ adultConfirmed: false, profileConfirmed: false, goalDescription: "", baselineWeeklyMinutes: "", baselineObservedAt: "", interruptions: "unknown", restrictions: "unknown", qualifiedReview: "unknown", trainingDays: [] as number[], maxSessionMinutes: "", equipmentAccess: "", planWeeks: "", trackEvent: "", targetGoal: null as {metric:string; sport:string; value?:string|number;unit?:string;targetDate?:string}|null });

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setRevision(null);
    fetch("/api/profile").then(async r => {
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not load profile");
      if (!active) return;
      if (d.profile) setProfile({
        birthYear: String(d.profile.birthYear ?? ""), sex: d.profile.sex ?? "",
        heightCm: String(d.profile.heightCm ?? ""), weightKg: String(d.profile.weightKg ?? ""),
        experience: d.setup?.profileConfirmed ? d.profile.experience : "", goal: d.profile.goal ?? "",
        weeklyHours: d.setup?.profileConfirmed ? String(d.profile.weeklyHours ?? "") : "",
      });
      if (d.setup) setSetup(d.setup);
      setSetupRevision(d.setupRevision ?? null);
      setRevision(d.revision);
    }).catch(e => { if (active) setError(String(e.message)); });
    return () => { active = false; };
  }, [user?.id]);

  // Race
  const [race, setRace] = useState({ name: "", distance: "", date: "", location: "" });

  // Set language
  async function changeLang(l: string) {
    setLang(l);
    await fetch("/api/language", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: l }) });
    await refresh();
  }

  async function saveProfile() {
    setSaving(true); setError("");
    try { const result = await saveReviewedProfile({...onboardingProfileFields(profile), setup, expectedSetupRevision: setupRevision}, revision); setRevision(result.revision); setSetupRevision(result.setupRevision); return true; }
    catch(e) { setError((e as Error).message); return false; }
    finally { setSaving(false); }
  }

  async function saveRace() {
    if (!race.name && !race.date && !race.distance && !race.location) return true;
    if (!race.name || !race.date || !race.distance) { setError("Confirm race name, actual date and distance, or leave every event field empty."); return false; }
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/races", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...race, priority:1})});
      if (!r.ok) { const d = await r.json(); throw Error(d.error || "Could not save race"); }
      return true;
    } catch(e) { setError((e as Error).message); return false; }
    finally { setSaving(false); }
  }

  async function finishOnboarding() {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (!r.ok) throw Error("Could not finish onboarding. Please retry.");
      router.push("/training");
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  const t = (en: string, esp: string) => (lang === "es" ? esp : en);

  // Step indicator
  const STEPS = [t("Welcome", "Bienvenido"), t("Profile", "Perfil"), t("Devices", "Dispositivos"), t("Goal Race", "Carrera objetivo"), t("Done", "Listo")];

  if (checking) {
    return (
      <ProtectedPage>
        <div className="max-w-2xl mx-auto py-16 px-4 text-center">
          <div className="w-10 h-10 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      <div className="max-w-2xl mx-auto py-8 px-4">
        {error && <div role="alert" className="mb-4 text-red-700">{error} <button type="button" className="underline" onClick={() => window.location.reload()}>Reload and review</button></div>}
        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-ocean-600" : "bg-slate-200"}`} />
          ))}
        </div>

        {/* Step 0: Language + Welcome */}
        {step === ONBOARDING_STEP.welcome && (
          <div className="text-center py-8">
            <h1 className="font-display text-4xl font-bold mb-2">
              {lang === "es" ? "Bienvenido a JMMai" : "Welcome to JMMai"}
            </h1>
            <p className="text-lg text-slate-600 mb-6">
              {lang === "es"
                ? "Tu entrenador personal basado en ciencia y biometría. Vamos a configurar tu perfil de entrenamiento."
                : "Your personal coach powered by science and biometrics. Let's set up your coaching profile."}
            </p>
            <div className="text-left space-y-3 mb-6">
              {[
                { icon: "📋", en: "Set your profile — age, goals, experience", es: "Configura tu perfil — edad, metas, experiencia" },
                { icon: "⌚", en: "Review available connections or continue without a device", es: "Revisa las conexiones disponibles o continúa sin dispositivo" },
                { icon: "🏁", en: "Add your goal race — we'll build the plan", es: "Añade tu carrera objetivo — creamos el plan" },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-sm font-medium text-slate-700">{lang === "es" ? s.es : s.en}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(ONBOARDING_STEP.profile)} className="btn-primary w-full justify-center">
              {lang === "es" ? "Empezar" : "Get started"} <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}

        {/* Step 1: Profile */}
        {step === ONBOARDING_STEP.profile && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-ocean-600" /> {lang === "es" ? "Tu perfil" : "Your profile"}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{lang === "es" ? "Año de nacimiento" : "Birth year"}</label><input className="input" type="number" placeholder="1995" value={profile.birthYear} onChange={(e) => setProfile({ ...profile, birthYear: e.target.value })} /></div>
                <div><label className="label">{lang === "es" ? "Sexo" : "Sex"}</label>
                  <select className="input" value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}>
                    <option value="">—</option><option value="male">{lang === "es" ? "Masculino" : "Male"}</option><option value="female">{lang === "es" ? "Femenino" : "Female"}</option>
                  </select>
                </div>
                <div><label className="label">{lang === "es" ? "Altura (cm)" : "Height (cm)"}</label><input className="input" type="number" placeholder="175" value={profile.heightCm} onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })} /></div>
                <div><label className="label">{lang === "es" ? "Peso (kg)" : "Weight (kg)"}</label><input className="input" type="number" step="0.1" placeholder="70" value={profile.weightKg} onChange={(e) => setProfile({ ...profile, weightKg: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{lang === "es" ? "Experiencia" : "Experience"}</label>
                  <select className="input" value={profile.experience} onChange={(e) => setProfile({ ...profile, experience: e.target.value })}>
                    <option value="">{t("Choose experience", "Elige experiencia")}</option>
                    <option value="beginner">{lang === "es" ? "Principiante" : "Beginner"}</option>
                    <option value="amateur">{lang === "es" ? "Amateur" : "Amateur"}</option>
                    <option value="advanced">{lang === "es" ? "Avanzado" : "Advanced"}</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div><label className="label">{lang === "es" ? "Horas/semana" : "Weekly hours"}</label><input className="input" type="number" value={profile.weeklyHours} onChange={(e) => setProfile({ ...profile, weeklyHours: e.target.value })} /></div>
              </div>
              <div><label className="label">{lang === "es" ? "Objetivo" : "Goal"}</label>
                <select className="input" value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })}>
                  <option value="">{t("Choose a goal", "Elige un objetivo")}</option>
                  <option value="sprint">Sprint</option>
                  <option value="olympic">Olympic</option>
                  <option value="half">Half Ironman</option>
                  <option value="full">Full Ironman</option>
                  <option value="hyrox">HYROX</option>
                  <option value="cycle">{lang === "es" ? "Ciclismo" : "Cycling"}</option>
                  <option value="run-only">{lang === "es" ? "Correr" : "Running"}</option>
                  <option value="track-sprint">Track Sprint (100-400m)</option>
                  <option value="swim-only">{t("Swimming", "Natación")}</option>
                  <option value="lifting">{t("Strength", "Fuerza")}</option>
                  <option value="boxing">{t("Boxing", "Boxeo")}</option>
                </select>
              </div>
            </div>
            <fieldset className="mt-6 space-y-3 border rounded-xl p-4">
              <legend className="font-semibold">{t("Training context and pilot eligibility", "Contexto y elegibilidad del piloto")}</legend>
              <p className="text-sm text-slate-600">{t("Unknown answers stay unknown. A device and performance tests are optional. Individual planning waits for relevant setup and a confirmed preview.", "Las respuestas desconocidas siguen sin conocerse. Dispositivos y pruebas son opcionales. El plan espera los datos relevantes y una vista previa confirmada.")}</p>
              <label className="flex gap-2"><input type="checkbox" checked={setup.adultConfirmed} onChange={e => setSetup({...setup, adultConfirmed:e.target.checked})}/>{t("I confirm I am 18 or older", "Confirmo que tengo 18 años o más")}</label>
              <label className="flex gap-2"><input type="checkbox" checked={setup.profileConfirmed} onChange={e => setSetup({...setup, profileConfirmed:e.target.checked})}/>{t("I confirm my experience and available weekly time above", "Confirmo mi experiencia y el tiempo semanal disponible indicado")}</label>
              <label className="block">{t("Goal in your words: fitness, completion or performance", "Objetivo: bienestar, terminar o rendimiento")}<textarea className="input" value={setup.goalDescription} onChange={e => setSetup({...setup,goalDescription:e.target.value})}/></label>
              <label className="block">{t("Optional structured target (a goal, not current ability)", "Objetivo estructurado opcional (meta, no capacidad actual)")}<select className="input" value={setup.targetGoal?.metric ?? ""} onChange={e=>setSetup({...setup,targetGoal:e.target.value?{metric:e.target.value,sport:""}:null})}><option value="">{t("No structured target yet", "Sin objetivo estructurado todavía")}</option><option value="fitness">{t("General fitness", "Bienestar físico general")}</option><option value="completion">{t("Completion", "Terminar")}</option><option value="pace">{t("Target pace", "Ritmo objetivo")}</option><option value="power">{t("Target power / FTP", "Potencia / FTP objetivo")}</option><option value="speed">{t("Target speed", "Velocidad objetivo")}</option></select></label>
              {setup.targetGoal && <div className="space-y-2 border p-3 rounded-lg">
                <label className="block">{t("Target sport", "Deporte del objetivo")}<select className="input" value={setup.targetGoal.sport} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,sport:e.target.value}})}><option value="">{t("Choose sport", "Elige deporte")}</option>{["run","bike","swim","strength","mobility","recovery","brick","hyrox","boxing"].map(sport=><option key={sport} value={sport}>{sport}</option>)}</select></label>
                {["pace","power","speed"].includes(setup.targetGoal.metric) && <>
                  <label className="block">{t("Target value", "Valor objetivo")}<input className="input" type="number" step="any" value={setup.targetGoal.value ?? ""} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,value:e.target.value}})}/></label>
                  <label className="block">{t("Units (pace in seconds)", "Unidades (ritmo en segundos)")}<select className="input" value={setup.targetGoal.unit ?? ""} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,unit:e.target.value}})}><option value="">{t("Choose units", "Elige unidades")}</option>{(setup.targetGoal.metric==="pace"?["sec/km","sec/100m"]:setup.targetGoal.metric==="power"?["W"]:["km/h"]).map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></label>
                </>}
                <label className="block">{t("Optional target date", "Fecha objetivo opcional")}<input className="input" type="date" value={setup.targetGoal.targetDate ?? ""} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,targetDate:e.target.value}})}/></label>
                <p className="text-sm">{t("This target never replaces a measured baseline. Exact pace/power/speed progression is unavailable in this pilot and requires coaching review; fitness/completion goals can use conservative automatic planning.", "Esta meta nunca sustituye una referencia medida. La progresión exacta de ritmo/potencia/velocidad no está disponible en este piloto y requiere revisión de un entrenador; las metas de bienestar/terminar permiten planes automáticos conservadores.")}</p>
              </div>}
              <label className="block">{t("Recently tolerated training, total minutes per week", "Entrenamiento reciente tolerado, minutos totales por semana")}<input className="input" type="number" min="0" max="2400" value={setup.baselineWeeklyMinutes ?? ""} onChange={e=>setSetup({...setup,baselineWeeklyMinutes:e.target.value})}/></label>
              <label className="block">{t("Date this training history was observed", "Fecha de ese historial de entrenamiento")}<input className="input" type="date" value={setup.baselineObservedAt ?? ""} onChange={e=>setSetup({...setup,baselineObservedAt:e.target.value})}/></label>
              <label className="block">{t("Recent interruption or return after time off?", "¿Interrupción reciente o vuelta tras una pausa?")}<select className="input" value={setup.interruptions} onChange={e=>setSetup({...setup,interruptions:e.target.value})}><option value="unknown">{t("Unknown / not answered", "Desconocido / sin responder")}</option><option value="none">{t("No interruption", "Sin interrupción")}</option><option value="yes">{t("Yes, review starting load", "Sí, revisar la carga inicial")}</option></select></label>
              <label className="block">{t("Current symptoms, injury or restrictions?", "¿Síntomas, lesión o restricciones actuales?")}<select className="input" value={setup.restrictions} onChange={e=>setSetup({...setup,restrictions:e.target.value})}><option value="unknown">{t("Unknown / not answered", "Desconocido / sin responder")}</option><option value="none">{t("None reported", "No tengo")}</option><option value="present">{t("Present, qualified review needed", "Sí, requiere revisión profesional")}</option></select></label>
              <label className="block">{t("Pregnancy/postpartum, significant medical restrictions or another circumstance needing professional guidance?", "¿Embarazo/posparto, restricciones médicas importantes u otra circunstancia que requiere orientación profesional?")}<select className="input" value={setup.qualifiedReview} onChange={e=>setSetup({...setup,qualifiedReview:e.target.value})}><option value="unknown">{t("Unknown / prefer not to answer", "Desconocido / prefiero no responder")}</option><option value="none_needed">{t("None reported", "No tengo")}</option><option value="required">{t("Yes, qualified review needed", "Sí, requiere revisión profesional")}</option></select></label>
              <fieldset><legend>{t("Usual available days", "Días habituales disponibles")}</legend><div className="flex flex-wrap gap-3">{[t("Sun","Dom"),t("Mon","Lun"),t("Tue","Mar"),t("Wed","Mié"),t("Thu","Jue"),t("Fri","Vie"),t("Sat","Sáb")].map((day,index)=><label key={day}><input type="checkbox" checked={setup.trainingDays.includes(index)} onChange={e=>setSetup({...setup,trainingDays:e.target.checked?[...setup.trainingDays,index].sort():setup.trainingDays.filter(d=>d!==index)})}/> {day}</label>)}</div></fieldset>
              <label className="block">{t("Maximum total training minutes per day", "Máximo de minutos totales de entrenamiento por día")}<input className="input" type="number" min="10" max="300" value={setup.maxSessionMinutes ?? ""} onChange={e=>setSetup({...setup,maxSessionMinutes:e.target.value})}/></label>
              <label className="block">{t("Equipment and venue access (including none)", "Equipo y lugares disponibles (incluye ninguno)")}<textarea className="input" value={setup.equipmentAccess} onChange={e=>setSetup({...setup,equipmentAccess:e.target.value})}/></label>
              {profile.goal === "track-sprint" && <label className="block">{t("Actual track event", "Prueba de pista real")}<select className="input" value={setup.trackEvent ?? ""} onChange={e=>setSetup({...setup,trackEvent:e.target.value})}><option value="">{t("Choose event", "Elige prueba")}</option><option value="100m">100 m</option><option value="200m">200 m</option><option value="400m">400 m</option></select></label>}
              <label className="block">{t("Planning horizon, weeks (no event date is invented)", "Horizonte del plan, semanas (no se inventa una fecha de carrera)")}<input className="input" type="number" min="4" max="30" value={setup.planWeeks ?? ""} onChange={e=>setSetup({...setup,planWeeks:e.target.value})}/></label>
              <p className="text-sm">{t("Unsupported circumstances pause automated planning for qualified review; this form does not provide medical clearance. If you report no recent tolerated training, ask a qualified coach for an appropriate starting load.", "Las circunstancias no admitidas pausan el plan para revisión profesional; este formulario no da autorización médica. Sin entrenamiento reciente tolerado, pide a un entrenador cualificado una carga inicial adecuada.")}</p>
            </fieldset>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(ONBOARDING_STEP.welcome)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={async () => { setStep(onboardingNext(ONBOARDING_STEP.profile, await saveProfile())); }} disabled={saving || !revision} className="btn-primary">
                {saving ? "…" : lang === "es" ? "Guardar perfil" : "Save profile"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Devices */}
        {step === ONBOARDING_STEP.devices && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <Watch className="w-5 h-5 text-ocean-600" /> {lang === "es" ? "Conecta tus dispositivos" : "Connect your devices"}
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              {lang === "es"
                ? "La sincronización programada requiere una conexión autorizada y un servidor configurado. Verifica estado y fechas en Conectores; también puedes continuar sin dispositivo."
                : "Scheduled synchronization requires an authorized connection and configured server. Check status and timestamps in Connectors; you can also continue without a device."}
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">⌚</span>
                <div className="flex-1"><div className="font-semibold text-sm">Whoop</div><div className="text-xs text-slate-500">{lang === "es" ? "VFC, recuperación, sueño, entrenamientos" : "HRV, recovery, sleep, workouts"}</div></div>
                <Watch className="w-4 h-4 text-slate-300" />
              </div>
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">⌚</span>
                <div className="flex-1"><div className="font-semibold text-sm">Garmin / COROS</div><div className="text-xs text-slate-500">{lang === "es" ? "Garmin: importa Activities.csv o TCX. Garmin/COROS: conexión directa aún no disponible." : "Garmin: import Activities.csv or TCX. Garmin/COROS: direct connection not available yet."}</div></div>
                <Watch className="w-4 h-4 text-slate-300" />
              </div>
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">💍</span>
                <div className="flex-1"><div className="font-semibold text-sm">Oura Ring</div><div className="text-xs text-slate-500">{lang === "es" ? "Sueño, VFC, recuperación" : "Sleep, HRV, recovery"}</div></div>
                <Watch className="w-4 h-4 text-slate-300" />
              </div>
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">🍏</span>
                <div className="flex-1"><div className="font-semibold text-sm">Apple Health</div><div className="text-xs text-slate-500">{lang === "es" ? "Importa export.xml desde la exportación de Apple Health" : "Import export.xml from your Apple Health export"}</div></div>
                <Watch className="w-4 h-4 text-slate-300" />
              </div>
            </div>
            <a href="/connectors" target="_blank" rel="noopener noreferrer" className="underline text-sm">{lang === "es" ? "Abrir Conectores en otra pestaña" : "Open Connectors in another tab"}</a>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(ONBOARDING_STEP.profile)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={() => setStep(ONBOARDING_STEP.race)} className="btn-primary">{lang === "es" ? "Siguiente" : "Next"} <ArrowRight className="w-4 h-4 ml-1" /></button>
            </div>
          </div>
        )}

        {/* Step 3: Goal race */}
        {step === ONBOARDING_STEP.race && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <Flag className="w-5 h-5 text-coral-500" /> {lang === "es" ? "Tu carrera objetivo" : "Your goal race"}
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              {lang === "es" ? "Añade tu carrera principal y crearemos el plan de entrenamiento hacia esa fecha." : "Add your goal race and we'll build the training plan toward that date."}
            </p>
            <div className="space-y-3">
              <div><label className="label">{lang === "es" ? "Nombre de la carrera" : "Race name"}</label><input className="input" placeholder="Miami 70.3" onChange={(e) => setRace({ ...race, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{lang === "es" ? "Distancia" : "Distance"}</label>
                  <select className="input" onChange={(e) => setRace({ ...race, distance: e.target.value })} value={race.distance}>
                    <option value="">{t("Choose actual distance", "Elige la distancia real")}</option><option value="sprint">Sprint</option><option value="olympic">Olympic</option><option value="half">Half Ironman</option><option value="full">Full Ironman</option><option value="hyrox">HYROX</option><option value="10k">10K</option>
                  </select>
                </div>
                <div><label className="label">{lang === "es" ? "Fecha" : "Date"}</label><input className="input" type="date" onChange={(e) => setRace({ ...race, date: e.target.value })} /></div>
              </div>
              <div><label className="label">{lang === "es" ? "Ubicación" : "Location"}</label><input className="input" placeholder="Miami, FL" onChange={(e) => setRace({ ...race, location: e.target.value })} /></div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(ONBOARDING_STEP.devices)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={async () => { setStep(onboardingNext(ONBOARDING_STEP.race, await saveRace())); }} disabled={saving} className="btn-primary">
                {saving ? "…" : lang === "es" ? "Guardar carrera" : "Save race"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === ONBOARDING_STEP.done && (
          <div className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h2 className="font-display text-3xl font-bold mb-2">{lang === "es" ? "Revisa tu plan" : "Review your plan"}</h2>
            <p className="text-lg text-slate-600 mb-6">
              {lang === "es"
                ? "Puedes guardar datos incompletos. Antes de asignar entrenamiento, completa lo necesario y confirma la vista previa del plan."
                : "You can save incomplete setup. Before training is assigned, complete the needed inputs and confirm a plan preview."}
            </p>
            <button onClick={finishOnboarding} disabled={saving} className="btn-primary w-full justify-center text-lg">
              {lang === "es" ? "Revisar plan" : "Review plan"} <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}

        {/* Navigation: language switcher */}
        <div className="fixed bottom-4 right-4 z-50">
          <select className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 shadow" value={lang} onChange={(e) => changeLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>
    </ProtectedPage>
  );
}
