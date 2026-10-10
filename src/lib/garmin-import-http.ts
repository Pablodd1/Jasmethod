import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { ApiError, errorResponse } from "./access";
import { confirmGarminImport, previewGarminImport, type GarminImportInput } from "./garmin-import-service";
import { GARMIN_FILE_MAX_BYTES } from "./garmin-file-import";
const LIMIT = GARMIN_FILE_MAX_BYTES;
export async function garminImportHttp(req: Request, confirm: boolean) {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ApiError("Sign in to preview or import your activity file.", 401);
    // This athlete-owned path never accepts an athleteId override.
    if (new URL(req.url).searchParams.has("athleteId")) throw new ApiError("Import into your own account only.", 403);
    const length = Number(req.headers.get("content-length"));
    if (Number.isFinite(length) && length > LIMIT + 64 * 1024) throw new ApiError("File exceeds 10 MB. Export a smaller date range.", 413);
    let form: FormData;
    try {
      if (!req.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) throw new ApiError("Upload a valid multipart file request.", 400);
      if (!req.body) throw new ApiError("Choose a file to preview.", 400);
      const reader = req.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > LIMIT + 64 * 1024) { await reader.cancel(); throw new ApiError("File exceeds 10 MB. Export a smaller date range.", 413); }
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      form = await new Request(req.url, { method: "POST", headers: { "Content-Type": req.headers.get("content-type")! }, body: bytes }).formData();
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError("Upload a valid multipart file request.", 400); }
    if (form.has("athleteId")) throw new ApiError("Import into your own account only.", 403);
    const file = form.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file) || !file.size) throw new ApiError("Choose a nonempty Activities CSV or TCX file.", 400);
    if (file.size > LIMIT) throw new ApiError("File exceeds 10 MB. Export a smaller date range.", 413);
    const option = (key: string, allowed?: string[]) => {
      const entry = form.get(key);
      if (entry == null || entry === "") return undefined;
      if (typeof entry !== "string" || entry.length > 100 || (allowed && !allowed.includes(entry))) throw new ApiError(`Invalid ${key} option. Review the file settings.`, 400);
      return entry;
    };
    const input: GarminImportInput = {
      filename: file.name.slice(0, 255), content: new Uint8Array(await file.arrayBuffer()),
      timezone: option("timezone"), unitSystem: option("unitSystem", ["metric", "imperial"]) as GarminImportInput["unitSystem"],
      distanceUnit: option("distanceUnit", ["km", "mi", "m", "yd"]) as GarminImportInput["distanceUnit"],
      swimDistanceUnit: option("swimDistanceUnit", ["km", "mi", "m", "yd"]) as GarminImportInput["swimDistanceUnit"],
      numberFormat: option("numberFormat", ["decimal-dot", "decimal-comma"]) as GarminImportInput["numberFormat"],
    };
    const body = confirm
      ? await confirmGarminImport(user.id, input, option("previewToken") || "")
      : await previewGarminImport(user.id, input);
    return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
