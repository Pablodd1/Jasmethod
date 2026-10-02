import { trainingAccess, errorResponse } from "@/lib/access";

export const dynamic = "force-dynamic";

// Retired: Garmin Connect does not provide the advertised JSON workout import.
// Keep an explicit authenticated response for old bookmarked URLs.
export async function GET(req: Request) {
  try {
    await trainingAccess(req);
    return Response.json({
      error: "Garmin JSON workout import is not supported. Open your daily session and download its FIT file for a compatible device's manual USB transfer.",
    }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
