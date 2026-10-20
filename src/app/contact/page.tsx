import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { PublicInquiryForm } from "@/components/public-inquiry-form";
import { PUBLIC_CONTACT_EMAIL } from "@/lib/public-contact";
export const metadata: Metadata = {
  title: "Contact JMM | Daily coaching questions and demonstrations",
  description: "Contact JasMiamiMethod about a daily-coaching demonstration, coaching questions or a collaboration. No medical data needed.",
  alternates: { canonical: "/contact" },
};
export default function ContactPage() {
  return <div className="min-h-screen bg-paper">
    <SiteHeader />
    <main className="pub-container py-12 sm:py-16 max-w-4xl">
      <p className="kicker">JasMiamiMethod · Contact</p>
      <h1 className="display-2xl mt-4">Let&apos;s talk about your training.</h1>
      <p className="deck max-w-2xl mt-4">Ask about the daily coaching experience, a product demonstration or a possible collaboration. Messages go to the JMM business contact, not the AI coaching conversation.</p>
      <div className="grid md:grid-cols-[1fr_1.6fr] mt-10 gap-6 items-start">
        <aside className="space-y-5">
          <div className="card p-5">
            <h2 className="font-display text-xl font-bold">Prefer a calendar?</h2>
            <p className="mt-2 text-sm text-ink-600">Visit the booking page. If live scheduling is not configured yet, the inquiry form remains available.</p>
            <Link href="/book" className="btn-secondary mt-4">Consultation booking →</Link>
          </div>
          <div className="card p-5">
            <h2 className="font-display text-lg font-bold">Business email</h2>
            <a className="underline text-ocean-700 break-all mt-2 inline-block" href={"mailto:" + PUBLIC_CONTACT_EMAIL}>{PUBLIC_CONTACT_EMAIL}</a>
            <p className="text-xs text-ink-500 mt-2">An email link opens a draft; it does not submit a message automatically.</p>
          </div>
        </aside>
        <PublicInquiryForm />
      </div>
    </main>
    <SiteFooter />
  </div>;
}
