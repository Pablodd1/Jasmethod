import { authorize } from "@/lib/oauth";
export function GET(
  req: Request,
  { params }: { params: { provider: string } },
) {
  return authorize(req, params.provider);
}
