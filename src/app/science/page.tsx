import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Apple, Moon, Pill, Waves, Zap } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { TOPIC_LIST } from "@/lib/topics";

export const metadata: Metadata = {
  title: "The Science — JasMiamiMethod",
  description:
    "Five evidence field guides: Supplements, Ergogenic Aids, Sleep, Nutrition, and Race & Training Fuel — each grounded in cited post-2000 human-performance research.",
};

const ICONS: Record<string, typeof Pill> = {
  supplements: Pill,
  "ergogenic-aids": Zap,
  sleep: Moon,
  nutrition: Apple,
  "race-fuel": Waves,
};

export default function ScienceIndexPage() {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      <section className="pub-container pt-14 sm:pt-20">
        <p className="kicker">The Science · Index</p>
        <h1 className="display-2xl mt-4 max-w-3xl">
          Five field guides. One evidence standard.
        </h1>
        <p className="deck mt-5 max-w-2xl">
          Every recommendation in JasMiamiMethod traces to a cited study. These guides are
          the public versions of the rules the engine uses — written with the author–year
          evidence right on the page.
        </p>
      </section>

      <section className="pub-container py-12">
        <div className="space-y-2">
          {TOPIC_LIST.map((topic) => {
            const Icon = ICONS[topic.slug] ?? Pill;
            return (
              <Link
                key={topic.slug}
                href={`/science/${topic.slug}`}
                className="topic-nav-link group"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm text-ink-300">{topic.index}</span>
                  <Icon className="w-5 h-5 text-vermillion-500" />
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-bold text-ink-900 group-hover:text-vermillion-600">
                      {topic.title}
                    </h2>
                    <p className="text-sm text-ink-600 mt-0.5">{topic.subtitle}</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-ink-300 group-hover:text-vermillion-500 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            );
          })}
        </div>

        <div className="rounded-2xl border border-ink-200 bg-white p-6 mt-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-ink-900">
              Want to see how the engine uses this?
            </h2>
            <p className="text-sm text-ink-600 mt-1">
              The daily check-in is the mechanism — read how each answer becomes a verdict.
            </p>
          </div>
          <Link href="/onboarding" className="btn-editorial shrink-0">
            How the check-in works <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
