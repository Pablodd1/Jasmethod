"use client";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { COACH_FAQS, INSIGHTS, type Insight } from "@/lib/public-coaching-content";

export function PublicFAQ() {
  const { language } = useAuth();
  const es = language === "es";
  const lang = es ? "es" : "en";
  return <section className="max-w-3xl mt-8 space-y-3">
    {COACH_FAQS.map(item => <details className="card p-5" key={item.q.en}>
      <summary className="font-display font-semibold cursor-pointer focus-visible:outline focus-visible:outline-2">{item.q[lang]}</summary>
      <p className="text-sm leading-relaxed text-ink-600 mt-3">{item.a[lang]}</p>
    </details>)}
    <p className="mt-8 text-sm text-ink-600">{es ? "¿Otra pregunta?" : "Another question?"} <Link href="/contact" className="underline text-ocean-700">{es ? "Contacta al equipo" : "Contact the team"}</Link>.</p>
  </section>;
}
export function PublicBlogIndex() {
  const { language } = useAuth();
  const lang = language === "es" ? "es" : "en";
  return <div className="grid md:grid-cols-3 gap-5 mt-10">
    {INSIGHTS.map((article, i) => <article key={article.slug} className="card p-6 flex flex-col">
      <p className="kicker">{lang === "es" ? "Lectura" : "Guide"} 0{i + 1}</p>
      <h2 className="font-display text-xl font-bold mt-4">{article.title[lang]}</h2>
      <p className="text-sm text-ink-600 leading-relaxed mt-3 flex-1">{article.intro[lang]}</p>
      <Link className="mt-6 underline text-ocean-700 font-semibold text-sm" href={"/blog/" + article.slug}>{lang === "es" ? "Leer la guía" : "Read the guide"} →</Link>
    </article>)}
  </div>;
}
export function PublicBlogArticle({ article }: { article: Insight }) {
  const { language } = useAuth();
  const lang = language === "es" ? "es" : "en";
  return <article className="max-w-3xl">
    <Link className="text-sm text-ocean-700 underline" href="/blog">← {lang === "es" ? "Todas las guías" : "All guides"}</Link>
    <h1 className="display-2xl mt-5">{article.title[lang]}</h1>
    <p className="deck mt-4">{article.intro[lang]}</p>
    {article.sections.map((section, i) => <section className="mt-9" key={i}>
      <h2 className="font-display text-2xl font-bold text-ink-900">{section.heading[lang]}</h2>
      <p className="mt-3 text-ink-700 leading-relaxed">{section.body[lang]}</p>
    </section>)}
    <section className="border-t border-ink-200 mt-11 pt-6">
      <h2 className="font-display text-xl font-bold">{lang === "es" ? "Fuentes y límites" : "Evidence and limitations"}</h2>
      <p className="text-sm text-ink-600 mt-2">{lang === "es" ? "Referencias de investigación externa; no son una validación clínica ni un estudio de eficacia de JMM." : "External research references. They do not validate JMM clinically or establish product efficacy."}</p>
      <ul className="list-disc pl-5 mt-4 space-y-2 text-sm">{article.references.map(ref =>
        <li key={ref.url}><a href={ref.url} target="_blank" rel="noopener noreferrer" className="underline text-ocean-700">{ref.title}</a></li>)}</ul>
    </section>
    <div className="card p-6 mt-12">
      <h2 className="font-display text-xl font-bold">{lang === "es" ? "¿Quieres ver cómo funciona en tu rutina?" : "Want to see how it fits your training?"}</h2>
      <div className="flex flex-wrap gap-3 mt-4"><Link className="btn-primary" href="/book">{lang === "es" ? "Ver calendario" : "Consultation calendar"}</Link><Link className="btn-secondary" href="/contact">{lang === "es" ? "Enviar consulta" : "Send an inquiry"}</Link></div>
    </div>
  </article>;
}
