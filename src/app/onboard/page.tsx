"use client";

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
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState(user?.language || "es");
  const [checking, setChecking] = useState(true);

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

  // Devices
  const [devices, setDevices] = useState<string[]>([]);

  // Baselines (thresholds — can skip, test later in Labs)
  const [baselines, setBaselines] = useState({ ftp: "", lthr: "", runPaceBase: "", swimPaceBase: "" });

  // Race
  const [race, setRace] = useState({ name: "", distance: "olympic", date: "", location: "" });

  // Set language
  async function changeLang(l: string) {
    setLang(l);
    await fetch("/api/language", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language: l }) });
    await refresh();
  }

  async function saveProfile() {
    setSaving(true);
    await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
  }

  async function saveRace() {
    if (!race.name || !race.date) return;
    await fetch("/api/races", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...race, priority: 1 }),
    });
  }

  async function finishOnboarding() {
    setSaving(true);
    await fetch("/api/onboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    router.push("/today");
  }

  const t = (en: string, esp: string) => (lang === "es" ? esp : en);

  // Step indicator
  const STEPS = [t("Welcome", "Bienvenido"), t("Profile", "Perfil"), t("Baselines", "Umbrales"), t("Devices", "Dispositivos"), t("Goal Race", "Carrera objetivo"), t("Done", "Listo")];

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
        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-ocean-600" : "bg-slate-200"}`} />
          ))}
        </div>

        {/* Step 0: Language + Welcome */}
        {step === 0 && (
          <div className="text-center py-8">
            <h1 className="font-display text-4xl font-bold mb-2">
              {lang === "es" ? "Bienvenido a JMMai" : "Welcome to JMMai"}
            </h1>
            <p className="text-lg text-slate-600 mb-6">
              {lang === "es"
                ? "Tu entrenador personal basado en ciencia y biometría. Vamos a configurar tu perfil en 3 pasos."
                : "Your personal coach powered by science and biometrics. Let's set up your profile in 3 steps."}
            </p>
            <div className="text-left space-y-3 mb-6">
              {[
                { icon: "📋", en: "Set your profile — age, goals, experience", es: "Configura tu perfil — edad, metas, experiencia" },
                { icon: "⌚", en: "Connect your devices — Whoop, Garmin, COROS", es: "Conecta tus dispositivos — Whoop, Garmin, COROS" },
                { icon: "🏁", en: "Add your goal race — we'll build the plan", es: "Añade tu carrera objetivo — creamos el plan" },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                  <span className="text-2xl">{s.icon}</span>
                  <span className="text-sm font-medium text-slate-700">{lang === "es" ? s.es : s.en}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setStep(1)} className="btn-primary w-full justify-center">
              {lang === "es" ? "Empezar" : "Get started"} <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}

        {/* Step 1: Profile */}
        {step === 1 && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-ocean-600" /> {lang === "es" ? "Tu perfil" : "Your profile"}
            </h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{lang === "es" ? "Año de nacimiento" : "Birth year"}</label><input className="input" type="number" placeholder="1995" onChange={(e) => setProfile({ ...profile, birthYear: e.target.value })} /></div>
                <div><label className="label">{lang === "es" ? "Sexo" : "Sex"}</label>
                  <select className="input" onChange={(e) => setProfile({ ...profile, sex: e.target.value })}>
                    <option value="">—</option><option value="male">{lang === "es" ? "Masculino" : "Male"}</option><option value="female">{lang === "es" ? "Femenino" : "Female"}</option>
                  </select>
                </div>
                <div><label className="label">{lang === "es" ? "Altura (cm)" : "Height (cm)"}</label><input className="input" type="number" placeholder="175" onChange={(e) => setProfile({ ...profile, heightCm: e.target.value })} /></div>
                <div><label className="label">{lang === "es" ? "Peso (kg)" : "Weight (kg)"}</label><input className="input" type="number" step="0.1" placeholder="70" onChange={(e) => setProfile({ ...profile, weightKg: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">{lang === "es" ? "Experiencia" : "Experience"}</label>
                  <select className="input" onChange={(e) => setProfile({ ...profile, experience: e.target.value })} defaultValue="beginner">
                    <option value="beginner">{lang === "es" ? "Principiante" : "Beginner"}</option>
                    <option value="amateur">{lang === "es" ? "Amateur" : "Amateur"}</option>
                    <option value="advanced">{lang === "es" ? "Avanzado" : "Advanced"}</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div><label className="label">{lang === "es" ? "Horas/semana" : "Weekly hours"}</label><input className="input" type="number" defaultValue="8" onChange={(e) => setProfile({ ...profile, weeklyHours: e.target.value })} /></div>
              </div>
              <div><label className="label">{lang === "es" ? "Objetivo" : "Goal"}</label>
                <select className="input" onChange={(e) => setProfile({ ...profile, goal: e.target.value })} defaultValue="olympic">
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
              <button onClick={() => setStep(0)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={async () => { await saveProfile(); setStep(2); }} disabled={saving} className="btn-primary">
                {saving ? "…" : lang === "es" ? "Guardar perfil" : "Save profile"}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Devices */}
        {step === 4 && (
          <div>
            <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
              <Watch className="w-5 h-5 text-ocean-600" /> {lang === "es" ? "Conecta tus dispositivos" : "Connect your devices"}
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              {lang === "es"
                ? "Los datos sincronizan automáticamente cada día a las 5:00 AM. Puedes conectar ahora o más tarde desde Conectores."
                : "Devices sync automatically every day at 5:00 AM. You can connect now or later from Connectors."}
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">⌚</span>
                <div className="flex-1"><div className="font-semibold text-sm">Whoop</div><div className="text-xs text-slate-500">{lang === "es" ? "VFC, recuperación, sueño, entrenamientos" : "HRV, recovery, sleep, workouts"}</div></div>
                {devices.includes("whoop") ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Watch className="w-4 h-4 text-slate-300" />}
              </div>
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">⌚</span>
                <div className="flex-1"><div className="font-semibold text-sm">Garmin / COROS</div><div className="text-xs text-slate-500">{lang === "es" ? "Exporta Activities.csv desde connect.garmin.com" : "Export Activities.csv from connect.garmin.com"}</div></div>
                {devices.includes("garmin") ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Watch className="w-4 h-4 text-slate-300" />}
              </div>
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">💍</span>
                <div className="flex-1"><div className="font-semibold text-sm">Oura Ring</div><div className="text-xs text-slate-500">{lang === "es" ? "Sueño, VFC, recuperación" : "Sleep, HRV, recovery"}</div></div>
                {devices.includes("oura") ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Watch className="w-4 h-4 text-slate-300" />}
              </div>
              <div className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3">
                <span className="text-2xl">🍏</span>
                <div className="flex-1"><div className="font-semibold text-sm">Apple Health</div><div className="text-xs text-slate-500">{lang === "es" ? "Exporta el health.xml desde el iPhone" : "Export health.xml from iPhone"}</div></div>
                {devices.includes("apple") ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Watch className="w-4 h-4 text-slate-300" />}
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <button onClick={() => setStep(1)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={() => setStep(3)} className="btn-primary">{lang === "es" ? "Siguiente" : "Next"} <ArrowRight className="w-4 h-4 ml-1" /></button>
            </div>
          </div>
        )}

        {/* Step 3: Goal race */}
        {step === 4 && (
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
              <button onClick={() => setStep(2)} className="btn-secondary"><ArrowLeft className="w-4 h-4 mr-1" />{lang === "es" ? "Atrás" : "Back"}</button>
              <button onClick={async () => { await saveRace(); setStep(4); }} disabled={saving} className="btn-primary">
                {saving ? "…" : lang === "es" ? "Guardar carrera" : "Save race"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 4 && (
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
