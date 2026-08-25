import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseDnaRaw, normalizeGenotype, type DNAVariantRaw } from "@/lib/importers";
import { DNA_TRAITS } from "@/lib/science";

// GET /api/dna — list user's DNA uploads
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await prisma.geneticResult.findMany({
    where: { userId: user.id },
    include: { variants: true },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json({ results });
}

// POST /api/dna — upload raw DNA file (multipart: provider, file)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const provider = String(form.get("provider") || "raw");
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    const text = await file.text();
    const variants = parseDnaRaw(text);
    if (variants.length === 0) {
      return NextResponse.json({ error: "No valid DNA variants found. Expected 23andMe or Ancestry raw format (tab-separated rsid)." }, { status: 400 });
    }

    // Match against known sport-relevant traits
    const byRsid = new Map<string, DNAVariantRaw>();
    for (const v of variants) byRsid.set(v.rsid, v);

    const analyzed: any[] = [];
    for (const trait of DNA_TRAITS) {
      const raw = byRsid.get(trait.rsid);
      if (!raw) continue;
      const genotype = normalizeGenotype(trait.rsid, raw.genotype);
      const match = trait.pairs[genotype] || trait.pairs[genotype.split("").reverse().join("")];
      analyzed.push({
        rsid: trait.rsid,
        gene: trait.gene,
        trait: trait.trait,
        genotype,
        impact: match?.impact || "neutral",
        note: match?.note || `Genotype ${genotype} — limited evidence.`,
      });
    }

    const result = await prisma.geneticResult.create({
      data: {
        userId: user.id,
        provider,
        fileName: file.name || null,
        summary: JSON.stringify({ totalVariants: variants.length, analyzedTraits: analyzed.length }),
        variants: {
          create: analyzed.map((a) => ({
            rsid: a.rsid,
            gene: a.gene,
            genotype: a.genotype,
            trait: a.trait,
            impact: a.impact,
            note: a.note,
          })),
        },
      },
      include: { variants: true },
    });

    return NextResponse.json({
      ok: true,
      result,
      stats: { totalVariants: variants.length, analyzedTraits: analyzed.length },
    });
  } catch (e: any) {
    console.error("dna upload error:", e);
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}
