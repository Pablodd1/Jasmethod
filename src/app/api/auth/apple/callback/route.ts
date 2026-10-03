import { finishSignIn } from "@/lib/social-sign-in";
export const dynamic = "force-dynamic";
export function POST(req: Request) { return finishSignIn(req, "apple"); }
