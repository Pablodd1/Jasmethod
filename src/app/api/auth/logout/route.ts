import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { destroySession } from "@/lib/auth";

export async function POST() {
  const store = cookies();
  const token = store.get("jmm_session")?.value;
  if (token) await destroySession(token);
  store.delete("jmm_session");
  return NextResponse.json({ ok: true });
}
