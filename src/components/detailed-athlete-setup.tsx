"use client";

import { ONBOARDING_STEP, onboardingNext, onboardingResume, type OnboardingStep } from "@/lib/onboarding-flow";
import { saveReviewedProfile } from "@/lib/profile-client";
import { onboardingSectionPayload, type OnboardingSection, type SavedOnboarding } from "@/lib/onboarding-save";
import { DoubleDayFields } from "@/components/double-day-fields";
import { TravelFields } from "@/components/travel-fields";
import { PLANNABLE_GOALS, planningGoal } from "@/lib/planning-setup";
import { dateKey } from "@/lib/dates";
import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_PROFILE, EMPTY_SETUP, EMPTY_RACE, hydrateOnboarding, onboardingDraftKey, restoreOnboardingDraft, type RaceForm } from "@/lib/onboarding-form";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { User, Flag, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

type Provider = { id: string; name: string; description: string; configured: boolean; method: string; connectUrl?: string; status: string; lastSyncAt?: string | null; lastError?: string | null };
type ImportReview = {
  observations?: { id: string; metricType: string; value: number; unit: string; source: string; observedAt: string }[];
  suggestions?: { observationId: string; field: "weightKg"; value: number; unit: string; source: string; observedAt: string; kind: string }[];
  history?: { count: number; earliestAt: string | null; latestAt: string | null; sports: { sport: string; count: number }[] };
};
type SavedRace = RaceForm & { id: string; priority?: number };

export function DetailedAthleteSetup() {
  const { user, refresh } = useAuth();
  const router = useRouter();
  const query = useSearchParams();
  const returnToTraining = query.get("return") === "training";
  const requestedStep = query.get("step");
  const requestedGoal = query.get("goal");
  const requestedWeeks = query.get("weeks");
  const redo = query.get("redo") === "1";
  const [savedReadiness, setSavedReadiness] = useState<{ready:boolean;missing:string[];review:string[]}|null>(null);
  const [step, setStep] = useState<OnboardingStep>(ONBOARDING_STEP.devices);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const completedRef = useRef(false);
  const loadedUserId = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draftStorageError, setDraftStorageError] = useState(false);
  const [reviewedWeightId, setReviewedWeightId] = useState<string|null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [setupRevision, setSetupRevision] = useState<string | null>(null);
  const savedOnboarding = useRef<SavedOnboarding>({ profile: {}, setup: null });
  const [profile, setProfile] = useState({...EMPTY_PROFILE});
  const [setup, setSetup] = useState({...EMPTY_SETUP});
  const [lang, setLang] = useState(user?.language || "es");
  const [checking, setChecking] = useState(true);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [race, setRace] = useState<RaceForm>({...EMPTY_RACE});
  const [races, setRaces] = useState<SavedRace[]>([]);
  const [raceLoadError, setRaceLoadError] = useState(false);
  const t = (en: string, esp: string) => (lang === "es" ? esp : en);
  useEffect(() => { if (user?.language) setLang(user.language); }, [user?.id, user?.language]);

  useEffect(() => {
    if (!user?.id || completedRef.current) return;
    loadedUserId.current = null;
    if (user.onboarded === true && !redo && !returnToTraining) { router.replace("/today"); return; }
    let active = true;
    setChecking(true); setRevision(null); setError("");
    const profileRequest = fetch("/api/profile", {signal:AbortSignal.timeout(15000),cache:"no-store"}).then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Could not load your saved profile. Reload before editing.");
      if (typeof data.revision !== "string" || !data.revision) throw Error("Your saved profile could not be verified. Reload before editing.");
      return data;
    });
    const racesRequest = fetch("/api/races", {signal:AbortSignal.timeout(15000),cache:"no-store"}).then(async response => {
      if (!response.ok) throw Error("Could not load saved races");
      const rows = (await response.json()).races;
      if (!Array.isArray(rows)) throw Error("Could not verify saved races");
      return rows as SavedRace[];
    }).catch(() => null);
    Promise.all([profileRequest, racesRequest]).then(([data, savedRaces]) => {
      if (!active) return;
      loadedUserId.current = user.id;
      savedOnboarding.current = {profile:data.profile ?? {},setup:data.setup ?? null};
      const current = hydrateOnboarding(data.profile, data.setup);
      let draft = null;
      try {
        const raw = sessionStorage.getItem(onboardingDraftKey(user.id));
        draft = restoreOnboardingDraft(raw,user.id,data.revision,data.setupRevision ?? null);
        if (raw && !draft) {
          sessionStorage.removeItem(onboardingDraftKey(user.id));
          setNotice("Your saved profile changed. The latest saved answers are shown; an older tab draft was not applied.");
        } else if (draft) setNotice("Your answers from this tab were restored. Save a section to update your profile.");
      } catch { setDraftStorageError(true); }
      const nextProfile = draft?.profile ?? current.profile;
      const nextSetup = draft?.setup ?? current.setup;
      if (returnToTraining) {
        // A preview selection is only a draft, never eligibility, a baseline or consent.
        if (requestedGoal && PLANNABLE_GOALS.includes(planningGoal(requestedGoal)!)) nextProfile.goal = requestedGoal;
        if (requestedWeeks && [4,6,8,12,16,20,24,30].includes(Number(requestedWeeks))) nextSetup.planWeeks = requestedWeeks;
      }
      setProfile(nextProfile); setSetup(nextSetup);
      setReviewedWeightId(draft?.reviewedWeightId ?? null);
      setRevision(data.revision); setSetupRevision(data.setupRevision ?? null);
      setSavedReadiness(data.planningReadiness ?? null);
      setStep(requestedStep ? onboardingResume(requestedStep) : draft?.step ?? ONBOARDING_STEP.devices);
      setRaceLoadError(savedRaces === null);
      const normalizedRaces = (savedRaces ?? []).map(item => ({...item,date:item.date.slice(0,10),location:item.location ?? ""}));
      setRaces(normalizedRaces);
      const selected = draft?.raceId ? normalizedRaces.find(item=>item.id === draft.raceId) : normalizedRaces.find(item=>item.date >= dateKey(new Date(), user.timezone) && item.priority === 1);
      if (draft && (!draft.raceId || selected || savedRaces === null)) { setRace(draft.race); setRaceId(draft.raceId); }
      else if (selected) { setRace({name:selected.name,distance:selected.distance,date:selected.date,location:selected.location}); setRaceId(selected.id); }
      else { setRace({...EMPTY_RACE}); setRaceId(null); }
    }).catch(e=>{if(active) setError((e as Error).message);}).finally(()=>{if(active) setChecking(false);});
    return () => { active = false; };
  }, [user?.id, user?.onboarded, user?.timezone, redo, returnToTraining, requestedStep, requestedGoal, requestedWeeks, router]);

  // Keep interrupted form entries in this tab, scoped to the signed-in athlete and reviewed revisions.
  // This is deliberately separate from saving accepted answers to the server.
  useEffect(() => {
    if (!user?.id || loadedUserId.current !== user.id || checking || !revision) return;
    try {
      sessionStorage.setItem(onboardingDraftKey(user.id), JSON.stringify({version:1,userId:user.id,revision,setupRevision,profile,setup,step,race,raceId,reviewedWeightId}));
      setDraftStorageError(false);
    } catch { setDraftStorageError(true); }
  }, [user?.id,checking,revision,setupRevision,profile,setup,step,race,raceId,reviewedWeightId]);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [connectionError, setConnectionError] = useState("");
  const [importReview, setImportReview] = useState<ImportReview>({});
  const [refreshing, setRefreshing] = useState(false);
  const importRequest = useRef(0);
  const reviewImports = useCallback(async () => {
    const requestId = ++importRequest.current;
    setRefreshing(true); setConnectionError("");
    const responses = await Promise.allSettled([
      fetch("/api/connectors", {cache:"no-store", signal:AbortSignal.timeout(15000)}).then(async response => {if(!response.ok) throw Error("connections");return response.json();}),
      fetch("/api/onboard/import-review", {cache:"no-store", signal:AbortSignal.timeout(15000)}).then(async response => {if(!response.ok) throw Error("imports");return response.json();}),
    ]);
    if (requestId !== importRequest.current) return;
    if (responses[0].status === "fulfilled") setProviders(responses[0].value.providers ?? []);
    if (responses[1].status === "fulfilled") setImportReview(responses[1].value);
    if (responses.some(result=>result.status === "rejected")) setConnectionError("Some connection or import information could not be refreshed. You can continue manually and retry later.");
    setRefreshing(false);
  }, []);
  const cancelImportRefresh = useCallback(() => { importRequest.current++; }, []);
  useEffect(() => { setProviders([]); setImportReview({}); if (user?.id) void reviewImports(); return cancelImportRefresh; }, [user?.id, reviewImports, cancelImportRefresh]);

  async function changeLang(language: string) {
    setError("");
    try {
      const response = await fetch("/api/language", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({language}),signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error("Could not save language. Please retry.");
      setLang(language); await refresh();
    } catch (e) { setError((e as Error).message); }
  }

  async function saveProfile(section: OnboardingSection) {
    if (savingRef.current) return false;
    savingRef.current = true; setSaving(true); setError(""); setNotice("");
    try {
      const fields: Record<string,unknown> = onboardingSectionPayload(section, profile, setup, savedOnboarding.current, setupRevision);
      if (section === "profile" && reviewedWeightId) fields.reviewedWeightObservationId = reviewedWeightId;
      const result = await saveReviewedProfile(fields, revision);
      savedOnboarding.current = {profile:result.profile ?? {},setup:result.setup ?? null};
      setSavedReadiness(result.planningReadiness ?? null);
      setRevision(result.revision); setSetupRevision(result.setupRevision);
      if (section === "profile") setReviewedWeightId(null);
      setNotice(t("Section saved to your profile. Existing training stays in place until you review and confirm a plan update.", "Sección guardada en tu perfil. El entrenamiento actual se conserva hasta revisar y confirmar un cambio de plan."));
      return true;
    } catch(e) { setError((e as Error).message); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function saveRace() {
    const existingRace = races.find(item=>item.id === raceId);
    if (existingRace && Object.keys(EMPTY_RACE).every(key=>race[key as keyof RaceForm] === existingRace[key as keyof RaceForm])) return true;
    if (!race.name && !race.date && !race.distance && !race.location) return true;
    if (!race.name || !race.date || !race.distance) { setError(t("Confirm race name, actual date and distance, or leave every event field empty.", "Confirma nombre, fecha real y distancia, o deja todos los campos de carrera vacíos.")); return false; }
    if (savingRef.current) return false;
    savingRef.current = true; setSaving(true); setError("");
    try {
      let existingId = raceId;
      if (!existingId) {
        const listed = await fetch("/api/races", {cache:"no-store",signal:AbortSignal.timeout(15000)});
        if (!listed.ok) throw Error("Could not check existing races. Retry before adding an event.");
        const matches = ((await listed.json()).races || []).filter((item: SavedRace) => item.name.trim().toLowerCase() === race.name.trim().toLowerCase() && item.date.slice(0,10) === race.date && item.distance === race.distance);
        if (matches.length > 1) throw Error("More than one matching race exists. Review your races before editing this event.");
        existingId = matches[0]?.id ?? null;
      }
      const response = await fetch("/api/races", {method:existingId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...race,...(existingId?{id:existingId}:{}),priority:existingRace?.priority ?? 1}),signal:AbortSignal.timeout(15000)});
      const saved = await response.json();
      if (!response.ok) throw Error(saved.error || "Could not save race");
      if (!saved.race?.id) throw Error("Race save could not be verified. Reload saved races before trying again.");
      setRaceId(saved.race.id);
      setRaces(current=>[...current.filter(item=>item.id !== saved.race.id),{...saved.race,date:saved.race.date.slice(0,10),location:saved.race.location ?? ""}]);
      setNotice(t("Race saved. Further edits update this same event.", "Carrera guardada. Los próximos cambios actualizan este evento."));
      return true;
    } catch(e) { setError((e as Error).message); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }

  async function finishOnboarding(destination: "/today" | "/training" = "/training") {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError("");
    try {
      const response = await fetch("/api/onboard", {method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw Error("Could not finish onboarding. Your saved answers remain available; please retry.");
      completedRef.current = true;
      await refresh(); router.push(destination);
    } catch(e) { setError((e as Error).message); }
    finally { savingRef.current = false; setSaving(false); }
  }

  // Step indicator
  const STEPS = [
    {step:ONBOARDING_STEP.devices,label:t("1. Connections", "1. Conexiones")},
    {step:ONBOARDING_STEP.profile,label:t("2. Profile", "2. Perfil")},
    {step:ONBOARDING_STEP.race,label:t("3. Goals & schedule", "3. Objetivos y horario")},
    {step:ONBOARDING_STEP.done,label:t("4. Your plan", "4. Tu plan")},
  ];
  const OPTIONAL_STEPS = [{step:ONBOARDING_STEP.zones,label:t("Training anchors (optional)", "Referencias (opcional)")},{step:ONBOARDING_STEP.travel,label:t("Travel (optional)", "Viajes (opcional)")}];

  if (checking) {
    return (
      <ProtectedPage>
        <div className="max-w-2xl mx-auto py-16 px-4 text-center">
          <p role="status">{t("Loading your saved answers…", "Cargando tus respuestas guardadas…")}</p>
        </div>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      <div className="max-w-2xl mx-auto py-6 px-1 sm:px-4">
        <header className="mb-5 space-y-2"><p className="text-sm font-semibold">{t("Free pilot · no payment required", "Piloto gratuito · sin pago")}</p><h1 className="font-display text-3xl">{user?.onboarded ? t("Review your athlete setup", "Revisa tu perfil de atleta") : t("Welcome to JMM", "Bienvenido a JMM")}</h1><p className="text-sm">{t("Connect an available source or skip it, review your information, then choose a goal and training plan.", "Conecta una fuente disponible u omítela, revisa tus datos y elige un objetivo y plan de entrenamiento.")}</p></header>
        {returnToTraining && <section className="mb-5 rounded-xl border border-ocean-200 bg-ocean-50 p-4 space-y-2">
          <h1 className="font-display text-2xl">{t("Planning setup", "Configuración del plan")}</h1>
          <p>{t("Review your goal, recent training, availability and restrictions below. Devices, zones and a race are optional. Save this section to return to your plan preview; nothing is assigned automatically.", "Revisa objetivo, entrenamiento reciente, disponibilidad y restricciones. Dispositivos, zonas y carrera son opcionales. Guarda esta sección para volver al plan; no se asigna nada automáticamente.")}</p>
          <Link className="underline" href="/training">{t("Back to training without saving", "Volver al entrenamiento sin guardar")}</Link>
        </section>}
        {error && <div role="alert" className="mb-4 text-red-700">{error} <button type="button" className="underline" onClick={() => window.location.reload()}>Reload and review</button></div>}
        {notice && <p role="status" className="mb-4 rounded-lg border border-emerald-300 p-3 text-sm">{notice}</p>}
        {draftStorageError && <p role="alert" className="mb-4 text-amber-900">{t("This browser could not retain your tab draft. Save this section before leaving or reloading.", "Este navegador no pudo conservar el borrador. Guarda esta sección antes de salir o recargar.")}</p>}
        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= STEPS.findIndex(item=>item.step === step) ? "bg-ocean-600" : "bg-slate-200"}`} />
          ))}
        </div>

        <nav aria-label={t("Setup steps", "Pasos de configuración")} className="flex flex-wrap gap-2 mb-5">{STEPS.map(item => <button key={item.step} disabled={saving} aria-current={step===item.step ? "step" : undefined} className={`min-h-11 text-sm rounded-full px-3 py-2 border ${step===item.step ? "bg-ocean-700 text-white" : "bg-white"}`} onClick={() => {setError("");setStep(item.step);}}>{item.label}</button>)}</nav>
        <details className="text-sm text-slate-600 mb-3"><summary className="min-h-11 cursor-pointer content-center">{t("How your answers are saved", "Cómo se guardan tus respuestas")}</summary>        <p className="text-sm text-slate-600 mb-5">{t("Save each section to keep accepted answers in your account. Unfinished entries are retained in this tab across navigation and reloads. Skipping keeps them as a draft. Unknown answers stay unknown; a personalized plan needs the relevant reviewed details.", "Guarda cada sección para conservar las respuestas en tu cuenta. Los datos sin guardar se conservan en esta pestaña al navegar o recargar. Omitir los conserva como borrador. Un plan personalizado necesita los datos relevantes revisados.")}</p></details>
        <div className="flex flex-wrap gap-4 mb-5">{OPTIONAL_STEPS.map(item=><button key={item.step} disabled={saving} className="underline min-h-11 text-sm" aria-current={step===item.step ? "step" : undefined} onClick={()=>setStep(item.step)}>{item.label}</button>)}</div>
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
            <section className="card mb-4 space-y-3" aria-label={t("Saved identity and import review", "Identidad y datos importados")}>
              <div><p className="font-semibold">{user?.name}</p><p className="break-words text-sm">{user?.email}</p><p className="text-xs">{t("Identity from your JMM sign-in. Imported accounts do not replace it.", "Identidad de tu acceso a JMM. Las cuentas importadas no la reemplazan.")}</p></div>
              <h3 className="font-semibold">{t("Imported information to review", "Datos importados para revisar")}</h3>
              <p className="text-sm">{t("Saved answers are prefilled. Imports never overwrite them automatically. Review source, date and whether a value was reported before using it.", "Los datos guardados aparecen aquí. La importación no los sobrescribe. Revisa fuente, fecha y si el valor es declarado antes de usarlo.")}</p>
              <div className="text-sm"><p>{importReview.history ? `${importReview.history.count} ${t("completed imported activities stored", "actividades importadas realizadas guardadas")}` : t("Imported history has not been loaded yet.", "Aún no se ha cargado el historial importado.")}</p>{importReview.history?.latestAt && <p>{t("Latest recorded activity", "Actividad más reciente")}: {new Date(importReview.history.latestAt).toLocaleDateString()}</p>}{importReview.history?.sports.map(item=><span key={item.sport} className="inline-block rounded-full border px-2 py-1 mr-2 mt-2">{item.sport}: {item.count}</span>)}<p className="mt-2">{t("Stored history may be incomplete. It does not establish your current training capacity or a measured baseline.", "El historial guardado puede estar incompleto. No establece tu capacidad actual ni una referencia medida.")}</p></div>
              {importReview.suggestions?.map(item=><div className="rounded-lg border p-3 text-sm" key={item.observationId}><p>{item.value} {item.unit} · {item.source === "apple_health" ? "Apple Health" : item.source} · {new Date(item.observedAt).toLocaleDateString()} · {item.kind === "uploaded_file" ? t("From your uploaded file; review before use", "De tu archivo; revisa antes de usar") : item.kind === "reported" ? t("Reported by the account, not a measured baseline", "Declarado por la cuenta, no es una referencia medida") : t("Imported observation", "Observación importada")}</p><button className="underline min-h-11" onClick={()=>{setProfile({...profile,weightKg:String(item.value)});setReviewedWeightId(item.observationId);}}>{t("Use this reviewed weight", "Usar este peso revisado")}</button></div>)}
              {importReview.observations?.filter(item=>item.metricType !== "weight_kg").map(item=><p className="text-sm" key={item.id}>{item.metricType}: {item.value} {item.unit} · {item.source} · {new Date(item.observedAt).toLocaleDateString()} · {t("Imported record; not a training baseline", "Registro importado; no es una referencia de entrenamiento")}</p>)}
              {!importReview.suggestions?.length && <p className="text-sm">{t("No eligible recent weight is available to adopt. Enter it manually or leave it unknown. Name, sex, age, height and training anchors are not inferred from activity history.", "No hay un peso reciente válido para adoptar. Introdúcelo manualmente o déjalo desconocido. Nombre, sexo, edad, altura y referencias no se infieren del historial.")}</p>}
              {connectionError && <p role="alert" className="text-sm">{connectionError}</p>}<button disabled={refreshing} className="underline min-h-11" onClick={()=>void reviewImports()}>{refreshing ? "…" : t("Refresh imported information", "Actualizar datos importados")}</button>
            </section>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label htmlFor="onboard-field-1" className="label">{lang === "es" ? "Año de nacimiento" : "Birth year"}</label><input id="onboard-field-1" className="input" type="number" placeholder="1995" value={profile.birthYear} onChange={(e) => setProfile({ ...profile, birthYear: e.target.value })} /></div>
                <div><label htmlFor="onboard-field-2" className="label">{lang === "es" ? "Sexo" : "Sex"}</label><select id="onboard-field-2" className="input" value={profile.sex} onChange={(e) => setProfile({ ...profile, sex: e.target.value })}>
                    <option value="">—</option><option value="male">{lang === "es" ? "Masculino" : "Male"}</option><option value="female">{lang === "es" ? "Femenino" : "Female"}</option>
                  </select>
                </div>
                <div><label htmlFor="onboard-field-3" className="label">{lang === "es" ? "Altura (cm)" : "Height (cm)"}</label><input id="onboard-field-3" className="input" type="number" placeholder="175" value={profile.heightCm} onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })} /></div>
                <div><label htmlFor="onboard-field-4" className="label">{lang === "es" ? "Peso (kg)" : "Weight (kg)"}</label><input id="onboard-field-4" className="input" type="number" step="0.1" placeholder="70" value={profile.weightKg} onChange={(e) => {setProfile({ ...profile, weightKg: e.target.value });setReviewedWeightId(null);}} /></div>
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
          <button className="btn-primary w-full sm:w-auto" onClick={()=>setStep(ONBOARDING_STEP.profile)}>{providers.some(provider=>provider.status === "connected") ? t("Continue to review my information", "Continuar y revisar mis datos") : t("Skip connections and continue manually", "Omitir conexiones y continuar manualmente")}</button>
          <p className="text-sm">{t("Garmin and COROS direct import uses supported files here. An available Intervals.icu connection can provide a separate Garmin bridge; connecting is not proof of watch delivery. Unavailable services cannot be authorized.", "Garmin y COROS usan archivos compatibles aquí. Si Intervals.icu está disponible, puede ofrecer un puente separado con Garmin; conectar no confirma entrega al reloj. No se pueden autorizar servicios no disponibles.")}</p>
          {refreshing && <p role="status">{t("Checking available connections and import status…", "Revisando conexiones e importaciones…")}</p>}
          {connectionError && <p role="alert">{connectionError}</p>}
          {providers.map(p => <div className="card flex flex-wrap items-center gap-3 break-words" key={p.id}><div className="min-w-0 basis-full sm:flex-1"><h3 className="font-semibold">{p.name}</h3><p className="text-sm">{p.description}</p><p className="text-xs mt-1">{p.status === "connected" ? t("Connected", "Conectado") : p.status === "disconnected" ? t("Not connected", "Sin conectar") : t("Needs attention", "Necesita revisión")} · {p.lastSyncAt ? `${t("Last import", "Última importación")}: ${new Date(p.lastSyncAt).toLocaleString()}` : t("No successful import recorded", "Sin importación registrada")}</p>{p.lastError && <p role="status" className="text-sm text-amber-800">{p.lastError}</p>}</div>
          {p.configured && p.method === "oauth" && typeof p.connectUrl === "string" && p.connectUrl.startsWith("/api/connectors/") ? <a className="btn-secondary" href={`${p.connectUrl}?return=${encodeURIComponent("/onboard?redo=1&step=devices")}`}>{t("Connect / reconnect", "Conectar / reconectar")}</a> : p.method === "upload" ? <a className="underline min-h-11 inline-flex items-center" href="/connectors?onboarding=1">{t("Import a file", "Importar archivo")}</a> : p.configured && p.method === "athlinks" ? <Link className="underline min-h-11 inline-flex items-center" href="/connectors?onboarding=1">{t("Review race-history import", "Revisar importación de carreras")}</Link> : <span>{t("Unavailable in this environment", "No disponible en este entorno")}</span>}</div>)}
          <button className="btn-secondary" disabled={refreshing} onClick={reviewImports}>{refreshing ? "…" : t("Refresh import status", "Actualizar importación")}</button>

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  {profile.goal && !PLANNABLE_GOALS.includes(planningGoal(profile.goal)!) && <option value={profile.goal} disabled>{t("Saved legacy goal (choose a supported goal to plan)", "Objetivo anterior (elige otro compatible para planificar)")}: {profile.goal}</option>}
                  <option value="sprint">Sprint</option>
                  <option value="olympic">Olympic</option>
                  <option value="half">Half Ironman</option>
                  <option value="full">Full Ironman</option>
                  <option value="hyrox">HYROX</option>
                  <option value="cycle">{lang === "es" ? "Ciclismo" : "Cycling"}</option>
                  <option value="run-only">{lang === "es" ? "Correr" : "Running"}</option><option value="5k">5K</option><option value="10k">10K</option><option value="half-marathon">{t("Half marathon", "Media maratón")}</option><option value="marathon">{t("Marathon", "Maratón")}</option>
                  <option value="track-sprint">Track Sprint (100-400m)</option>
                  <option value="swim-only">{t("Swimming", "Natación")}</option>
                </select>
              </div>
            </div>
            <details className="mt-5" open><summary className="cursor-pointer font-semibold min-h-11 content-center">{t("Details needed for a personalized plan", "Datos necesarios para un plan personalizado")}</summary><fieldset className="mt-6 space-y-3 border rounded-xl p-4">
              <legend className="font-semibold">{t("Training context and pilot eligibility", "Contexto y elegibilidad del piloto")}</legend>
              <p className="text-sm text-slate-600">{t("Unknown answers stay unknown. A device and performance tests are optional. Individual planning waits for relevant setup and a confirmed preview.", "Las respuestas desconocidas siguen sin conocerse. Dispositivos y pruebas son opcionales. El plan espera los datos relevantes y una vista previa confirmada.")}</p>
              <label className="flex gap-2"><input type="checkbox" checked={setup.adultConfirmed} onChange={e => setSetup({...setup, adultConfirmed:e.target.checked})}/>{t("I confirm I am 18 or older", "Confirmo que tengo 18 años o más")}</label>
              <label className="flex gap-2"><input type="checkbox" checked={setup.profileConfirmed} onChange={e => setSetup({...setup, profileConfirmed:e.target.checked})}/>{t("I confirm my experience and available weekly time above", "Confirmo mi experiencia y el tiempo semanal disponible indicado")}</label>
              <label className="block">{t("Goal in your words: fitness, completion or performance", "Objetivo: bienestar, terminar o rendimiento")}<textarea className="input" value={setup.goalDescription} onChange={e => setSetup({...setup,goalDescription:e.target.value})}/></label>
              <details><summary className="min-h-11 cursor-pointer content-center font-semibold">{t("Add a performance target (optional)", "Añadir objetivo de rendimiento (opcional)")}</summary>
              <label className="block">{t("Optional structured target (a goal, not current ability)", "Objetivo estructurado opcional (meta, no capacidad actual)")}<select className="input" value={setup.targetGoal?.metric ?? ""} onChange={e=>setSetup({...setup,baselinePlanOptIn:false,targetGoal:e.target.value?{metric:e.target.value,sport:""}:null})}><option value="">{t("No structured target yet", "Sin objetivo estructurado todavía")}</option><option value="fitness">{t("General fitness", "Bienestar físico general")}</option><option value="completion">{t("Completion", "Terminar")}</option><option value="pace">{t("Target pace", "Ritmo objetivo")}</option><option value="power">{t("Target power / FTP", "Potencia / FTP objetivo")}</option><option value="speed">{t("Target speed", "Velocidad objetivo")}</option></select></label>
              {setup.targetGoal && <div className="space-y-2 border p-3 rounded-lg">
                <label className="block">{t("Target sport", "Deporte del objetivo")}<select className="input" value={setup.targetGoal.sport} onChange={e=>setSetup({...setup,baselinePlanOptIn:false,targetGoal:{...setup.targetGoal!,sport:e.target.value,context:undefined,contextDescription:undefined}})}><option value="">{t("Choose sport", "Elige deporte")}</option>{["run","bike","swim","strength","mobility","recovery","brick","hyrox"].map(sport=><option key={sport} value={sport}>{sport}</option>)}</select></label>
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
              </details>
              <label className="block">{t("Recently tolerated training, total minutes per week", "Entrenamiento reciente tolerado, minutos totales por semana")}<input className="input" type="number" min="0" max="2400" value={setup.baselineWeeklyMinutes ?? ""} onChange={e=>setSetup({...setup,baselineWeeklyMinutes:e.target.value})}/></label>
              <label className="block">{t("Date this training history was observed", "Fecha de ese historial de entrenamiento")}<input className="input" type="date" value={setup.baselineObservedAt ?? ""} onChange={e=>setSetup({...setup,baselineObservedAt:e.target.value})}/></label>
              <label className="block">{t("Recent interruption or return after time off?", "¿Interrupción reciente o vuelta tras una pausa?")}<select className="input" value={setup.interruptions} onChange={e=>setSetup({...setup,interruptions:e.target.value})}><option value="unknown">{t("Unknown / not answered", "Desconocido / sin responder")}</option><option value="none">{t("No interruption", "Sin interrupción")}</option><option value="yes">{t("Yes, review starting load", "Sí, revisar la carga inicial")}</option></select></label>
              <label className="block">{t("Current symptoms, injury or restrictions?", "¿Síntomas, lesión o restricciones actuales?")}<select className="input" value={setup.restrictions} onChange={e=>setSetup({...setup,restrictions:e.target.value})}><option value="unknown">{t("Unknown / not answered", "Desconocido / sin responder")}</option><option value="none">{t("None reported", "No tengo")}</option><option value="present">{t("Present, qualified review needed", "Sí, requiere revisión profesional")}</option></select></label>
              <label className="block">{t("Pregnancy/postpartum, significant medical restrictions or another circumstance needing professional guidance?", "¿Embarazo/posparto, restricciones médicas importantes u otra circunstancia que requiere orientación profesional?")}<select className="input" value={setup.qualifiedReview} onChange={e=>setSetup({...setup,qualifiedReview:e.target.value})}><option value="unknown">{t("Unknown / prefer not to answer", "Desconocido / prefiero no responder")}</option><option value="none_needed">{t("None reported", "No tengo")}</option><option value="required">{t("Yes, qualified review needed", "Sí, requiere revisión profesional")}</option></select></label>
              <fieldset><legend>{t("Usual available days", "Días habituales disponibles")}</legend><div className="flex flex-wrap gap-3">{[t("Sun","Dom"),t("Mon","Lun"),t("Tue","Mar"),t("Wed","Mié"),t("Thu","Jue"),t("Fri","Vie"),t("Sat","Sáb")].map((day,index)=><label key={day}><input type="checkbox" checked={setup.trainingDays.includes(index)} onChange={e=>setSetup({...setup,trainingDays:e.target.checked?[...setup.trainingDays,index].sort():setup.trainingDays.filter(d=>d!==index)})}/> {day}</label>)}</div></fieldset>
              <label className="block">{t("Maximum total training minutes per day", "Máximo de minutos totales de entrenamiento por día")}<input className="input" type="number" min="10" max="300" value={setup.maxSessionMinutes ?? ""} onChange={e=>setSetup({...setup,maxSessionMinutes:e.target.value})}/></label>
              <label className="block">{t("Equipment and venue access (including none)", "Equipo y lugares disponibles (incluye ninguno)")}<textarea className="input" value={setup.equipmentAccess} onChange={e=>setSetup({...setup,equipmentAccess:e.target.value})}/></label>
              {profile.goal === "track-sprint" && <label className="block">{t("Actual track event", "Prueba de pista real")}<select className="input" value={setup.trackEvent ?? ""} onChange={e=>setSetup({...setup,trackEvent:e.target.value})}><option value="">{t("Choose event", "Elige prueba")}</option><option value="100m">100 m</option><option value="200m">200 m</option><option value="400m">400 m</option></select></label>}
              <fieldset><legend className="font-semibold">{t("Choose a 3-month or 6-month training cycle", "Elige un ciclo de entrenamiento de 3 o 6 meses")}</legend><div className="flex flex-wrap gap-3 mt-2">{[{weeks:"12",en:"3 months · 12 weeks",es:"3 meses · 12 semanas"},{weeks:"24",en:"6 months · 24 weeks",es:"6 meses · 24 semanas"}].map(option=><button key={option.weeks} type="button" className={setup.planWeeks === option.weeks ? "btn-primary" : "btn-secondary"} aria-pressed={setup.planWeeks === option.weeks} onClick={()=>setSetup({...setup,planWeeks:option.weeks})}>{t(option.en,option.es)}</button>)}</div><p className="text-sm mt-2">{t("These are week-based cycles. You can choose another length below or add an actual race date separately.", "Son ciclos por semanas. Puedes elegir otra duración abajo o añadir por separado la fecha real de una carrera.")}</p></fieldset>
              <label className="block">{t("Planning horizon in weeks (no event date is invented)", "Horizonte del plan, semanas (no se inventa una fecha de carrera)")}<input className="input" type="number" min="4" max="30" value={setup.planWeeks ?? ""} onChange={e=>setSetup({...setup,planWeeks:e.target.value})}/></label>
              <p className="text-sm">{t("Unsupported circumstances pause automated planning for qualified review; this form does not provide medical clearance. If you report no recent tolerated training, ask a qualified coach for an appropriate starting load.", "Las circunstancias no admitidas pausan el plan para revisión profesional; este formulario no da autorización médica. Sin entrenamiento reciente tolerado, pide a un entrenador cualificado una carga inicial adecuada.")}</p>
            </fieldset>
            </details>
            <details className="mt-4"><summary className="min-h-11 cursor-pointer content-center font-semibold">{t("Double sessions and coach details (optional)", "Sesiones dobles y entrenador (opcional)")}</summary>
            <DoubleDayFields value={setup.doubleDay} onChange={doubleDay=>setSetup({...setup,doubleDay})}/>
            <label className="block mt-4">{t("Your coach, if any (optional)", "Tu entrenador, si tienes (opcional)")}<input className="input" value={setup.coachPreference ?? ""} maxLength={200} onChange={e=>setSetup({...setup,coachPreference:e.target.value})}/></label><p className="text-xs">{t("This is a preference, not an access grant. Coach access requires an administrator assignment.", "Es una preferencia, no concede acceso. Un administrador debe asignar al entrenador.")}</p>
            </details>
            <h3 className="font-semibold mt-5">{t("Optional race", "Carrera opcional")}</h3>{raceId && <p role="status">{t("Race saved; further edits update this same event.", "Carrera guardada; los cambios actualizan este evento.")}</p>}
            {raceLoadError && <p role="alert" className="text-amber-900">{t("Saved races could not be loaded. Reload before choosing an existing race; new saves check for duplicates.", "No se pudieron cargar las carreras guardadas. Recarga antes de elegir una carrera existente.")}</p>}
            {!!races.length && <label className="block mt-3">{t("Edit an existing race or add a new one", "Edita una carrera o añade otra")}<select className="input" value={raceId ?? ""} onChange={event=>{const selected=races.find(item=>item.id === event.target.value);setRaceId(selected?.id ?? null);setRace(selected ? {name:selected.name,distance:selected.distance,date:selected.date,location:selected.location} : {...EMPTY_RACE});}}><option value="">{t("New race", "Nueva carrera")}</option>{races.map(item=><option key={item.id} value={item.id}>{item.name} · {item.date}</option>)}</select></label>}
            <div className="space-y-3">
              <div><label htmlFor="onboard-field-8" className="label">{lang === "es" ? "Nombre de la carrera" : "Race name"}</label><input id="onboard-field-8" className="input" placeholder="Miami 70.3" value={race.name} onChange={(e) => setRace({ ...race, name: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label htmlFor="onboard-field-9" className="label">{lang === "es" ? "Distancia" : "Distance"}</label><select id="onboard-field-9" className="input" onChange={(e) => setRace({ ...race, distance: e.target.value })} value={race.distance}>
                    <option value="">{t("Choose actual distance", "Elige la distancia real")}</option><option value="sprint">Sprint</option><option value="olympic">Olympic</option><option value="half">Half Ironman</option><option value="full">Full Ironman</option><option value="hyrox">HYROX</option><option value="5k">5K</option><option value="10k">10K</option><option value="half-marathon">{t("Half marathon", "Media maratón")}</option><option value="marathon">{t("Marathon", "Maratón")}</option><option value="100m">100 m</option><option value="200m">200 m</option><option value="400m">400 m</option>
                  </select>
                </div>
                <div><label htmlFor="onboard-field-10" className="label">{lang === "es" ? "Fecha" : "Date"}</label><input id="onboard-field-10" className="input" type="date" value={race.date} onChange={(e) => setRace({ ...race, date: e.target.value })} /></div>
              </div>
              <div><label htmlFor="onboard-field-11" className="label">{lang === "es" ? "Ubicación" : "Location"}</label><input id="onboard-field-11" className="input" placeholder="Miami, FL" value={race.location} onChange={(e) => setRace({ ...race, location: e.target.value })} /></div>
            </div>
            <button className="btn-secondary mt-4" disabled={saving} onClick={async()=>{if(await saveRace()) setError("");}}>{raceId ? t("Update this race", "Actualizar carrera") : t("Save race separately", "Guardar carrera por separado")}</button>
            {savedReadiness && !savedReadiness.ready && <div role="status" className="mt-4 rounded-lg border border-amber-300 p-3">
              <p>{t("Based on your saved answers, planning needs the following review. Saving updates this list; it does not replace an existing plan.", "Según tus respuestas guardadas, falta lo siguiente. Guardar actualiza esta lista y conserva cualquier plan existente.")}</p>
              <ul className="list-disc ml-5">{[...savedReadiness.missing,...savedReadiness.review].map(reason=><li key={reason}>{reason}</li>)}</ul>
            </div>}
            <div className="flex flex-wrap gap-3 justify-between mt-6">
              <button onClick={() => setStep(ONBOARDING_STEP.profile)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={async () => { const saved = await saveProfile("goals"); if (!saved || !await saveRace()) return; if (returnToTraining) router.push("/training"); else setStep(onboardingNext(ONBOARDING_STEP.race)); }} disabled={saving || !revision} className="btn-primary">
                {saving ? "…" : returnToTraining ? t("Save setup and return to training", "Guardar y volver al entrenamiento") : lang === "es" ? "Guardar objetivos y carrera" : "Save goals and race"}
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
            <button onClick={()=>void finishOnboarding("/training")} disabled={saving} className="btn-primary w-full justify-center text-lg">
              {lang === "es" ? "Revisar y crear mi plan" : "Review and build my plan"} <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-4 mt-6 border-t pt-4"><button disabled={saving} className="underline min-h-11" onClick={()=>{setError("");setStep(onboardingNext(step));}}>{t("Skip this section for now", "Omitir esta sección por ahora")}</button><button disabled={saving} className="underline min-h-11" onClick={()=>void finishOnboarding("/today")}>{t("Open Today with saved answers", "Abrir Hoy con respuestas guardadas")}</button><Link className="underline min-h-11 inline-flex items-center" href="/training">{t("View my saved training plan", "Ver mi plan de entrenamiento guardado")}</Link></div>
        {/* Navigation: language switcher */}
        <div className="mt-5 flex justify-end">
          <select aria-label={t("Setup language", "Idioma de configuración")} className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 shadow" value={lang} onChange={(e) => changeLang(e.target.value)}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
      </div>
    </ProtectedPage>
  );
}
