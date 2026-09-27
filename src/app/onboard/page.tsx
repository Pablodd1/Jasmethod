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
  { code: "ht", label: "Kreyòl Ayisyen" },
  { code: "fr", label: "Français" },
  { code: "ru", label: "Русский" },
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
    experience: "beginner", goal: "olympic", weeklyHours: "8",
  });

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
        experience: d.profile.experience ?? "beginner", goal: d.profile.goal ?? "olympic",
        weeklyHours: String(d.profile.weeklyHours ?? 8),
      });
      setRevision(d.revision);
    }).catch(e => { if (active) setError(String(e.message)); });
    return () => { active = false; };
  }, [user?.id]);

  // Race
  const [race, setRace] = useState({ name: "", distance: "olympic", date: "", location: "" });

  // Set language
  async function changeLang(l: string) {
    setLang(l);
    await fetch("/api/language", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: l }) });
    await refresh();
  }

  async function saveProfile() {
    setSaving(true); setError("");
    try { const result = await saveReviewedProfile(onboardingProfileFields(profile), revision); setRevision(result.revision); return true; }
    catch(e) { setError((e as Error).message); return false; }
    finally { setSaving(false); }
  }

  async function saveRace() {
    if (!race.name || !race.date) return true;
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
      router.push("/today");
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
                  <option value="sprint">Sprint</option>
                  <option value="olympic">Olympic</option>
                  <option value="half">Half Ironman</option>
                  <option value="full">Full Ironman</option>
                  <option value="hyrox">HYROX</option>
                  <option value="cycle">{lang === "es" ? "Ciclismo" : "Cycling"}</option>
                  <option value="run-only">{lang === "es" ? "Correr" : "Running"}</option>
                  <option value="track-sprint">Track Sprint (100-400m)</option>
                </select>
              </div>
            </div>
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
                  <select className="input" onChange={(e) => setRace({ ...race, distance: e.target.value })} defaultValue="olympic">
                    <option value="sprint">Sprint</option><option value="olympic">Olympic</option><option value="half">Half Ironman</option><option value="full">Full Ironman</option><option value="hyrox">HYROX</option><option value="10k">10K</option>
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
            <h2 className="font-display text-3xl font-bold mb-2">{lang === "es" ? "¡Todo listo!" : "All set!"}</h2>
            <p className="text-lg text-slate-600 mb-6">
              {lang === "es"
                ? "Tu perfil está configurado. Mañana verás tu entrenamiento personalizado aquí."
                : "Your profile is configured. You'll see your personalized training on the Today page."}
            </p>
            <button onClick={finishOnboarding} disabled={saving} className="btn-primary w-full justify-center text-lg">
              {lang === "es" ? "Ir a Hoy" : "Go to Today"} <ArrowRight className="w-4 h-4 ml-2" />
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
