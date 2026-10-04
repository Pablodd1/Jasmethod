import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "How to use training load without chasing a score — JasMiamiMethod",
  description: "The research behind session-RPE, practical JStress examples, and why load trends need context rather than universal readiness thresholds.",
  alternates: { canonical: "/science/j-metrics" },
};

export default function JMetricsArticle() {
  return <div className="min-h-screen bg-paper">
    <SiteHeader />
    <main className="pub-container py-12 sm:py-16 text-ink-900">
      <article className="max-w-3xl mx-auto space-y-8 leading-relaxed">
        <header>
          <p className="kicker">The Science · Training load</p>
          <h1 className="display-2xl mt-4">A useful training score starts a conversation.</h1>
          <p className="deck mt-5">JStress describes how much work you reported. Your goal, sport and response explain what to do with it.</p>
        </header>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">The evidence behind the number</h2>
          <p>Foster and colleagues tested a session rating of perceived exertion approach in human cycling and basketball exercise. Its relationship with a heart-rate method supported its use for quantifying training across those settings, although the absolute scores differed. <a className="underline underline-offset-4" href="https://pubmed.ncbi.nlm.nih.gov/11708692/">Foster et al., 2001</a>.</p>
          <p>JMM calls completed minutes multiplied by whole-session RPE “JStress,” in arbitrary units. That is a presentation name for session-RPE load. It does not make the method proprietary or prove that a particular JMM training recommendation will improve your performance.</p>
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">The same score can describe different sessions</h2>
          <p>Consider two illustrative logs: 60 minutes at RPE 3 and 30 minutes at RPE 6 both give 180 AU. The number alone cannot tell whether you trained endurance, speed, technical skill or strength. It also cannot distinguish the tissue loading of running from cycling.</p>
          <p>A coach should preserve the purpose of the session. Record interval pace or power, sets and repetitions, technique, completion, pain and how you felt afterward. Use sport-specific tests to evaluate adaptation; do not make “increase JStress” the training goal.</p>
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">Trends describe history; they do not diagnose readiness</h2>
          <p>J Base and J Recent smooth daily session-RPE load using slower 42-day and faster 7-day settings. J Balance is their difference. These settings are model choices. They are not measurements of fitness, fatigue or a personal safe training limit.</p>
          <p>Research in recreational runners shows that different ways of calculating load changes can yield different answers. A chart’s formula matters, and one model should not be substituted for another without explanation. <a className="underline underline-offset-4" href="https://pubmed.ncbi.nlm.nih.gov/38291782/">Comparison of training-load calculation methods, 2024</a>.</p>
          <p>A negative balance calls for context, not an automatic rest day. A positive balance does not clear someone with pain or illness to train. Missing sessions or a short history can distort both. There is no JMM claim that these four metrics predict injury or establish an optimal race-day value.</p>
          <p>JMM keeps an unrecorded day unknown, rather than treating it as rest. The trend restarts after a gap: J Recent requires 7 consecutive known days, and J Base and J Balance require 42. These display rules make incomplete history visible; they are not biological cutoffs. The <Link className="underline underline-offset-4" href="/metrics">method guide</Link> includes the exact formula and rest-day rule.</p>
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">What a transparent daily coaching explanation looks like</h2>
          <p className="text-sm font-semibold">Illustrative wording, not an assessment of your account:</p>
          <blockquote className="border-l-4 border-ink-400 pl-5">“You reported 45 minutes at effort 4 yesterday: 180 AU. Today’s choice also depends on your symptoms, sleep and the purpose of the next quality session. Two recent sessions have no effort rating, so I cannot describe your full recent load. Please complete those reports before interpreting the trend.”</blockquote>
          <p>An AI coach should identify source dates, missing inputs and the reason for an adjustment. Athletes and coaches should be able to correct mistaken inputs. A plan estimate, imported provider score and completed session report must remain distinguishable.</p>
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-2xl font-bold">A practical review after each session</h2>
          <ol className="list-decimal pl-6 space-y-3">
            <li>Save actual duration and a consistent whole-session RPE.</li>
            <li>Check whether the intended session purpose was achieved.</li>
            <li>Record unusual pain, symptoms, sleep disruption or environmental conditions.</li>
            <li>Review the trend with these details before changing the next session.</li>
          </ol>
          <p>With no device, these reports still give useful information. With a device, they add context that a sensor cannot supply by itself.</p>
        </section>
        <p><Link className="underline underline-offset-4 font-semibold" href="/metrics">View the J Metrics definitions and data rules →</Link></p>
      </article>
    </main>
    <SiteFooter />
  </div>;
}
