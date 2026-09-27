import { authorize } from "@/lib/oauth";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  return authorize(req, (await params).provider);
}
