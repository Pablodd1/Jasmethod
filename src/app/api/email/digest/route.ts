import { getCurrentUser } from "@/lib/auth";
// Legacy digest has neither verified-recipient nor purpose-specific consent.
// Preserve the endpoint as an explicit safe failure; it must not bypass the
// mock-only communications transport by calling SMTP directly.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ error: "External coaching email is disabled pending verified-recipient, purpose-consent and privacy review." }, { status: 503 });
}
