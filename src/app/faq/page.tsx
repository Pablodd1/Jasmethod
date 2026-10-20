import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { PublicFAQ } from "@/components/public-knowledge";
export const metadata: Metadata = { title: "Daily coaching FAQs | JasMiamiMethod", description: "Answers about daily check-ins, wearables, HRV, coaching decisions and workout approval.", alternates: { canonical: "/faq" } };
export default function FAQPage() { return <div className="min-h-screen bg-paper"><SiteHeader /><main className="pub-container py-12 sm:py-16"><p className="kicker">Questions answered</p><h1 className="display-2xl mt-4">Daily coaching, without the guesswork.</h1><p className="deck mt-4 max-w-3xl">Clear answers about science, biometrics, privacy and the training process.</p><PublicFAQ /></main><SiteFooter /></div>; }
