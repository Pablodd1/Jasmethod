import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { TOPICS, TOPIC_LIST, type TopicSlug } from "@/lib/topics";

const SLUGS = Object.keys(TOPICS) as TopicSlug[];

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const topic = TOPICS[params.slug as TopicSlug];
  if (!topic) return { title: "Not found — JasMiamiMethod" };
  return {
    title: `${topic.title} — The Science — JasMiamiMethod`,
    description: topic.subtitle,
  };
}

export default function TopicPage({ params }: { params: { slug: string } }) {
  const topic = TOPICS[params.slug as TopicSlug];
  if (!topic) notFound();

  // prev / next navigation across the five guides
  const idx = SLUGS.indexOf(topic.slug);
  const prev = idx > 0 ? TOPICS[SLUGS[idx - 1]] : null;
  const next = idx < SLUGS.length - 1 ? TOPICS[SLUGS[idx + 1]] : null;

  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader />

      {/* Article header */}
      <header className="border-b border-ink-200/70">
        <div className="pub-container py-12 sm:py-16">
          <p className="kicker">
            {topic.index} / 05 · {topic.kicker}
          </p>
          <h1 className="display-2xl mt-4 max-w-3xl">{topic.title}</h1>
          <p className="lede mt-5 max-w-2xl">{topic.subtitle}</p>

          {/* Metric glance */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-10">
            {topic.glance.map((m) => (
              <div key={m.label} className="metric-card">
                <div className="metric-value">{m.value}</div>
                <div className="metric-unit mt-0.5">{m.unit}</div>
                <div className="micro mt-2 !text-ink-500">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="pub-container py-10">
        <div className="grid lg:grid-cols-[1fr_260px] gap-12">
          <article className="prose-editorial max-w-2xl">
            <p className="dropcap text-lg">{topic.lede}</p>

            {topic.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            {/* Protocol callout */}
            <aside className="rounded-2xl border border-vermillion-400/40 bg-vermillion-400/5 p-6 my-8">
              <h3 className="!mt-0">{topic.protocol.title}</h3>
              <p>{topic.protocol.body}</p>
            </aside>

            {/* App tie — the concrete consequence */}
            <section>
              <h2>How the app applies this</h2>
              <p>{topic.appTie}</p>
            </section>

            {/* Citations */}
            <section>
              <h2>Evidence</h2>
              <ul className="!list-none !pl-0 !space-y-1.5">
                {topic.cites.map((c) => (
                  <li key={c} className="cite flex items-start gap-2">
                    <span className="text-vermillion-500 mt-0.5">›</span> {c}
                  </li>
                ))}
              </ul>
            </section>
          </article>

          {/* Sidebar / index */}
          <aside className="lg:sticky lg:top-24 h-fit">
            <p className="micro mb-4 !text-ink-400">The five guides</p>
            <nav className="space-y-1">
              {TOPIC_LIST.map((t) => (
                <Link
                  key={t.slug}
                  href={`/science/${t.slug}`}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    t.slug === topic.slug
                      ? "bg-ink-900 text-paper font-semibold"
                      : "text-ink-600 hover:bg-white hover:text-ink-900"
                  }`}
                >
                  <span className="font-mono text-xs opacity-60">{t.index}</span>
                  {t.title}
                  {t.slug === topic.slug && <Check className="w-3.5 h-3.5 ml-auto" />}
                </Link>
              ))}
            </nav>

            <div className="rounded-2xl border border-ink-200 bg-white p-5 mt-6">
              <p className="text-sm font-semibold text-ink-900">Put it into practice</p>
              <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">
                The daily check-in turns these rules into today&apos;s session, fuel and
                ergogenic picks.
              </p>
              <Link href="/onboarding" className="btn-editorial mt-4 w-full !px-4 !py-2.5 text-sm">
                How the check-in works
              </Link>
            </div>
          </aside>
        </div>

        {/* Prev / next */}
        <div className="flex items-stretch gap-3 mt-16 pt-6 border-t border-ink-200">
          {prev ? (
            <Link
              href={`/science/${prev.slug}`}
              className="flex-1 group rounded-2xl border border-ink-200 bg-white p-5 hover:border-vermillion-500"
            >
              <span className="micro !text-ink-400">← Previous</span>
              <span className="block font-display font-bold text-ink-900 mt-1">{prev.title}</span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          <Link
            href="/science"
            className="flex items-center justify-center rounded-2xl border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-700 hover:border-ink-900"
          >
            Index
          </Link>
          {next ? (
            <Link
              href={`/science/${next.slug}`}
              className="flex-1 group rounded-2xl border border-ink-200 bg-white p-5 text-right hover:border-vermillion-500"
            >
              <span className="micro !text-ink-400">Next →</span>
              <span className="block font-display font-bold text-ink-900 mt-1">{next.title}</span>
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
