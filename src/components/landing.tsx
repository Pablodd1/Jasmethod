import Link from "next/link";
import {
  Activity,
  Apple,
  ArrowRight,
  Dna,
  FlaskConical,
  HeartPulse,
  Moon,
  Pill,
  Waves,
  Zap,
} from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AuthCard } from "@/components/auth-card";
import { TOPIC_LIST } from "@/lib/topics";

// Editorial icons for the five science-field guides.
const TOPIC_ICONS: Record<string, typeof Pill> = {
  supplements: Pill,
  "ergogenic-aids": Zap,
  sleep: Moon,
  nutrition: Apple,
  "race-fuel": Waves,
};

// The app's function set — the honest "what this app does" summary.
const FUNCTIONS: { icon: typeof Activity; title: string; text: string }[] = [
  {
    icon: Activity,
    title: "Daily readiness check-in",
    text: "Five quick questions plus resting heart rate and weight. Two minutes every morning — typed or spoken — scored into one 0–100 readiness number.",
  },
  {
    icon: HeartPulse,
    title: "Adaptive coach + prescription",
    text: "Your check-in is scaled into today's exact session: duration, intensity cap and fuel. The AI coach (Gemini) writes the plain-English reasoning behind it.",
  },
  {
    icon: Waves,
    title: "Periodized race plans",
    text: "Triathlon, HYROX, cycling, running, swimming or lifting — 6-week blocks that grow ~5–8% as you complete weeks and back off when life gets busy.",
  },
  {
    icon: Moon,
    title: "Sleep & recovery",
    text: "Wearable sync (Garmin, Oura, Whoop, COROS, Strava) pulls sleep, HRV and workouts automatically — no watch needed for the core flow.",
  },
  {
    icon: FlaskConical,
    title: "Blood & DNA panels",
    text: "Store panels and get flags against athlete-adjusted ranges (endurance ferritin, vitamin D, B12), plus DNA trait highlights that change training.",
  },
  {
    icon: Apple,
    title: "Nutrition, fuel & ergogenics",
    text: "Personal protein targets, race-day fueling and evidence-graded ergogenic picks — de-duplicated so you're never told to take caffeine twice.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      {/* ── Hero / summary ─────────────────────────────────────────── */}
      <section className="pub-container pt-14 sm:pt-20 pb-10">
        <p className="kicker">Post-2000 sports medicine · HRV-driven · Periodized</p>
        <h1 className="display-2xl mt-4 max-w-3xl">
          Training that reads <span className="text-vermillion-500">your body</span>, not your ego.
        </h1>
        <p className="deck mt-5 max-w-2xl">
          JasMiamiMethod is the science-backed endurance coach: a two-minute morning
          check-in becomes today&apos;s exact session, fuel plan and recovery — grounded in
          post-2000 human-performance research, not folklore.
        </p>

        <div className="flex flex-wrap gap-3 mt-8">
          <Link href="/onboarding#signup" className="btn-editorial-accent">
            Start free <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/science" className="btn-editorial-ghost">
            Read the science
          </Link>
        </div>

        {/* Glance band */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-12">
          {[
            { value: "2", unit: "min", label: "Daily check-in" },
            { value: "0–100", unit: "score", label: "Readiness verdict" },
            { value: "4", unit: "modes", label: "Full · Trim · Easy · Rest" },
            { value: "5", unit: "guides", label: "Evidence field guides" },
          ].map((m) => (
            <div key={m.label} className="metric-card">
              <div className="metric-value">{m.value}</div>
              <div className="metric-unit mt-0.5">{m.unit}</div>
              <div className="micro mt-2 !text-ink-500">{m.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── What the app does ───────────────────────────────────────── */}
      <section className="pub-container py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="kicker">01 — The functions</span>
          <div className="flex-1 hr-rule" />
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FUNCTIONS.map((f) => (
            <div key={f.title} className="rounded-2xl border border-ink-200 bg-white p-6">
              <f.icon className="w-5 h-5 text-vermillion-500" />
              <h3 className="font-display text-lg font-bold text-ink-900 mt-3">{f.title}</h3>
              <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works teaser ─────────────────────────────────────── */}
      <section className="pub-container py-10">
        <div className="rounded-3xl border border-ink-200 bg-white p-8 md:p-10">
          <div className="flex items-center gap-3 mb-5">
            <span className="kicker">02 — How it works</span>
            <div className="flex-1 hr-rule" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { n: "1", t: "Check in", d: "Two minutes: sleep, soreness, energy, motivation, stress — plus resting HR and weight when you have them." },
              { n: "2", t: "Get scored", d: "Your answers combine into a 0–100 readiness score and one of four verdicts that scale today's session." },
              { n: "3", t: "Execute", d: "The coach returns the exact session, fuel plan and recovery drill. You don't think — you go." },
            ].map((s) => (
              <div key={s.n}>
                <div className="font-mono text-4xl font-semibold text-vermillion-500">{s.n}</div>
                <h3 className="font-display text-xl font-bold text-ink-900 mt-2">{s.t}</h3>
                <p className="text-sm text-ink-600 mt-2 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
          <Link href="/onboarding" className="btn-editorial mt-8">
            See the full step-by-step <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ── Science field guides (trigger buttons) ──────────────────── */}
      <section className="pub-container py-10" id="science">
        <div className="flex items-center gap-3 mb-6">
          <span className="kicker">03 — The field guides</span>
          <div className="flex-1 hr-rule" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOPIC_LIST.map((topic) => {
            const Icon = TOPIC_ICONS[topic.slug] ?? Pill;
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
                  {topic.title}
                </h3>
                <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{topic.subtitle}</p>
                <span className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-ink-800">
                  Open guide <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
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
              <h3 className="font-display text-xl font-bold text-ink-900 mt-4">All five guides</h3>
              <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">
                Supplements, ergogenic aids, sleep, nutrition and race fuel — one evidence index.
              </p>
            </div>
            <span className="inline-flex items-center gap-1 mt-4 text-sm font-semibold text-ink-800">
              The science index <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </Link>
        </div>
      </section>

      {/* ── Sign in / register ───────────────────────────────────────── */}
      <section className="pub-container py-10 pb-16" id="signup">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div>
            <p className="kicker">04 — Get started</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink-900 mt-3 leading-tight">
              Free for athletes. Your data stays yours.
            </h2>
            <p className="deck mt-4">
              Sign in or register in under a minute. Blood, DNA and training records are
              private — you can delete them at any time.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-ink-600">
              {[
                "No credit card, no device required to start.",
                "Connect Garmin, Strava, Oura, Whoop or COROS later.",
                "Backed by cited post-2000 research on every recommendation.",
              ].map((li) => (
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
