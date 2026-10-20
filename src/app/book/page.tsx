import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { verifiedBookingUrl } from "@/lib/public-booking";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Book a JMM consultation | JasMiamiMethod",
  description: "Book a conversation about personalized daily endurance coaching when live scheduling is configured, or request contact by email.",
  alternates: { canonical: "/book" },
};
export default function BookingPage() {
  const bookingUrl = verifiedBookingUrl(process.env.NEXT_PUBLIC_CAL_BOOKING_URL);
  return <div className="min-h-screen bg-paper">
    <SiteHeader />
    <main className="pub-container max-w-5xl py-12 sm:py-16">
      <p className="kicker">JasMiamiMethod · Conversation</p>
      <h1 className="display-2xl mt-4">Explore a daily-coaching consultation</h1>
      <p className="deck mt-4 max-w-3xl">See whether JMM suits your goals, sports and training routine. A request is not a scheduled appointment until the booking service confirms it.</p>
      {bookingUrl ? <section className="mt-9">
        <p className="text-sm text-ink-600 mb-4">The calendar below is hosted by Cal.com. Availability, confirmation and scheduling data are managed by that service.</p>
        <iframe title="JMM consultation booking calendar hosted by Cal.com" src={bookingUrl} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" className="w-full min-h-[730px] rounded-2xl border border-ink-200 bg-white" />
        <p className="mt-4 text-sm">Calendar not loading? <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="underline text-ocean-700 font-semibold">Open the booking page directly</a>.</p>
      </section> : <section role="status" className="card mt-10 p-8 max-w-2xl">
        <h2 className="font-display font-bold text-xl">Live appointment selection is not connected yet.</h2>
        <p className="text-sm text-ink-600 mt-3">We will not show invented times or suggest that a reservation was created. You can still request a conversation through the contact page.</p>
        <Link className="btn-primary mt-6" href="/contact">Request a conversation →</Link>
      </section>}
      <p className="mt-8 text-sm text-ink-500">JMM is a training-coaching service, not medical care. Please do not submit sensitive health information through the booking provider.</p>
    </main>
    <SiteFooter />
  </div>;
}
