import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/nutrition?days=7 — nutrition + hydration logs
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.min(30, parseInt(url.searchParams.get("days") || "7", 10));
  const since = new Date(Date.now() - days * 86400000);
  const [nutrition, hydration] = await Promise.all([
    prisma.nutritionLog.findMany({ where: { userId: user.id, date: { gte: since } }, orderBy: { date: "desc" } }),
    prisma.hydrationLog.findMany({ where: { userId: user.id, date: { gte: since } }, orderBy: { date: "desc" } }),
  ]);
  // Aggregate daily
  const daily: Record<string, any> = {};
  for (const n of nutrition) {
    const key = n.date.toISOString().slice(0, 10);
    daily[key] = daily[key] || { date: key, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0, meals: 0 };
    daily[key].calories += n.calories || 0;
    daily[key].proteinG += n.proteinG || 0;
    daily[key].carbsG += n.carbsG || 0;
    daily[key].fatG += n.fatG || 0;
    daily[key].waterMl += n.waterMl || 0;
    daily[key].meals += 1;
  }
  for (const h of hydration) {
    const key = h.date.toISOString().slice(0, 10);
    daily[key] = daily[key] || { date: key, calories: 0, proteinG: 0, carbsG: 0, fatG: 0, waterMl: 0, meals: 0 };
    daily[key].waterMl += h.ml;
  }
  return NextResponse.json({ daily: Object.values(daily).sort((a, b) => (a.date < b.date ? 1 : -1)), logs: { nutrition, hydration } });
}

// POST /api/nutrition — log food or water
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const date = new Date(body.date || new Date());
    if (body.type === "hydration") {
      const log = await prisma.hydrationLog.create({
        data: {
          userId: user.id,
          date,
          ml: parseInt(body.ml || "250", 10),
          source: body.source || "water",
        },
      });
      return NextResponse.json({ ok: true, log });
    }
    if (!body.food) return NextResponse.json({ error: "food required" }, { status: 400 });
    const log = await prisma.nutritionLog.create({
      data: {
        userId: user.id,
        date,
        meal: body.meal || "snack",
        food: body.food,
        calories: body.calories !== undefined ? parseInt(body.calories, 10) : undefined,
        proteinG: body.proteinG !== undefined ? parseFloat(body.proteinG) : undefined,
        carbsG: body.carbsG !== undefined ? parseFloat(body.carbsG) : undefined,
        fatG: body.fatG !== undefined ? parseFloat(body.fatG) : undefined,
        waterMl: body.waterMl !== undefined ? parseInt(body.waterMl, 10) : undefined,
      },
    });
    return NextResponse.json({ ok: true, log });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
