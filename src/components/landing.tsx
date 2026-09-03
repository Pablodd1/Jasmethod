"use client";

import Link from "next/link";
import {
  Activity,
  Apple,
  ArrowRight,
  Bike,
  Dna,
  FlaskConical,
  HeartPulse,
  Layers,
  Medal,
  Moon,
  Pill,
  Swords,
  Waves,
  Watch,
  Zap,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AuthCard } from "@/components/auth-card";
import { useAuth } from "@/components/auth";
import { TOPIC_LIST } from "@/lib/topics";
import { t, type Lang } from "@/lib/i18n";

// Editorial icons for the five science-field guides.
const TOPIC_ICONS: Record<string, typeof Pill> = {
  supplements: Pill,
  "ergogenic-aids": Zap,
  sleep: Moon,
  nutrition: Apple,
  "race-fuel": Waves,
};

// Landing-specific topic card copy (the full guide pages are English editorial;
// the public-facing index cards follow the app language, Venezuelan Spanish default).
const TOPIC_CARD: Record<string, Partial<Record<Lang, [string, string]>>> = {
  supplements: {
    es: ["Suplementos", "Salud diaria fundamental: corrige un déficit, evita la moda."],
    en: ["Supplements", "Daily foundational health — correct a deficit, skip the hype."],
    ht: ["Sipleman", "Sante debaz chak jou — korije yon defisi, evite mòd la."],
    ru: ["Добавки", "Ежедневная база — исправь дефицит, минуй хайп."],
  },
  "ergogenic-aids": {
    es: ["Ayudas ergogénicas", "Impulsores agudos calificados por evidencia que sí mueven el rendimiento."],
    en: ["Ergogenic Aids", "Evidence-graded acute boosters that actually move performance."],
    ht: ["Èd èrgojenik", "Boostè egi klase pa prèv ki vrèman deplase pèfòmans."],
    ru: ["Эргогенные средства", "Оценённые по доказательности острые бустеры производительности."],
  },
  sleep: {
    es: ["Sueño", "La primera herramienta de recuperación: la adaptación ocurre en la cama."],
    en: ["Sleep", "The first recovery tool — adaptation happens in bed."],
    ht: ["Dòmi", "Premye zouti rekiperasyon — adaptasyon fèt nan kabann."],
    ru: ["Сон", "Первый инструмент восстановления — адаптация происходит в кровати."],
  },
  nutrition: {
    es: ["Nutrición", "Proteína, carbohidratos y micronutrientes diseñados alrededor del entrenamiento."],
    en: ["Nutrition", "Protein, carbs and micronutrients engineered around the training."],
    ht: ["Nitrisyon", "Pwoteyin, kaboyidrat ak mikwonitriman bati alantou antrennman an."],
    ru: ["Питание", "Белок, углеводы и микронутриенты вокруг тренировок."],
  },
  "race-fuel": {
    es: ["Combustible de carrera", "Carbohidratos, líquido y sodio ajustados a duración, calor y esfuerzo."],
    en: ["Race & Training Fuel", "Carbs, fluid and sodium tuned to duration, heat and effort."],
    ht: ["Gaz kous", "Kaboyidrat, likid ak sodyòm ajiste pou dire, chalè ak efò."],
    ru: ["Топливо для гонки", "Углеводы, жидкость и натрий под длительность, жару и усилие."],
  },
};

// The app's function set — the honest "what this app does" summary.
const FUNCTIONS: { icon: typeof Activity; titleKey: string; textKey: string }[] = [
  { icon: Activity, titleKey: "pub.fn1.title", textKey: "pub.fn1.text" },
  { icon: HeartPulse, titleKey: "pub.fn2.title", textKey: "pub.fn2.text" },
  { icon: Waves, titleKey: "pub.fn3.title", textKey: "pub.fn3.text" },
  { icon: Moon, titleKey: "pub.fn4.title", textKey: "pub.fn4.text" },
  { icon: FlaskConical, titleKey: "pub.fn5.title", textKey: "pub.fn5.text" },
  { icon: Apple, titleKey: "pub.fn6.title", textKey: "pub.fn6.text" },
  { icon: Watch, titleKey: "pub.fn7.title", textKey: "pub.fn7.text" },
];

// The six engines we coach — triathlon, HYROX, swim, bike, run, boxing.
const SPORTS: { icon: typeof Activity; nameKey: string; descKey: string }[] = [
  { icon: Medal, nameKey: "pub.sport.triathlon.name", descKey: "pub.sport.triathlon.desc" },
  { icon: Layers, nameKey: "pub.sport.hyrox.name", descKey: "pub.sport.hyrox.desc" },
  { icon: Waves, nameKey: "pub.sport.swim.name", descKey: "pub.sport.swim.desc" },
  { icon: Bike, nameKey: "pub.sport.bike.name", descKey: "pub.sport.bike.desc" },
  { icon: Zap, nameKey: "pub.sport.run.name", descKey: "pub.sport.run.desc" },
  { icon: Swords, nameKey: "pub.sport.boxing.name", descKey: "pub.sport.boxing.desc" },
];

const STEPS: { n: string; titleKey: string; textKey: string }[] = [
  { n: "1", titleKey: "pub.step1.title", textKey: "pub.step1.text" },
  { n: "2", titleKey: "pub.step2.title", textKey: "pub.step2.text" },
  { n: "3", titleKey: "pub.step3.title", textKey: "pub.step3.text" },
];

export default function LandingPage() {
  const { language } = useAuth();
  const lang = (language || "es") as Lang;

  const glance = [
    { value: "2", unit: "min", label: t(lang, "pub.glance.dailyCheckin") },
    { value: "0–100", unit: "score", label: t(lang, "pub.glance.readiness") },
    { value: "4", unit: "modes", label: t(lang, "pub.glance.modes") },
    { value: "5", unit: "guides", label: t(lang, "pub.glance.guides") },
  ];

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      {/* ── Hero / summary ─────────────────────────────────────────── */}
      <section className="pub-container pt-14 sm:pt-20 pb-10">
        <p className="kicker">{t(lang, "pub.kicker")}</p>
        <h1 className="display-2xl mt-4 max-w-3xl">
          {t(lang, "pub.hero.pre")} <span className="text-vermillion-500">{t(lang, "pub.hero.span")}</span>
          {t(lang, "pub.hero.post")}
        </h1>

        <div className="mt-4 inline-flex items-center gap-2 text-ink-600">
          <span className="font-mono text-xs text-vermillion-500 tracking-widest">«</span>
          <p className="font-display text-lg italic">{t(lang, "pub.slogan")}</p>
          <span className="font-mono text-xs text-vermillion-500 tracking-widest">»</span>
        </div>

        <p className="deck mt-5 max-w-2xl">{t(lang, "pub.deck")}</p>

        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/onboarding#signup" className="btn-editorial-accent">
            {t(lang, "pub.startFree")} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/science" className="btn-editorial-ghost">
            {t(lang, "pub.readScience")}
          </Link>
        </div>

        {/* Glance band */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-12">
          {glance.map((m) => (
            <div key={m.label} className="metric-card">
              <div className="metric-value">{m.value}</div>
              <div className="metric-unit mt-0.5">{m.unit}</div>
              <div className="micro mt-2 !text-ink-500">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Sport showcase: Triathlon · HYROX · Swim · Bike · Run · Boxing ──────── */}
      <section className="pub-container py-10" id="sports">
        <div className="flex items-center gap-3 mb-6">
          <span className="kicker">01 — {t(lang, "pub.sports.kicker")}</span>
          <div className="flex-1 hr-rule" />
        </div>
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink-900 max-w-3xl">
          {t(lang, "pub.sports.title")}
        </h2>
        <p className="deck mt-3 max-w-3xl">{t(lang, "pub.sports.sub")}</p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-8">
          {SPORTS.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.nameKey}
                className="group rounded-2xl border border-ink-200 bg-white p-6 transition-colors hover:border-vermillion-500"
              >
                <div className="w-12 h-12 rounded-xl bg-vermillion-400/10 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-vermillion-500" />
                </div>
                <h3 className="font-display text-xl font-bold text-ink-900 mt-4">
                  {t(lang, s.nameKey)}
                </h3>
                <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{t(lang, s.descKey)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── What the app does ───────────────────────────────────────── */}
      <section className="pub-container py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="kicker">02 — {t(lang, "pub.functions")}</span>
          <div className="flex-1 hr-rule" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUNCTIONS.map((f) => (
            <div key={f.titleKey} className="rounded-2xl border border-ink-200 bg-white p-6">
              <f.icon className="w-5 h-5 text-vermillion-500" />
              <h3 className="font-display text-lg font-bold text-ink-900 mt-3">{t(lang, f.titleKey)}</h3>
              <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{t(lang, f.textKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works teaser ─────────────────────────────────────── */}
      <section className="pub-container py-10">
        <div className="rounded-3xl border border-ink-200 bg-white p-8 md:p-10">
          <div className="flex items-center gap-3 mb-5">
            <span className="kicker">03 — {t(lang, "pub.howWorks")}</span>
            <div className="flex-1 hr-rule" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="font-mono text-4xl font-semibold text-vermillion-500">{s.n}</div>
                <h3 className="font-display text-xl font-bold text-ink-900 mt-2">{t(lang, s.titleKey)}</h3>
                <p className="text-sm text-ink-600 mt-2 leading-relaxed">{t(lang, s.textKey)}</p>
              </div>
            ))}
          </div>
          <Link href="/onboarding" className="btn-editorial mt-8">
            {t(lang, "pub.learnMore")} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Science field guides (trigger buttons) ──────────────────── */}
      <section className="pub-container py-10" id="science">
        <div className="flex items-center gap-3 mb-6">
          <span className="kicker">04 — {t(lang, "pub.fieldGuides")}</span>
          <div className="flex-1 hr-rule" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOPIC_LIST.map((topic) => {
            const Icon = TOPIC_ICONS[topic.slug] ?? Pill;
            const card = TOPIC_CARD[topic.slug]?.[lang] ?? [topic.title, topic.subtitle];
            return (
              <Link
                key={topic.slug}
                href={`/science/${topic.slug}`}
                className="group rounded-2xl border border-ink-200 bg-white p-6 transition-colors hover:border-vermillion-500"
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-6 h-6 text-vermillion-500" />
                  <span className="font-mono text-xs text-ink-300">{topic.index}</span>
                </div>
                <h3 className="font-display text-xl font-bold text-ink-900 mt-4 group-hover:text-vermillion-600">
                  {card[0]}
                </h3>
                <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{card[1]}</p>
                <span className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-ink-800">
                  {t(lang, "pub.openGuide")} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            );
          })}
          {/* Hub tile fills the 6th cell */}
          <Link
            href="/science"
            className="group flex flex-col justify-between rounded-2xl border border-dashed border-ink-300 bg-paper-50 p-6 transition-colors hover:border-ink-900"
          >
            <div>
              <Dna className="w-6 h-6 text-ink-400" />
              <h3 className="font-display text-xl font-bold text-ink-900 mt-4">{t(lang, "pub.allGuides")}</h3>
              <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">
                {t(lang, "pub.allGuidesSub")}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-ink-800">
              {t(lang, "pub.scienceIndex")} <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── Sign in / register ───────────────────────────────────────── */}
      <section className="pub-container py-10 pb-16" id="signup">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div>
            <p className="kicker">05 — {t(lang, "pub.getStarted")}</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink-900 mt-3 leading-tight">
              {t(lang, "pub.freeTitle")}
            </h2>
            <p className="deck mt-4">{t(lang, "pub.freeDeck")}</p>
            <ul className="mt-6 space-y-3 text-sm text-ink-600">
              {[t(lang, "pub.li1"), t(lang, "pub.li2"), t(lang, "pub.li3")].map((li) => (
                <li key={li} className="flex items-start gap-2">
                  <span className="text-vermillion-500 mt-0.5">✓</span> {li}
                </li>
              ))}
            </ul>
          </div>
          <AuthCard initialMode="login" />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
