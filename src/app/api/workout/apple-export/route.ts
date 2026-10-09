import { trainingAccess, errorResponse } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { SessionResolutionError } from "@/lib/canonical-session";
import { AppleWorkoutExportError } from "@/lib/apple-workout-export";
import { resolveAppleExport } from "@/lib/apple-export-request";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const payload = await resolveAppleExport(req, {
      access: () => trainingAccess(req), resolve: effectivePrescription,
    });
    return new Response(JSON.stringify(payload), { headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="jmm-workout.jmmworkout.json"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof SessionResolutionError || error instanceof AppleWorkoutExportError) return Response.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
