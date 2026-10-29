import { NextResponse } from "next/server";
import { LOCALIZED_PUBLIC_PATHS,PUBLIC_SITE_ORIGIN,publicHref } from "@/lib/public-routes";

export const dynamic = "force-dynamic";

// sitemap.xml — public pages only (no athlete/app surfaces: they are gated
// and carry no indexable content).
const BASE = PUBLIC_SITE_ORIGIN;

export async function GET() {
  const urls = [
    { loc: `${BASE}/`, priority: "1.0" },
    { loc: `${BASE}/science`, priority: "0.9" },
    { loc: `${BASE}/metrics`, priority: "0.8" },
    { loc: `${BASE}/science/j-metrics`, priority: "0.8" },
    { loc: `${BASE}/how-it-works`, priority: "0.8" },
    { loc: `${BASE}/race-prediction`, priority: "0.8" },
    { loc: `${BASE}/personal-coaching`, priority: "0.8" },
    { loc: `${BASE}/privacy`, priority: "0.3" },
    { loc: `${BASE}/terms`, priority: "0.3" },
    { loc: `${BASE}/policies`, priority: "0.3" },
    { loc: `${BASE}/cookies`, priority: "0.3" },
    { loc: `${BASE}/data-rights`, priority: "0.3" },
    { loc: `${BASE}/help`, priority: "0.5" },
    { loc: `${BASE}/contact`, priority: "0.8" },
    { loc: `${BASE}/book`, priority: "0.7" },
    { loc: `${BASE}/faq`, priority: "0.8" },
    { loc: `${BASE}/blog`, priority: "0.8" },
    { loc: `${BASE}/blog/why-a-daily-coach-needs-context`, priority: "0.7" },
    { loc: `${BASE}/blog/how-to-read-hrv-and-recovery`, priority: "0.7" },
    { loc: `${BASE}/blog/sleep-stress-and-personalized-training`, priority: "0.7" },
  ];
  for(const path of LOCALIZED_PUBLIC_PATHS){
    if(!urls.some(u=>u.loc===BASE+path))urls.push({loc:BASE+path,priority:"0.7"});
    urls.push({loc:BASE+publicHref("es",path),priority:"0.7"});
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => {const path=new URL(u.loc).pathname;const basePath=path==="/es"?"/":path.startsWith("/es/")?path.slice(3):path;const localized=(LOCALIZED_PUBLIC_PATHS as readonly string[]).includes(basePath);return `  <url><loc>${u.loc}</loc>${localized?`<xhtml:link rel="alternate" hreflang="en" href="${BASE+basePath}"/><xhtml:link rel="alternate" hreflang="es" href="${BASE+publicHref("es",basePath)}"/>`:""}<priority>${u.priority}</priority></url>`;}).join("\n")}
</urlset>`;
  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=86400" },
  });
}
