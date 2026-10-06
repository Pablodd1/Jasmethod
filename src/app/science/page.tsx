import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Apple, Moon, Pill, Waves, Zap } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { TOPIC_LIST } from "@/lib/topics";

export const metadata: Metadata = {
  title: "The Science — JasMiamiMethod",
  description:
    "Evidence and limits behind individualized training, HYROX, recovery, nutrition and supplements, with human-research references you can review.",
  alternates: { canonical: "/science" },
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
          Read the research behind our coaching approach and the limits of its application.
          Published human studies inform the protocol library; a JMM starting dose, scheduling
          rule or daily adjustment is a coaching choice, not proof that the complete app has
          been tested as an intervention.
        </p>
      </section>

      <section className="pub-container py-12">
        <div className="space-y-6 mb-10">
          <article id="individualization" className="card scroll-mt-24">
            <h2 className="font-display text-2xl font-bold">A purpose for each cycle, an individual dose</h2>
            <p className="mt-3 text-ink-700">Begin with the event or performance goal, training history, available time and sport-specific tests. Review the balance of easy endurance, harder work, strength and skill with your coach. Progress after checking what you completed and how you responded; a demanding session should earn its place in the cycle.</p>
            <p className="mt-3 text-ink-700">An 80/20 split is not a universal requirement. A 2025 analysis of 13 studies and 348 endurance athletes found no overall advantage of polarized over pyramidal training for maximal oxygen uptake or time-trial performance. Possible differences by athlete level support individual review rather than one mandatory ratio. <a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/39888556/">Rosenblat et al., 2025</a>.</p>
            <p className="mt-3 text-ink-700">Percentages need a definition: time in intensity zones and the number of hard sessions are different measures. Review the actual duration, targets and placement of sessions, including strength work, rather than chasing a percentage.</p>
          </article>
          <article id="recovery" className="card scroll-mt-24">
            <h2 className="font-display text-2xl font-bold">Recovery belongs in the schedule</h2>
            <p className="mt-3 text-ink-700">New-plan defaults reserve at least two off-days for beginners and one for intermediate and advanced athletes. Professionals have no fixed minimum, which does not mean they must train every day. These are JMM scheduling defaults, not scientifically proven recovery requirements. Availability, symptoms and the coach&apos;s review can require more rest.</p>
            <p className="mt-3 text-ink-700">On an appropriate recovery day, easy movement can be an option rather than an obligation. Sleep opportunity, regular meals, time with family and manageable daily commitments also deserve attention. Gentle breathing or visualization can support a relaxing routine; completing them does not establish that the autonomic nervous system has recovered.</p>
            <p className="mt-3 text-ink-700">Use subjective reports together with comparable measurements. HRV is one input, not a diagnosis or permission to ignore symptoms. A review found no statistically significant overall performance or peak oxygen-uptake advantage from HRV-guided training over predefined training. <a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/34489178/">Düking et al., 2021</a>.</p>
          </article>
          <article id="hyrox" className="card scroll-mt-24">
            <h2 className="font-display text-2xl font-bold">HYROX: assess running and stations separately</h2>
            <p className="mt-3 text-ink-700">Review your division, station loads, movement experience, equipment and available training days with your coach. Use your own running and station splits to identify priorities. A runner learning sled technique needs a different starting emphasis from an experienced strength athlete building running durability.</p>
            <p className="mt-3 text-ink-700">In a simulated Open event with 11 recreational athletes, running took more time than stations, and faster overall performance was associated with aerobic capacity and endurance training volume. This small observational study describes demands; it does not prove a particular training program or predict your result. <a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/40230601/">Brandt et al., 2025</a>.</p>
            <p className="mt-3 text-ink-700">JMM coaching application: develop station technique and strength at a manageable dose, build running consistency, and introduce combined practice when movement quality and recovery allow. Record both parts of the session and the effort you actually experienced. Review split-planner estimates against repeated comparable sessions; they are not validated race predictions.</p>
            <Link href="/how-it-works#hyrox" className="inline-block mt-4 underline font-semibold text-ocean-700">How to use this with your coach</Link>
          </article>
          <article id="fueling-context" className="card scroll-mt-24">
            <h2 className="font-display text-2xl font-bold">Fuel the work you are doing</h2>
            <p className="mt-3 text-ink-700">Discuss duration, intensity, meals before training, expected race time, gastrointestinal tolerance and conditions before choosing a carbohydrate target. Count total carbohydrate from all food, gels and drinks. A single grams-per-hour minimum is not appropriate for every session lasting over an hour.</p>
            <p className="mt-3 text-ink-700">Practice the proposed intake in training and record what you consumed and tolerated. Nutrition guidance should be individualized rather than copied from an elite athlete or a product label. <a className="underline" href="https://pubmed.ncbi.nlm.nih.gov/26891166/">Academy of Nutrition and Dietetics, Dietitians of Canada and ACSM position statement, 2016</a>.</p>
            <Link href="/science/race-fuel" className="inline-block mt-4 underline font-semibold text-ocean-700">Read the fueling evidence guide</Link>
          </article>
        </div>
        <Link href="/metrics" className="topic-nav-link mb-4"><div><h2 className="font-display text-xl font-bold">J Metrics: understand your training load</h2><p className="text-sm text-ink-600 mt-1">JStress, data quality, evidence and the limits of load trends</p></div><ArrowRight className="w-5 h-5" /></Link>
        <Link href="/protocols" className="topic-nav-link mb-4"><div><h2 className="font-display text-xl font-bold">Training protocols</h2><p className="text-sm text-ink-600 mt-1">Speed, power, strength, muscle growth and endurance · reviewed September 2026</p></div><ArrowRight className="w-5 h-5" /></Link>
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
              See how your profile, daily check-in, plan review and feedback fit together.
            </p>
          </div>
          <Link href="/how-it-works" className="btn-editorial shrink-0">
            How the check-in works <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
