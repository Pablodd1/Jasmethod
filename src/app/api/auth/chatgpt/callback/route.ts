import { finishSignIn } from "@/lib/social-sign-in";
export const dynamic = "force-dynamic";
export function GET(req: Request) { return finishSignIn(req, "chatgpt"); }
