import { getCurrentUser } from "@/lib/auth";
import { nativeDeviceCapabilities } from "@/lib/native-device-capabilities";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!await getCurrentUser()) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  return Response.json(nativeDeviceCapabilities(), { headers: { "Cache-Control": "private, no-store" } });
}
