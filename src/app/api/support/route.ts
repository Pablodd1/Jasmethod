import { NextResponse } from "next/server";
import { supportContacts } from "@/lib/support-contact";
import { deliverSupportMessage, parseSupportMessage, supportTelegramConfigured } from "@/lib/support-delivery";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Public so athletes can find help before they can sign in.
export function GET() {
  return NextResponse.json({ ...supportContacts(process.env), telegramSupportAvailable: supportTelegramConfigured() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Open the support form on this website." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to send a support message, or use the public email link." }, { status: 401 });
  if (!supportTelegramConfigured()) return NextResponse.json({ error: "The support delivery channel is unavailable. Use the email link if available." }, { status: 503 });
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  try {
    // Bound streamed input even when content-length is omitted or dishonest.
    const reader = req.body?.getReader();
    if (!reader) return NextResponse.json({ error: "A message is required." }, { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 8192) { await reader.cancel(); return NextResponse.json({ error: "Message too large." }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    let body: unknown;
    try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return NextResponse.json({ error: "Invalid message." }, { status: 400 }); }
    const input = parseSupportMessage(body);
    if (!input) return NextResponse.json({ error: "Select a topic and enter a message between 10 and 1,500 characters." }, { status: 400 });
    const event = await prisma.$transaction(async tx => {
      // Serialize reservations across instances; failed attempts also count.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const recent = await tx.appEvent.count({ where: { userId: user.id, route: "/api/support", createdAt: { gte: new Date(Date.now() - 3600000) } } });
      if (recent >= 3) return null;
      return tx.appEvent.create({ data: { userId: user.id, source: "server", kind: "info", route: "/api/support", message: "Support delivery attempted", meta: JSON.stringify({ category: input.category, status: "pending" }) } });
    });
    if (!event) return NextResponse.json({ error: "You can send up to three support messages per hour. Try later or use email." }, { status: 429, headers: { "Retry-After": "3600" } });
    const receipt = await deliverSupportMessage({ ...input, replyEmail: user.email });
    await prisma.appEvent.update({ where: { id: event.id }, data: { message: receipt ? "Support accepted by Telegram" : "Support delivery unconfirmed", meta: JSON.stringify({ category: input.category, status: receipt ? "accepted" : "unconfirmed", receipt }) } });
    if (!receipt) return NextResponse.json({ error: "We could not confirm Telegram delivery. Use email or try again later; the message may already have arrived." }, { status: 502 });
    return NextResponse.json({ ok: true, message: "Telegram accepted your message for the JMM team. This does not confirm it has been read; a response can be sent to your account email." });
  } catch {
    return NextResponse.json({ error: "We could not confirm delivery. Use email or try later; avoid repeatedly sending the same message." }, { status: 500 });
  }
}
