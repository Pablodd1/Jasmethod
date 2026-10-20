import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { PublicBlogIndex } from "@/components/public-knowledge";
export const metadata: Metadata = { title: "Science of daily coaching | JMM articles", description: "Evidence-qualified guides to personalized endurance training, HRV, sleep, daily check-ins and adaptive coaching.", alternates: { canonical: "/blog" } };
export default function BlogPage() { return <div className="min-h-screen bg-paper"><SiteHeader /><main className="pub-container py-12 sm:py-16"><p className="kicker">JMM · Science in practice</p><h1 className="display-2xl mt-4">Better questions. Better training decisions.</h1><p className="deck mt-5 max-w-3xl">Short, research-linked guides to the daily decisions behind personalized swim, bike, run, HYROX and triathlon coaching. No guaranteed outcomes.</p><PublicBlogIndex /></main><SiteFooter /></div>; }
