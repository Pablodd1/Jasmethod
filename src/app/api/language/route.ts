import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LANGS } from "@/lib/i18n";

// GET /api/language — current language + available languages
export async function GET() {
  const user = await getCurrentUser();
  const current = (user?.language || "en") as string;
  return NextResponse.json({ language: current, langs: LANGS });
}

// PUT /api/language — set the user's language
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    const lang = String(b.language || "en");
    if (!LANGS.some((l) => l.code === lang)) return NextResponse.json({ error: "Unsupported language" }, { status: 400 });
    const updated = await prisma.user.update({ where: { id: user.id }, data: { language: lang } });
    return NextResponse.json({ ok: true, language: updated.language });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
