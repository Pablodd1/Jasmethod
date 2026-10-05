import { callback } from "@/lib/oauth";
export async function GET(req: Request) {
  return callback(req, "intervals");
}
