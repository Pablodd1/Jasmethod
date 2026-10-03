import { NextResponse } from "next/server";
import { signInBase, signInConfig, signInLabels, signInProviders } from "@/lib/sign-in-config";
export const dynamic = "force-dynamic";
export function GET(req: Request) {
  let base = "";
  try { base = signInBase(req); } catch { /* Do not expose credentials. */ }
  return NextResponse.json({ providers: signInProviders.map(id => ({ id, label: signInLabels[id],
    available: !!base && !!signInConfig(id) && (id !== "apple" || base.startsWith("https:")),
  })) }, { headers: { "Cache-Control": "no-store" } });
}
