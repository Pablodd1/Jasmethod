import { garminImportHttp } from "@/lib/garmin-import-http";
export const dynamic = "force-dynamic";
export async function POST(req: Request) { return garminImportHttp(req, false); }
