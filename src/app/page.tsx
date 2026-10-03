"use client";

// Public HOME — the data-rich front door (owner request 2026-09-28):
// analytics graphics, the daily-coach loop, sports science, integrations,
// bilingual copy. Login is SEPARATED: every CTA leads to /login (straight to
// credentials). All charts are ILLUSTRATIVE (honest label) — no athlete data
// is ever shown publicly. Same ocean/paper theme as the app.
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { SiteHeader } from "@/components/site-shell";
import {
  HeartPulse, Watch, FlaskConical, MessageSquare,
  CalendarDays, Activity, Brain, ChevronRight, ShieldCheck, Globe2,
} from "lucide-react";

const es = (lang: string) => lang === "es";

const COPY = {
  hero: {
    kicker: ["Daily coaching, explained", "Entrenamiento diario, explicado"],
    h1a: ["Training that reads ", "Entrenamiento que lee "],
    h1b: ["your body", "tu cuerpo"],
    h1c: [", not your ego.", ", no tu ego."],
    sub: [
      "Start with a manual check-in and review your session in the app. Download supported FIT workouts for manual transfer. Devices are optional; integrations depend on availability, setup and consent.",
      "Empieza con un chequeo manual y revisa tu sesión en la app. Descarga entrenamientos FIT compatibles para transferirlos manualmente. Los dispositivos son opcionales; las integraciones dependen de su disponibilidad, configuración y tu consentimiento.",
    ],
    cta: ["Sign in / Create account", "Entrar / Crear cuenta"],
    cta2: ["See the science", "Ver la ciencia"],
    langNote: ["English · Español (use the selector above)", "English · Español (usa el selector de arriba)"],
  },
  stats: [
    { n: "0", en: "devices required for manual coaching", es: "dispositivos necesarios para entrenamiento manual" },
    { n: "80/20", en: "polarized training model by default", es: "modelo polarizado por defecto" },
    { n: "100+", en: "research-cited protocols (PMIDs in-app)", es: "protocolos citados con PMID" },
    { n: "5", en: "languages, bilingual coaching", es: "idiomas, coach bilingüe" },
  ],
  loop: {
    title: ["The daily loop", "El ciclo diario"],
    sub: [
      "Four moves, every single day — this is the whole product.",
      "Cuatro movimientos, todos los días — este es el producto completo.",
    ],
    steps: [
      {
        icon: HeartPulse,
        en: ["1 · Check in", "Report sleep, soreness, mood and available time. Supported, connected services can add available measurements; no device is required."],
        es: ["1 · Chequeo", "Registra sueño, dolor, ánimo y tiempo disponible. Los servicios compatibles y conectados pueden aportar mediciones disponibles; no necesitas dispositivo."],
      },
      {
        icon: Brain,
        en: ["2 · KCoach adapts", "Green day? Full session. Red day? It trims volume and caps intensity — with the reason shown."],
        es: ["2 · KCoach adapta", "¿Día verde? Sesión completa. ¿Rojo? Recorta volumen y limita intensidad — mostrando el porqué."],
      },
      {
        icon: Watch,
        en: ["3 · Review & transfer", "Read your workout in the app. Download supported FIT files for manual transfer; verify compatibility and import on your device."],
        es: ["3 · Revisa y transfiere", "Consulta tu entrenamiento en la app. Descarga archivos FIT compatibles para transferirlos manualmente; comprueba la compatibilidad y la importación en tu dispositivo."],
      },
      {
        icon: Activity,
        en: ["4 · Report & review", "Report what you actually did and how it felt. A supported, enabled activity connection can add imported history for review."],
        es: ["4 · Registra y revisa", "Registra lo que realmente hiciste y cómo te sentiste. Una conexión de actividades compatible y activada puede añadir historial importado para revisarlo."],
      },
    ],
  },
  analytics: {
    title: ["The analytics your coach actually uses", "Los analíticos que tu coach realmente usa"],
    cards: [
      {
        title: ["Fitness & fatigue (PMC)", "Forma y fatiga (PMC)"],
        body: [
          "Chronic load (CTL), acute load (ATL) and form (TSB) projected to race day — if you execute the plan, this is your shape on the line.",
          "Carga crónica (CTL), aguda (ATL) y forma (TSB) proyectadas al día de carrera — si ejecutas el plan, esta es tu forma en la línea.",
        ],
      },
      {
        title: ["Race-day taper", "Taper hacia la carrera"],
        body: [
          "A-race weeks taper −41% to −60% in volume with intensity held (the meta-analytic sweet spot). B-races train through.",
          "Las semanas de carrera A reducen −41% a −60% el volumen manteniendo la intensidad (el punto óptimo meta-analítico). Las B se entrenan en carga.",
        ],
      },
      {
        title: ["Readiness verdicts", "Veredictos de disposición"],
        body: [
          "HRV vs your 7-day baseline, sleep debt, soreness and life stress become one honest call: green, amber or red.",
          "HRV vs tu base de 7 días, deuda de sueño, dolor y estrés se vuelven una señal honesta: verde, ámbar o rojo.",
        ],
      },
    ],
  },
  science: {
    title: ["Published science, cited in-app", "Ciencia publicada, citada en la app"],
    items: [
      ["Taper meta-analysis: −41–60% volume, ~2 weeks, intensity held.", "Meta-análisis de taper: −41–60% volumen, ~2 semanas, intensidad mantenida."],
      ["Rønnestad 30/15 short intervals — ~2× the VO₂max gain of long intervals.", "Intervalos cortos 30/15 de Rønnestad — ~2× la ganancia de VO₂max vs largos."],
      ["80/20 polarized distribution as the default weekly shape.", "Distribución polarizada 80/20 como forma semanal por defecto."],
      ["Supplement guidance anchored to IOC consensus and AIS Group A evidence.", "Suplementos anclados al consenso del COI y evidencia AIS Grupo A."],
    ],
    link: ["Browse the science library →", "Explorar la biblioteca científica →"],
  },
  integrations: {
    title: ["Plays with your ecosystem", "Funciona con tu ecosistema"],
    rows: [
      ["Strava", "Optional activity imports after connecting a supported account. Check the import status.", "Importación opcional de actividades tras conectar una cuenta compatible. Comprueba el estado de la importación."],
      ["Whoop · Oura", "Optional recovery inputs where supported and connected. Missing values stay unknown.", "Datos de recuperación opcionales cuando sean compatibles y estén conectados. Los valores ausentes siguen sin conocerse."],
      ["Manual workout FIT", "Download supported workouts for compatible devices. USB transfer and device compatibility must be checked.", "Descarga entrenamientos compatibles. Comprueba la transferencia USB y la compatibilidad de tu dispositivo."],
      ["Telegram · Google Calendar", "Optional channels depend on enabled services, setup and consent. Check the current options in the app.", "Los canales opcionales dependen de los servicios habilitados, la configuración y tu consentimiento. Consulta las opciones actuales en la app."],
    ],
  },
  audience: {
    a: [
      "New to structured training? Answer a few questions — a safe, complete plan starts today, no gadgets required.",
      "¿Nuevo en entrenamiento estructurado? Responde unas preguntas — un plan seguro y completo empieza hoy, sin aparatos.",
    ],
    b: [
      "Data-driven athlete? Bring your FTP, LTHR, 5K PB and lactate numbers — thresholds, zones and race forecasts sharpen to your measurements.",
      "¿Atleta de datos? Trae tu FTP, LTHR, PB de 5K y lactato — umbrales, zonas y pronósticos se ajustan a tus mediciones.",
    ],
  },
  privacy: {
    title: ["Your data stays yours", "Tus datos siguen siendo tuyos"],
    body: [
      "Tokens encrypted at rest. Provider connections revoked by you, anytime. External AI only with your explicit per-question consent — your biometrics never leave our servers without it.",
      "Tokens encriptados en reposo. Conexiones revocadas por ti, cuando quieras. IA externa solo con tu consentimiento explícito por pregunta — tu biometría nunca sale de nuestros servidores sin él.",
    ],
    links: ["Privacy Policy", "Terms of Service", "Help & Support"],
    linksEs: ["Política de privacidad", "Términos de servicio", "Ayuda y soporte"],
  },
};

export default function Home() {
  const { language, user } = useAuth();
  const L = es(language) ? 1 : 0;
  const pick = (arr: string[]) => arr[L] ?? arr[0];

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      <main className="pub-container py-12 sm:py-16">
        {/* HERO */}
        <section className="max-w-3xl">
          <p className="kicker">JasMiamiMethod · KCoach</p>
          <h1 className="display-2xl mt-4">
            {pick(COPY.hero.h1a)}
            <span className="text-vermillion-500">{pick(COPY.hero.h1b)}</span>
            {pick(COPY.hero.h1c)}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-ink-600 leading-relaxed max-w-2xl">
            {pick(COPY.hero.sub)}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="/login" className="btn-primary">
              {pick(COPY.hero.cta)} <ChevronRight className="w-4 h-4" />
            </Link>
            <Link href="/science" className="btn-secondary">
              <FlaskConical className="w-4 h-4" /> {pick(COPY.hero.cta2)}
            </Link>
            {user && (
              <Link href="/today" className="btn-editorial">
                {es(language) ? "Abrir mi entrenamiento" : "Open my training"} →
              </Link>
            )}
          </div>
          <p className="mt-3 text-xs text-ink-400 flex items-center gap-1.5">
            <Globe2 className="w-3.5 h-3.5" /> {pick(COPY.hero.langNote)}
          </p>
        </section>

        {/* STATS STRIP */}
        <section className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {COPY.stats.map((s, i) => (
            <div key={i} className="card p-4">
              <div className="font-display text-3xl font-bold text-ocean-700">{s.n}</div>
              <div className="text-xs text-ink-500 mt-1">{es(language) ? s.es : s.en}</div>
            </div>
          ))}
        </section>

        {/* DAILY LOOP */}
        <section className="mt-16">
          <h2 className="display-xl">{pick(COPY.loop.title)}</h2>
          <p className="text-sm text-ink-500 mt-2">{pick(COPY.loop.sub)}</p>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COPY.loop.steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="card p-5">
                  <Icon className="w-6 h-6 text-vermillion-500" />
                  <h3 className="font-display font-bold mt-3">
                    {es(language) ? s.es[0] : s.en[0]}
                  </h3>
                  <p className="text-sm text-ink-600 mt-2 leading-relaxed">
                    {es(language) ? s.es[1] : s.en[1]}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ANALYTICS + GRAPHICS (illustrative SVGs) */}
        <section className="mt-16">
          <h2 className="display-xl">{pick(COPY.analytics.title)}</h2>
          <p className="text-xs text-ink-400 mt-2 italic">
            {es(language) ? <>Ejemplos ilustrativos — la app usa tus datos reales.</> : <>Illustrative examples — the app computes these from your real data.</>}
          </p>
          <div className="mt-6 grid lg:grid-cols-3 gap-4">
            {/* PMC curve */}
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm">{pick(COPY.analytics.cards[0].title)}</h3>
              <svg viewBox="0 0 300 130" className="w-full mt-3" role="img" aria-label="PMC curve example">
                <line x1="10" y1="115" x2="290" y2="115" stroke="#94a3b8" strokeWidth="1" />
                <path d="M10,95 C60,85 110,70 160,62 C210,54 250,50 290,48" fill="none" stroke="#0369a1" strokeWidth="2.5" />
                <path d="M10,100 C50,80 90,105 130,95 C170,85 210,100 250,70 C270,58 280,55 290,54" fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="5 3" />
                <path d="M10,80 C60,72 110,84 160,78 C210,72 250,55 290,50" fill="none" stroke="#65a30d" strokeWidth="2" />
                <text x="12" y="14" fontSize="9" fill="#0369a1">CTL (fitness)</text>
                <text x="200" y="30" fontSize="9" fill="#dc2626">ATL (fatigue)</text>
                <text x="12" y="70" fontSize="9" fill="#65a30d">TSB</text>
              </svg>
              <p className="text-xs text-ink-500 mt-2">{pick(COPY.analytics.cards[0].body)}</p>
            </div>
            {/* Taper volume bars */}
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm">{pick(COPY.analytics.cards[1].title)}</h3>
              <svg viewBox="0 0 300 130" className="w-full mt-3" role="img" aria-label="Taper volume example">
                {[
                  [20, 100], [60, 104], [100, 96], [140, 64], [180, 44], [220, 22],
                ].map(([x, h], i) => (
                  <rect key={i} x={x} y={118 - (h as number)} width="26" height={h as number} rx="3"
                    fill={i >= 3 ? "#f59e0b" : "#0369a1"} opacity={0.9} />
                ))}
                <line x1="14" y1="118" x2="286" y2="118" stroke="#94a3b8" />
                <text x="14" y="128" fontSize="8" fill="#64748b">w-5</text>
                <text x="218" y="128" fontSize="8" fill="#64748b">race</text>
              </svg>
              <p className="text-xs text-ink-500 mt-2">{pick(COPY.analytics.cards[1].body)}</p>
            </div>
            {/* Readiness verdicts */}
            <div className="card p-5">
              <h3 className="font-display font-bold text-sm">{pick(COPY.analytics.cards[2].title)}</h3>
              <div className="mt-3 space-y-2">
                {[["GREEN DAY", "#16a34a", "HRV 62 · sleep 8.1h — full session"],
                  ["AMBER DAY", "#d97706", "HRV −8% vs baseline — trim 15%"],
                  ["RED DAY", "#dc2626", "HRV −22% · poor sleep — Z1 only"]].map(([label, color, note], i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-bold" style={{ color: color as string }}>{label}</span>
                    <span className="text-ink-500">{note}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-500 mt-3">{pick(COPY.analytics.cards[2].body)}</p>
            </div>
          </div>
        </section>

        {/* SCIENCE */}
        <section className="mt-16 card p-6 bg-ocean-50 border-ocean-200">
          <h2 className="display-xl">{pick(COPY.science.title)}</h2>
          <ul className="mt-4 grid sm:grid-cols-2 gap-3">
            {COPY.science.items.map((it, i) => (
              <li key={i} className="text-sm text-ink-700 flex gap-2">
                <span className="text-vermillion-500 font-mono">›</span> {pick(it)}
              </li>
            ))}
          </ul>
          <Link href="/science" className="inline-flex items-center gap-1 text-sm text-ocean-700 hover:underline mt-4">
            <FlaskConical className="w-4 h-4" /> {pick(COPY.science.link)}
          </Link>
        </section>

        {/* INTEGRATIONS */}
        <section className="mt-16">
          <h2 className="display-xl">{pick(COPY.integrations.title)}</h2>
          <div className="mt-6 grid sm:grid-cols-2 gap-3">
            {COPY.integrations.rows.map((r, i) => {
              const Icon = [Watch, HeartPulse, MessageSquare, CalendarDays][i % 4];
              return (
                <div key={i} className="card p-4 flex items-start gap-3">
                  <Icon className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-display font-bold text-sm">{r[0]}</div>
                    <div className="text-xs text-ink-500 mt-0.5">{es(language) ? r[2] : r[1]}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* AUDIENCE */}
        <section className="mt-16 grid md:grid-cols-2 gap-4">
          <div className="card p-6">
            <h3 className="font-display font-bold">{es(language) ? "Recreativo" : "Recreational"}</h3>
            <p className="text-sm text-ink-600 mt-2">{pick(COPY.audience.a)}</p>
          </div>
          <div className="card p-6">
            <h3 className="font-display font-bold">{es(language) ? "Conocedor" : "Knowledgeable"}</h3>
            <p className="text-sm text-ink-600 mt-2">{pick(COPY.audience.b)}</p>
          </div>
        </section>

        {/* PRIVACY + LEGAL */}
        <section className="mt-16 card p-6 border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="font-display font-bold text-lg">{pick(COPY.privacy.title)}</h2>
          </div>
          <p className="text-sm text-ink-600 mt-2 max-w-2xl">{pick(COPY.privacy.body)}</p>
          <div className="flex flex-wrap gap-5 mt-4 text-sm">
            {[
              ["/privacy", es(language) ? COPY.privacy.linksEs[0] : COPY.privacy.links[0]],
              ["/terms", es(language) ? COPY.privacy.linksEs[1] : COPY.privacy.links[1]],
              ["/help", es(language) ? COPY.privacy.linksEs[2] : COPY.privacy.links[2]],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="text-emerald-800 hover:underline font-medium">
                {label}
              </Link>
            ))}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="mt-16 text-center">
          <h2 className="display-2xl">{es(language) ? "Empieza hoy." : "Start today."}</h2>
          <p className="text-sm text-ink-500 mt-2">
            {es(language)
              ? "Entrenamiento diario, guiado por tus chequeos, disponible en la app."
              : "Daily training, guided by your check-ins, available in the app."}
          </p>
          <Link href="/login" className="btn-primary mt-5">
            {pick(COPY.hero.cta)} <ChevronRight className="w-4 h-4" />
          </Link>
        </section>
      </main>

      <footer className="border-t border-ink-200/70 mt-16">
        <div className="pub-container py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-500">
          <span className="font-display font-bold text-ink-800">JasMiamiMethod</span>
          <span>{es(language) ? "Ciencia del deporte · Miami, FL" : "Sports science · Miami, FL"}</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink-900">{es(language) ? "Privacidad" : "Privacy"}</Link>
            <Link href="/terms" className="hover:text-ink-900">{es(language) ? "Términos" : "Terms"}</Link>
            <Link href="/help" className="hover:text-ink-900">{es(language) ? "Ayuda" : "Help"}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
