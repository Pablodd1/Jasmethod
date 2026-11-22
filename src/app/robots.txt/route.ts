import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_APP_URL || "https://jasmiamimethod.fit";

export async function GET() {
  const disallowed = [
    "/api/",
    "/today",
    "/daily",
    "/dashboard",
    "/checkin",
    "/calendar",
    "/training",
    "/settings",
    "/connectors",
    "/races",
    "/admin",
    "/onboard",
  ];
  const disallowLines = disallowed.map((p) => `Disallow: ${p}`).join("\n");
  const aiBots = [
    "GPTBot",
    "OAI-SearchBot",
    "ChatGPT-User",
    "PerplexityBot",
    "ClaudeBot",
    "Google-Extended",
    "Applebot-Extended",
  ];
  const aiBlocks = aiBots
    .map(
      (bot) =>
        `User-agent: ${bot}\nAllow: /\nAllow: /llms.txt\nAllow: /sitemap.xml\n${disallowLines}`
    )
    .join("\n\n");

  const txt = `User-agent: *
Allow: /
Allow: /llms.txt
Allow: /sitemap.xml
${disallowLines}

${aiBlocks}

Sitemap: ${BASE}/sitemap.xml
`;
  return new NextResponse(txt, {
    headers: { "Content-Type": "text/plain", "Cache-Control": "public, max-age=86400" },
  });
}
