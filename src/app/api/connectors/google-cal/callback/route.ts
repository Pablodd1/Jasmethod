import { callback } from "@/lib/oauth";
export function GET(req: Request) {
  return callback(req, "google-cal");
}
