import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { PUBLIC_CONTACT_EMAIL } from "@/lib/public-contact";
import { INQUIRY_MAX_BYTES, inquiryEmailText, parsePublicInquiry } from "@/lib/public-inquiry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const attempts = new Map<string, number[]>();

// Best-effort per-instance abuse guard. A distributed limiter / CAPTCHA is needed at scale.
function allowed(request: Request): boolean {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const key = ip.slice(0, 70) + ":" + (request.headers.get("user-agent") || "").slice(0, 60);
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(t => now - t < 3600000);
  if (attempts.size > 500) attempts.clear();
  if (recent.length >= 3) { attempts.set(key, recent); return false; }
  recent.push(now);
  attempts.set(key, recent);
  return true;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json({ ok: false, error: "Open this form on the JMM website." }, { status: 403, headers: noStore });
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 415, headers: noStore });

  // Fail closed when SMTP is unconfigured; the page offers an explicit mailto draft instead.
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM ||
      !process.env.SMTP_USER || !process.env.SMTP_PASS)
    return NextResponse.json({ ok: false, error: "Online delivery is not configured. Please use the email option below.", code: "delivery_unavailable" }, { status: 503, headers: noStore });
  const reader = req.body?.getReader();
  if (!reader) return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400, headers: noStore });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > INQUIRY_MAX_BYTES) {
      await reader.cancel();
      return NextResponse.json({ ok: false, error: "Message too large." }, { status: 413, headers: noStore });
    }
    chunks.push(chunk.value);
  }
  let payload: unknown;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return NextResponse.json({ ok: false, error: "Invalid message." }, { status: 400, headers: noStore }); }
  const data = parsePublicInquiry(payload);
  if (!data) return NextResponse.json({ ok: false, error: "Please check the fields and privacy consent." }, { status: 400, headers: noStore });
  if (!allowed(req)) return NextResponse.json({ ok: false, error: "Message limit reached. Please use the email option.", code: "rate_limited" }, { status: 429, headers: { ...noStore, "Retry-After": "3600" } });

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    requireTLS: process.env.SMTP_SECURE !== "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  try {
    const receipt = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: PUBLIC_CONTACT_EMAIL,
      replyTo: data.email,
      subject: "JMM website inquiry: " + data.topic,
      text: inquiryEmailText(data),
    });
    const accepted = (receipt.accepted || []).some((a: string | { address: string }) =>
      (typeof a === "string" ? a : a.address).toLowerCase() === PUBLIC_CONTACT_EMAIL.toLowerCase());
    if (!accepted) return NextResponse.json({ ok: false, error: "Delivery was not confirmed. Please use email; your message may already have been accepted." }, { status: 502, headers: noStore });
    return NextResponse.json({ ok: true, message: "Your inquiry was accepted by our mail provider. This does not confirm it has reached the inbox." }, { headers: noStore });
  } catch {
    return NextResponse.json({ ok: false, error: "Delivery could not be confirmed. Please use email instead; do not repeatedly resubmit." }, { status: 502, headers: noStore });
  } finally {
    transport.close();
  }
}
