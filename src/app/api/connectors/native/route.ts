import { getCorosConnectionStatus } from "@/lib/coros-oauth";
import { getCurrentUser } from "@/lib/auth";
import { nativeDeviceCapabilities } from "@/lib/native-device-capabilities";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const capabilities = nativeDeviceCapabilities();
    const status = await getCorosConnectionStatus(user.id);
    return Response.json({ ...capabilities, coros: { ...capabilities.coros, ...status } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Connection status is unavailable. Please retry." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
