import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// sitemap.xml — public pages only (no athlete/app surfaces: they are gated
// and carry no indexable content).
const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit";

export async function GET() {
  const now = new Date().toISOString().slice(0, 10);
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
    { loc: `${BASE}/login`, priority: "0.6" },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${now}</lastmod><priority>${u.priority}</priority></url>`).join("\n")}
</urlset>`;
  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=86400" },
  });
}
