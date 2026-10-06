"use client";

import { ONBOARDING_STEP, onboardingNext, onboardingResume, type OnboardingStep } from "@/lib/onboarding-flow";
import { saveReviewedProfile } from "@/lib/profile-client";
import { onboardingSectionPayload, type OnboardingSection, type SavedOnboarding } from "@/lib/onboarding-save";
import { TravelFields } from "@/components/travel-fields";
import type { TravelContext } from "@/lib/planning-setup";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Flag, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export default function OnboardPage() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStep>(ONBOARDING_STEP.welcome);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState<string | null>(null);
  const savedOnboarding = useRef<SavedOnboarding>({ profile: {}, setup: null });

  const [lang, setLang] = useState(user?.language || "es");
  const [checking, setChecking] = useState(true);
  useEffect(() => { if (user?.language) setLang(user.language); }, [user?.id, user?.language]);

  // First-timers only: an athlete who completed onboarding (or already has
  // profile essentials from another path) is bounced straight to Today —
  // the wizard never nags returning users. ?redo=1 forces it open.
  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(window.location.search).get("redo") === "1") {
      setStep(onboardingResume(new URLSearchParams(window.location.search).get("step")));
      setChecking(false);
      return;
    }
    fetch("/api/onboard", {signal:AbortSignal.timeout(15000),cache:"no-store"})
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.onboarded) router.replace("/today");
        else { try { setStep(onboardingResume(sessionStorage.getItem(`jmm_setup_step_${user.id}`))); } catch {} setChecking(false); }
      })
      .catch(() => setChecking(false));
  }, [user, router]);

  useEffect(() => { if (user?.id && !checking) { try { sessionStorage.setItem(`jmm_setup_step_${user.id}`, String(step)); } catch {} } }, [step, user?.id, checking]);

  // Profile form
  const [profile, setProfile] = useState({
    birthYear: "", sex: "", heightCm: "", weightKg: "",
    experience: "", goal: "", weeklyHours: "", lthr: "", maxHr: "", ftp: "", runPaceBase: "", swimPaceBase: "",
  });

  const [setupRevision, setSetupRevision] = useState<string | null>(null);
  const [setup, setSetup] = useState({ travel: null as TravelContext | null, coachPreference: "", adultConfirmed: false, profileConfirmed: false, goalDescription: "", baselineWeeklyMinutes: "", baselineObservedAt: "", interruptions: "unknown", restrictions: "unknown", qualifiedReview: "unknown", trainingDays: [] as number[], maxSessionMinutes: "", equipmentAccess: "", planWeeks: "", trackEvent: "", baselinePlanOptIn: false, targetGoal: null as {context?:string;contextDescription?:string;metric:string; sport:string; value?:string|number;unit?:string;targetDate?:string}|null });

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setRevision(null);
    savedOnboarding.current = { profile: {}, setup: null };
    fetch("/api/profile", {signal:AbortSignal.timeout(15000),cache:"no-store"}).then(async r => {
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not load profile");
      if (!active) return;
      savedOnboarding.current = { profile: d.profile ?? {}, setup: d.setup ?? null };
      if (d.profile) setProfile({
        birthYear: String(d.profile.birthYear ?? ""), sex: d.profile.sex ?? "",
        heightCm: String(d.profile.heightCm ?? ""), weightKg: String(d.profile.weightKg ?? ""),
        experience: d.setup?.profileConfirmed ? d.profile.experience : "", goal: d.profile.goal ?? "",
        weeklyHours: d.setup?.profileConfirmed ? String(d.profile.weeklyHours ?? "") : "",
        lthr: String(d.profile.lthr ?? ""), maxHr: String(d.profile.maxHr ?? ""), ftp: String(d.profile.ftp ?? ""), runPaceBase: String(d.profile.runPaceBase ?? ""), swimPaceBase: String(d.profile.swimPaceBase ?? ""),
      });
      if (d.setup) setSetup(current => ({...current, ...d.setup}));
      setSetupRevision(d.setupRevision ?? null);
      setRevision(d.revision);
    }).catch(e => { if (active) setError(String(e.message)); });
    return () => { active = false; };
  }, [user?.id]);

  const [providers, setProviders] = useState<any[]>([]);
  const [connectionError, setConnectionError] = useState("");
  const [imports, setImports] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  async function reviewImports() {
    setRefreshing(true); setConnectionError("");
    try {
      const [c, i] = await Promise.all([fetch("/api/connectors", {cache:"no-store", signal:AbortSignal.timeout(15000)}), fetch("/api/onboard/import-review", {cache:"no-store", signal:AbortSignal.timeout(15000)})]);
      if (!c.ok || !i.ok) throw Error("Could not refresh connections. You can continue without a device.");
      setProviders((await c.json()).providers || []); setImports((await i.json()).observations || []);
    } catch (e) { setConnectionError((e as Error).message); } finally { setRefreshing(false); }
  }
  useEffect(() => { if (user?.id) void reviewImports(); }, [user?.id]);

  // Race
  const [raceId, setRaceId] = useState<string | null>(null);
  const [race, setRace] = useState({ name: "", distance: "", date: "", location: "" });

  // Set language
  async function changeLang(l: string) {
    setLang(l);
    await fetch("/api/language", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: l }) });
    await refresh();
  }

  async function saveProfile(section: OnboardingSection) {
    setSaving(true); setError("");
    try {
      const fields = onboardingSectionPayload(section, profile, setup, savedOnboarding.current, setupRevision);
      const result = await saveReviewedProfile(fields, revision);
      savedOnboarding.current = { profile: result.profile ?? {}, setup: result.setup ?? null };
      setRevision(result.revision); setSetupRevision(result.setupRevision); return true;
    }
    catch(e) { setError((e as Error).message); return false; }
    finally { setSaving(false); }
  }

  async function saveRace() {
    if (!race.name && !race.date && !race.distance && !race.location) return true;
    if (!race.name || !race.date || !race.distance) { setError("Confirm race name, actual date and distance, or leave every event field empty."); return false; }
    setSaving(true); setError("");
    try {
      let existingId = raceId;
      if (!existingId) {
        const listed = await fetch("/api/races", {cache:"no-store",signal:AbortSignal.timeout(15000)});
        if (!listed.ok) throw Error("Could not check existing races. Retry before adding an event.");
        const matches = ((await listed.json()).races || []).filter((r: {name:string;date:string;distance:string}) => r.name.trim().toLowerCase() === race.name.trim().toLowerCase() && r.date.slice(0,10) === race.date && r.distance === race.distance);
        if (matches.length > 1) throw Error("More than one matching race exists. Review your races before editing this event.");
        existingId = matches[0]?.id ?? null;
      }
      const r = await fetch("/api/races", {method:existingId ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({...race, ...(existingId ? {id:existingId} : {}), priority:1})});
      if (!r.ok) { const d = await r.json(); throw Error(d.error || "Could not save race"); }
      const saved = await r.json(); setRaceId(saved.race.id);
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
      try { sessionStorage.removeItem(`jmm_setup_step_${user?.id}`); } catch {}
      router.push("/today");
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  const t = (en: string, esp: string) => (lang === "es" ? esp : en);

  // Step indicator
  const STEPS = [t("Welcome", "Bienvenido"), t("Devices", "Dispositivos"), t("Profile", "Perfil"), t("Zones", "Zonas"), t("Goals & race", "Objetivos y carrera"), t("Travel", "Viajes"), t("Ready", "Listo")];

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

        <nav aria-label={t("Setup steps", "Pasos de configuración")} className="flex flex-wrap gap-2 mb-5">{STEPS.map((label,index) => <button key={label} disabled={saving} aria-current={step===index ? "step" : undefined} className={`text-sm rounded-full px-3 py-2 border ${step===index ? "bg-ocean-700 text-white" : "bg-white"}`} onClick={() => {setError("");setStep(index as OnboardingStep);}}>{label}</button>)}</nav>
        <p className="text-sm text-slate-600 mb-5">{t("Every section is optional. Save keeps your edits; Skip does not save them. Return from Profile whenever you want. Personalized training waits for the information it needs.", "Cada sección es opcional. Guardar conserva los cambios; Omitir no los guarda. Vuelve desde Perfil cuando quieras. El entrenamiento personalizado espera los datos necesarios.")}</p>
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
                { icon: "📋", en: "Connect first — or continue without devices", es: "Conecta primero — o continúa sin dispositivos" },
                { icon: "⌚", en: "Review saved information and fill only what is missing", es: "Revisa datos guardados y completa solo lo que falta" },
                { icon: "🏁", en: "Review zones, goals, an optional race and travel", es: "Revisa zonas, objetivos, carrera opcional y viajes" },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-sm font-medium text-slate-700">{lang === "es" ? s.es : s.en}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(ONBOARDING_STEP.devices)} className="btn-primary w-full justify-center">
              {lang === "es" ? "Empezar" : "Get started"} <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}

        {/* Step 1: Profile */}
        <fieldset disabled={!revision || saving} aria-label={t("Editable setup sections", "Secciones de configuración editables")}>
        {step === ONBOARDING_STEP.profile && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-ocean-600" /> {lang === "es" ? "Tu perfil" : "Your profile"}
            </h2>
            <div className="card mb-4"><h3 className="font-semibold">{t("Imported observations to review", "Observaciones importadas para revisar")}</h3><p className="text-sm">{t("Review source and date before using a value. Imports do not overwrite your profile automatically.", "Revisa fuente y fecha antes de usar un valor. Las importaciones no sobrescriben tu perfil automáticamente.")}</p>{imports.length ? imports.map(o=><div className="py-2 border-b text-sm" key={o.id}>{o.metricType}: {o.value} {o.unit} · {o.source} · {new Date(o.observedAt).toLocaleDateString()}{o.metricType === "weight_kg" && <button className="underline ml-3" onClick={()=>setProfile({...profile,weightKg:String(o.value)})}>{t("Use reviewed weight", "Usar peso revisado")}</button>}</div>) : <p className="text-sm">{t("No recent usable observations imported yet. All fields remain optional.", "Aún no hay observaciones recientes utilizables. Todos los campos son opcionales.")}</p>}</div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="onboard-field-1" className="label">{lang === "es" ? "Año de nacimiento" : "Birth year"}</label><input id="onboard-field-1" className="input" type="number" placeholder="1995" value={profile.birthYear} onChange={(e) => setProfile({ ...profile, birthYear: e.target.value })} /></div>
                <div><label htmlFor="onboard-field-2" className="label">{lang === "es" ? "Sexo" : "Sex"}</label><select id="onboard-field-2" className="input" value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}>
                    <option value="">—</option><option value="male">{lang === "es" ? "Masculino" : "Male"}</option><option value="female">{lang === "es" ? "Femenino" : "Female"}</option>
                  </select>
                </div>
                <div><label htmlFor="onboard-field-3" className="label">{lang === "es" ? "Altura (cm)" : "Height (cm)"}</label><input id="onboard-field-3" className="input" type="number" placeholder="175" value={profile.heightCm} onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })} /></div>
                <div><label htmlFor="onboard-field-4" className="label">{lang === "es" ? "Peso (kg)" : "Weight (kg)"}</label><input id="onboard-field-4" className="input" type="number" step="0.1" placeholder="70" value={profile.weightKg} onChange={(e) => setProfile({ ...profile, weightKg: e.target.value })} /></div>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(ONBOARDING_STEP.devices)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={async () => { setStep(onboardingNext(ONBOARDING_STEP.profile, await saveProfile("profile"))); }} disabled={saving || !revision} className="btn-primary">
                {saving ? "…" : lang === "es" ? "Guardar perfil" : "Save profile"}
              </button>
            </div>
          </div>
        )}

        {step === ONBOARDING_STEP.devices && <section className="space-y-4">
          <h2 className="font-display text-2xl">{t("Connect first, or continue manually", "Conecta primero o continúa manualmente")}</h2>
          <p>{t("Authorize your own account. You return here after connecting; the initial import is queued in the background. A connection is not proof that every metric or watch delivery is available.", "Autoriza tu cuenta. Volverás aquí; la importación inicial se programa en segundo plano. Una conexión no confirma todos los datos ni la entrega al reloj.")}</p>
          {connectionError && <p role="alert">{connectionError}</p>}
          {providers.map(p => <div className="card flex flex-wrap items-center gap-3" key={p.id}><div className="flex-1"><h3 className="font-semibold">{p.name}</h3><p className="text-sm">{p.description}</p><p className="text-xs mt-1">{p.status} · {p.lastSyncAt ? `${t("Last import", "Última importación")}: ${new Date(p.lastSyncAt).toLocaleString()}` : t("No successful import recorded", "Sin importación registrada")}</p>{p.lastError && <p role="status" className="text-sm text-amber-800">{p.lastError}</p>}</div>
          {p.configured && p.method === "oauth" && typeof p.connectUrl === "string" && p.connectUrl.startsWith("/api/connectors/") ? <a className="btn-secondary" href={`${p.connectUrl}?return=${encodeURIComponent("/onboard?redo=1&step=devices")}`}>{t("Connect / reconnect", "Conectar / reconectar")}</a> : p.method === "upload" ? <a className="underline" href="/connectors?onboarding=1">{t("Import a file", "Importar archivo")}</a> : <span>{t("Unavailable", "No disponible")}</span>}</div>)}
          <button className="btn-secondary" disabled={refreshing} onClick={reviewImports}>{refreshing ? "…" : t("Refresh import status", "Actualizar importación")}</button>
          <button className="btn-primary ml-3" onClick={() => setStep(ONBOARDING_STEP.profile)}>{t("Continue — devices are optional", "Continuar — dispositivos opcionales")}</button>
        </section>}
        {step === ONBOARDING_STEP.zones && <section className="space-y-4">
          <h2 className="font-display text-2xl">{t("Review your training anchors", "Revisa tus referencias de entrenamiento")}</h2>
          <p>{t("Saved values are prefilled. Enter only known references; no test or device is required to continue. Unknown zones stay unknown. These entries do not verify a laboratory test or establish HYROX station ability.", "Los datos guardados aparecen aquí. Introduce solo referencias conocidas; puedes continuar sin pruebas ni dispositivos. Las zonas desconocidas siguen desconocidas. No se verifica una prueba de laboratorio ni la capacidad en estaciones HYROX.")}</p>
          {([['lthr','Threshold heart rate (bpm)','FC umbral (lpm)'],['maxHr','Measured maximum heart rate (bpm)','FC máxima medida (lpm)'],['ftp','Cycling FTP (W)','FTP ciclismo (W)'],['runPaceBase','Running threshold pace (seconds/km)','Ritmo umbral carrera (segundos/km)'],['swimPaceBase','Swimming threshold pace (seconds/100 m)','Ritmo umbral natación (segundos/100 m)']] as const).map(([field,en,esp]) => <label className="block" key={field}>{t(en,esp)}<input type="number" className="input" value={profile[field]} onChange={e=>setProfile({...profile,[field]:e.target.value})}/></label>)}
          <p className="text-sm">{t("Running power from Stryd requires a separate reviewed running-power reference; cycling FTP must not be reused. You can continue with perceived effort and reviewed pace/heart-rate guidance.", "La potencia de carrera de Stryd requiere su propia referencia revisada; no se reutiliza el FTP ciclista. Puedes continuar con esfuerzo percibido y ritmo/FC revisados.")}</p>
          <button className="btn-primary" disabled={saving || !revision} onClick={async()=>{if(await saveProfile("zones")) setStep(ONBOARDING_STEP.race);}}>{t("Save and continue", "Guardar y continuar")}</button>
        </section>}
        {/* Step 3: Goal race */}
        {step === ONBOARDING_STEP.race && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <Flag className="w-5 h-5 text-coral-500" /> {lang === "es" ? "Objetivos y carrera opcional" : "Goals and optional race"}
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              {lang === "es" ? "Completa solo lo que conoces. Puedes guardar el perfil sin añadir una carrera." : "Fill only what you know. You can save your goals without adding a race."}
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="onboard-field-5" className="label">{lang === "es" ? "Experiencia" : "Experience"}</label><select id="onboard-field-5" className="input" value={profile.experience} onChange={(e) => setProfile({ ...profile, experience: e.target.value })}>
                    <option value="">{t("Choose experience", "Elige experiencia")}</option>
                    <option value="beginner">{lang === "es" ? "Principiante" : "Beginner"}</option>
                    <option value="amateur">{lang === "es" ? "Amateur" : "Amateur"}</option>
                    <option value="advanced">{lang === "es" ? "Avanzado" : "Advanced"}</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div><label htmlFor="onboard-field-6" className="label">{lang === "es" ? "Horas/semana" : "Weekly hours"}</label><input id="onboard-field-6" className="input" type="number" value={profile.weeklyHours} onChange={(e) => setProfile({ ...profile, weeklyHours: e.target.value })} /></div>
              </div>
              <div><label htmlFor="onboard-field-7" className="label">{lang === "es" ? "Objetivo" : "Goal"}</label><select id="onboard-field-7" className="input" value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })}>
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
            <details className="mt-5"><summary className="cursor-pointer font-semibold">{t("Optional planning details — complete when ready to build a plan", "Detalles opcionales — completa cuando quieras crear un plan")}</summary><fieldset className="mt-6 space-y-3 border rounded-xl p-4">
              <legend className="font-semibold">{t("Training context and pilot eligibility", "Contexto y elegibilidad del piloto")}</legend>
              <p className="text-sm text-slate-600">{t("Unknown answers stay unknown. A device and performance tests are optional. Individual planning waits for relevant setup and a confirmed preview.", "Las respuestas desconocidas siguen sin conocerse. Dispositivos y pruebas son opcionales. El plan espera los datos relevantes y una vista previa confirmada.")}</p>
              <label className="flex gap-2"><input type="checkbox" checked={setup.adultConfirmed} onChange={e => setSetup({...setup, adultConfirmed:e.target.checked})}/>{t("I confirm I am 18 or older", "Confirmo que tengo 18 años o más")}</label>
              <label className="flex gap-2"><input type="checkbox" checked={setup.profileConfirmed} onChange={e => setSetup({...setup, profileConfirmed:e.target.checked})}/>{t("I confirm my experience and available weekly time above", "Confirmo mi experiencia y el tiempo semanal disponible indicado")}</label>
              <label className="block">{t("Goal in your words: fitness, completion or performance", "Objetivo: bienestar, terminar o rendimiento")}<textarea className="input" value={setup.goalDescription} onChange={e => setSetup({...setup,goalDescription:e.target.value})}/></label>
              <label className="block">{t("Optional structured target (a goal, not current ability)", "Objetivo estructurado opcional (meta, no capacidad actual)")}<select className="input" value={setup.targetGoal?.metric ?? ""} onChange={e=>setSetup({...setup,baselinePlanOptIn:false,targetGoal:e.target.value?{metric:e.target.value,sport:""}:null})}><option value="">{t("No structured target yet", "Sin objetivo estructurado todavía")}</option><option value="fitness">{t("General fitness", "Bienestar físico general")}</option><option value="completion">{t("Completion", "Terminar")}</option><option value="pace">{t("Target pace", "Ritmo objetivo")}</option><option value="power">{t("Target power / FTP", "Potencia / FTP objetivo")}</option><option value="speed">{t("Target speed", "Velocidad objetivo")}</option></select></label>
              {setup.targetGoal && <div className="space-y-2 border p-3 rounded-lg">
                <label className="block">{t("Target sport", "Deporte del objetivo")}<select className="input" value={setup.targetGoal.sport} onChange={e=>setSetup({...setup,baselinePlanOptIn:false,targetGoal:{...setup.targetGoal!,sport:e.target.value,context:undefined,contextDescription:undefined}})}><option value="">{t("Choose sport", "Elige deporte")}</option>{["run","bike","swim","strength","mobility","recovery","brick","hyrox","boxing"].map(sport=><option key={sport} value={sport}>{sport}</option>)}</select></label>
                {["pace","power","speed"].includes(setup.targetGoal.metric) && <>
                  <label className="block">{t("Target value", "Valor objetivo")}<input className="input" type="number" step="any" value={setup.targetGoal.value ?? ""} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,value:e.target.value}})}/></label>
                  <label className="block">{t("Units (pace in seconds)", "Unidades (ritmo en segundos)")}<select className="input" value={setup.targetGoal.unit ?? ""} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,unit:e.target.value}})}><option value="">{t("Choose units", "Elige unidades")}</option>{(setup.targetGoal.metric==="pace"?["sec/km","sec/100m"]:setup.targetGoal.metric==="power"?["W"]:["km/h"]).map(unit=><option key={unit} value={unit}>{unit}</option>)}</select></label>
                </>}
                {["pace","power","speed"].includes(setup.targetGoal.metric) && <>
                  <label className="block">{t("Comparison context", "Contexto para comparar")}<select className="input" value={setup.targetGoal.context ?? ""} onChange={e=>setSetup({...setup,baselinePlanOptIn:false,targetGoal:{...setup.targetGoal!,context:e.target.value,contextDescription:undefined}})}>
                    <option value="">{t("Unknown; do not compare unlike results", "Desconocido; no comparar resultados diferentes")}</option>
                    {setup.targetGoal.sport==="run" && ["pace","speed"].includes(setup.targetGoal.metric) && <option value="run5k">{t("5 km average", "Promedio en 5 km")}</option>}
                    {setup.targetGoal.sport==="bike" && setup.targetGoal.metric==="power" && <option value="ftp">{t("Cycling FTP test", "Prueba de FTP en bicicleta")}</option>}
                    {setup.targetGoal.sport==="swim" && ["pace","speed"].includes(setup.targetGoal.metric) && <option value="swim_threshold">{t("Swim threshold / CSS", "Umbral de natación / CSS")}</option>}
                    <option value="custom">{t("Another explicitly described context", "Otro contexto descrito explícitamente")}</option>
                  </select></label>
                  {setup.targetGoal.context==="custom" && <label className="block">{t("Distance, duration, conditions and measurement method", "Distancia, duración, condiciones y método de medición")}<textarea className="input" maxLength={500} value={setup.targetGoal.contextDescription ?? ""} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,contextDescription:e.target.value}})}/></label>}
                  <label className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={setup.baselinePlanOptIn===true} onChange={e=>setSetup({...setup,baselinePlanOptIn:e.target.checked})}/><span>{t("I choose a conservative baseline-only plan using my recent tolerated training. Keep my target as an aspiration. This plan is not optimized or promised to reach the target; target-driven progression needs coaching review. All safety and setup requirements still apply.", "Elijo un plan conservador basado solo en mi entrenamiento reciente tolerado. Mi objetivo sigue siendo una aspiración. El plan no está optimizado ni promete alcanzarlo; la progresión dirigida a la meta requiere revisión profesional. Siguen vigentes los requisitos de seguridad y configuración.")}</span></label>
                </>}
                <label className="block">{t("Optional target date", "Fecha objetivo opcional")}<input className="input" type="date" value={setup.targetGoal.targetDate ?? ""} onChange={e=>setSetup({...setup,targetGoal:{...setup.targetGoal!,targetDate:e.target.value}})}/></label>
                <p className="text-sm">{t("This target never replaces a measured baseline. Exact pace/power/speed progression is unavailable in this pilot and requires coaching review. You may explicitly choose a conservative baseline-only plan while keeping your target as an aspiration.", "Esta meta nunca sustituye una referencia medida. La progresión exacta de ritmo/potencia/velocidad no está disponible en este piloto y requiere revisión profesional. Puedes elegir explícitamente un plan conservador basado en tu nivel actual y conservar tu objetivo como aspiración.")}</p>
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
            </details>
            <label className="block mt-4">{t("Your coach, if any (optional)", "Tu entrenador, si tienes (opcional)")}<input className="input" value={setup.coachPreference ?? ""} maxLength={200} onChange={e=>setSetup({...setup,coachPreference:e.target.value})}/></label><p className="text-xs">{t("This is a preference, not an access grant. Coach access requires an administrator assignment.", "Es una preferencia, no concede acceso. Un administrador debe asignar al entrenador.")}</p>
            <h3 className="font-semibold mt-5">{t("Optional race", "Carrera opcional")}</h3>{raceId && <p role="status">{t("Race saved; further edits update this same event.", "Carrera guardada; los cambios actualizan este evento.")}</p>}
            <div className="space-y-3">
              <div><label htmlFor="onboard-field-8" className="label">{lang === "es" ? "Nombre de la carrera" : "Race name"}</label><input id="onboard-field-8" className="input" placeholder="Miami 70.3" value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="onboard-field-9" className="label">{lang === "es" ? "Distancia" : "Distance"}</label><select id="onboard-field-9" className="input" onChange={(e) => setRace({ ...race, distance: e.target.value })} value={race.distance}>
                    <option value="">{t("Choose actual distance", "Elige la distancia real")}</option><option value="sprint">Sprint</option><option value="olympic">Olympic</option><option value="half">Half Ironman</option><option value="full">Full Ironman</option><option value="hyrox">HYROX</option><option value="10k">10K</option>
                  </select>
                </div>
                <div><label htmlFor="onboard-field-10" className="label">{lang === "es" ? "Fecha" : "Date"}</label><input id="onboard-field-10" className="input" type="date" value={race.date} onChange={(e) => setRace({ ...race, date: e.target.value })} /></div>
              </div>
              <div><label htmlFor="onboard-field-11" className="label">{lang === "es" ? "Ubicación" : "Location"}</label><input id="onboard-field-11" className="input" placeholder="Miami, FL" value={race.location} onChange={(e) => setRace({ ...race, location: e.target.value })} /></div>
            </div>
            <button className="btn-secondary mt-4" disabled={saving} onClick={async()=>{if(await saveRace()) setError("");}}>{raceId ? t("Update this race", "Actualizar carrera") : t("Save race separately", "Guardar carrera por separado")}</button>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(ONBOARDING_STEP.zones)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={async () => { setStep(onboardingNext(ONBOARDING_STEP.race, await saveProfile("goals"))); }} disabled={saving} className="btn-primary">
                {saving ? "…" : lang === "es" ? "Guardar objetivos (carrera por separado)" : "Save goals (race saved separately)"}
              </button>
            </div>
          </div>
        )}

        {step === ONBOARDING_STEP.travel && <section className="space-y-4"><h2 className="font-display text-2xl">{t("Travel and availability", "Viajes y disponibilidad")}</h2><TravelFields value={setup.travel} onChange={travel=>setSetup({...setup,travel})} es={lang === "es"}/><button className="btn-primary" disabled={saving || !revision} onClick={async()=>{if(await saveProfile("travel")) setStep(ONBOARDING_STEP.done);}}>{t("Save and continue", "Guardar y continuar")}</button></section>}
        </fieldset>
        {/* Step 4: Done */}
        {step === ONBOARDING_STEP.done && (
          <div className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h2 className="font-display text-3xl font-bold mb-2">{lang === "es" ? "Tu espacio está listo" : "Your workspace is ready"}</h2>
            <p className="text-lg text-slate-600 mb-6">
              {lang === "es"
                ? "Puedes guardar datos incompletos. Antes de asignar entrenamiento, completa lo necesario y confirma la vista previa del plan."
                : "You can save incomplete setup. Before training is assigned, complete the needed inputs and confirm a plan preview."}
            </p>
            <button onClick={finishOnboarding} disabled={saving} className="btn-primary w-full justify-center text-lg">
              {lang === "es" ? "Abrir Hoy" : "Open Today"} <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-4 mt-6 border-t pt-4"><button disabled={saving} className="underline" onClick={()=>{setError("");setStep(onboardingNext(step));}}>{t("Skip this section for now", "Omitir esta sección por ahora")}</button><button disabled={saving} className="underline" onClick={finishOnboarding}>{t("Enter the app with saved details", "Entrar a la app con lo guardado")}</button></div>
        {/* Navigation: language switcher */}
        <div className="fixed bottom-4 right-4 z-50">
          <select aria-label={t("Setup language", "Idioma de configuración")} className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 shadow" value={lang} onChange={(e) => changeLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>
    </ProtectedPage>
  );
}
