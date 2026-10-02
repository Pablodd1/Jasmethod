import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
// Numeric Telegram replies lack verified session/date mapping and confirmation.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ error: "Telegram reply-based feedback is unavailable. Record actual minutes, effort and symptoms for the selected session in the app.", appPath: "/daily" }, { status: 410 });
}
