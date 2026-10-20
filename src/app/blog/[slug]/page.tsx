import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { PublicBlogArticle } from "@/components/public-knowledge";
import { INSIGHTS } from "@/lib/public-coaching-content";
export function generateStaticParams() { return INSIGHTS.map(item => ({ slug: item.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = INSIGHTS.find(item => item.slug === slug);
  if (!article) return { title: "Guide not found | JMM" };
  return { title: article.title.en + " | JasMiamiMethod", description: article.intro.en, alternates: { canonical: "/blog/" + slug } };
}
export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = INSIGHTS.find(item => item.slug === slug);
  if (!article) notFound();
  return <div className="min-h-screen bg-paper"><SiteHeader /><main className="pub-container py-12 sm:py-16"><PublicBlogArticle article={article} /></main><SiteFooter /></div>;
}
