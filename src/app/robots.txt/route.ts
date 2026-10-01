import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit";

export async function GET() {
  const txt = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /today
Disallow: /daily
Disallow: /dashboard
Disallow: /checkin
Disallow: /calendar
Disallow: /training
Disallow: /settings
Disallow: /connectors
Disallow: /races
Disallow: /admin
Disallow: /onboard

Sitemap: ${BASE}/sitemap.xml
`;
  return new NextResponse(txt, {
    headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" },
  });
}
