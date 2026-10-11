import { authorizeSmokeCalendar } from "@/lib/oauth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return authorizeSmokeCalendar(req);
}
