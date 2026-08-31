import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, HeartPulse, Scale, Timer } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { AuthCard } from "@/components/auth-card";
import {
  CHECKIN_QUESTIONS,
  CHECKIN_OBJECTIVE,
  VERDICTS,
  CHECKIN_SCORE_EXPLAINER,
} from "@/lib/topics";

export const metadata: Metadata = {
  title: "How the daily check-in works — JasMiamiMethod",
  description:
    "Step-by-step: why each of the five morning questions is asked, the 1–5 metric, and how the answers combine into your daily readiness verdict.",
};

// The three-step daily loop (the shape of the whole habit).
const STEPS = [
  {
    n: "01",
    icon: Timer,
    title: "Check in — two minutes",
    body: "Five questions (sleep, soreness, energy, motivation, stress), then optional resting heart rate and morning weight. Type them or speak them — no devices required.",
  },
  {
    n: "02",
    icon: Scale,
    title: "Get scored — why + metric + evaluation",
    body: "Each answer has a reason it's asked, a 1–5 way to self-rate, and a fixed effect on a single 0–100 readiness score. The math is open below — nothing is a black box.",
  },
  {
    n: "03",
    icon: HeartPulse,
    title: "Execute — the verdict scales today",
    body: "The score maps to one of four verdicts (Full · Trim · Easy · Rest) that automatically scale duration and cap intensity for today's session, fuel and recovery.",
  },
];

export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      {/* Hero */}
      <section className="pub-container pt-14 sm:pt-20">
        <p className="kicker">Onboarding · The daily check-in</p>
        <h1 className="display-2xl mt-4 max-w-3xl">
          Two minutes a morning. One honest number.
        </h1>
        <p className="deck mt-5 max-w-2xl">
          Everything the coach prescribes starts with the same five questions. Here is
          exactly why each is asked, how to rate yourself on the 1–5 scale, and how the
          answers feed your daily evaluation — the readiness score and its verdict.
        </p>
      </section>

      {/* The loop */}
      <section className="pub-container py-12">
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-2xl border border-ink-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <s.icon className="w-5 h-5 text-vermillion-500" />
                <span className="font-mono text-xs text-ink-300">{s.n}</span>
              </div>
              <h2 className="font-display text-lg font-bold text-ink-900 mt-3">{s.title}</h2>
              <p className="text-sm text-ink-600 mt-2 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Part 1 — the five questions */}
      <section className="pub-container py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="kicker">Part 1 — The five questions</span>
          <div className="flex-1 hr-rule" />
        </div>

        <div className="space-y-4">
          {CHECKIN_QUESTIONS.map((q, i) => (
            <article key={q.key} className="rounded-2xl border border-ink-200 bg-white p-6 md:p-7">
              <div className="flex items-start gap-4">
                <div className="font-mono text-2xl font-semibold text-vermillion-500">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl font-bold text-ink-900">{q.label}</h2>
                    <span className="eyebrow-pill">{q.scale}</span>
                    <span className="ml-auto font-mono text-xs text-ink-400">{q.weight}</span>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <div className="micro text-vermillion-500">Why it&apos;s asked</div>
                      <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{q.why}</p>
                    </div>
                    <div>
                      <div className="micro text-vermillion-500">The metric — how to self-rate</div>
                      <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{q.metric}</p>
                    </div>
                    <div>
                      <div className="micro text-vermillion-500">How it feeds the evaluation</div>
                      <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">{q.evaluation}</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Part 2 — objective signals */}
      <section className="pub-container py-10">
        <div className="flex items-center gap-3 mb-6">
          <span className="kicker">Part 2 — Objective signals (optional)</span>
          <div className="flex-1 hr-rule" />
        </div>
        <p className="text-sm text-ink-600 max-w-2xl mb-5">
          The five questions are subjective. These are the objective anchors the engine
          layers on top when you have them — they sharpen the score without you having to
          interpret anything.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {CHECKIN_OBJECTIVE.map((m) => (
            <div key={m.key} className="rounded-2xl border border-ink-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-bold text-ink-900">{m.label}</h3>
                <span className="font-mono text-[11px] uppercase tracking-wide text-ink-400">
                  {m.hint}
                </span>
              </div>
              <p className="text-sm text-ink-600 mt-2 leading-relaxed">{m.why}</p>
              <p className="text-sm text-ink-600 mt-2 leading-relaxed border-t border-ink-100 pt-2">
                <span className="font-semibold text-ink-800">Evaluation: </span>
                {m.evaluation}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Part 3 — the daily evaluation */}
      <section className="pub-container py-10" id="evaluation">
        <div className="rounded-3xl border border-ink-200 bg-white p-8 md:p-10">
          <div className="flex items-center gap-3 mb-6">
            <span className="kicker">Part 3 — The daily evaluation</span>
            <div className="flex-1 hr-rule" />
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-900">
            {CHECKIN_SCORE_EXPLAINER.title}
          </h2>
          <p className="text-sm text-ink-600 mt-3 max-w-2xl leading-relaxed">
            {CHECKIN_SCORE_EXPLAINER.intro}
          </p>

          <div className="mt-6 rounded-xl bg-paper-50 border border-ink-200 p-5 font-mono text-sm text-ink-800 leading-relaxed overflow-x-auto">
            {CHECKIN_SCORE_EXPLAINER.formula}
          </div>

          <p className="micro mt-4 !text-ink-500">{CHECKIN_SCORE_EXPLAINER.note}</p>

          {/* Verdicts */}
          <div className="grid sm:grid-cols-2 gap-4 mt-8">
            {VERDICTS.map((v) => (
              <div key={v.verdict} className="rounded-2xl border border-ink-200 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl font-bold text-ink-900">{v.label}</h3>
                  <span className="font-mono text-xs text-vermillion-500">{v.range}</span>
                </div>
                <div className="flex gap-4 mt-2 font-mono text-[11px] uppercase tracking-wide text-ink-500">
                  <span>{v.duration} duration</span>
                  <span>cap {v.intensity}</span>
                </div>
                <p className="text-sm text-ink-600 mt-2 leading-relaxed">{v.meaning}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sign in / register */}
      <section className="pub-container py-10 pb-16" id="signup">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div>
            <p className="kicker">Ready to start</p>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink-900 mt-3 leading-tight">
              Sign in or register — then run your first check-in.
            </h2>
            <p className="deck mt-4">
              Registration and sign-in live here too, so you can read how it works and
              jump straight in without leaving this page.
            </p>
            <Link href="/" className="btn-editorial-ghost mt-6">
              Back to the overview <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <AuthCard initialMode="signup" />
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
