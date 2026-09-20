import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { athlinksConfigured, searchAthletes } from "@/lib/athlinks";

export const dynamic = "force-dynamic";

// GET /api/connectors/athlinks/search?q=jasmel+acosta — candidate athlete
// profiles for the one-time identity confirmation. Server-side API key only;
// the client never sees it.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`athlinks-search:${user.id}`, 10, 60000).ok)
    return NextResponse.json({ error: "Please wait a moment." }, { status: 429 });
  if (!athlinksConfigured())
    return NextResponse.json(
      { error: "Athlinks is not configured on the server (ATHLINKS_API_KEY)." },
      { status: 503 },
    );
  const q = new URL(req.url).searchParams.get("q")?.trim() || "";
  if (q.length < 3)
    return NextResponse.json({ ok: true, athletes: [] });
  try {
    const athletes = await searchAthletes(q);
    return NextResponse.json({ ok: true, athletes: athletes.slice(0, 10) });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Athlinks search failed").slice(0, 200) },
      { status: 500 },
    );
  }
}
