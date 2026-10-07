import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resetOriginAllowed } from "@/lib/password-reset";
import { rateLimit } from "@/lib/ratelimit";
import { PILOT_USER_LIMIT } from "@/lib/pilot-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers });
  try {
    const rawPage = Number(new URL(req.url).searchParams.get("page") || 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 10000 ? rawPage : 1;
    const pageSize = 25;
    const [total, accounts] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: {
        id: true, name: true, email: true, role: true, onboarded: true, createdAt: true,
        signInAccounts: { select: { provider: true } },
        _count: { select: { sessions: { where: { expiresAt: { gt: new Date() } } } } },
      } }),
    ]);
    return Response.json({ total, limit: PILOT_USER_LIMIT, remaining: Math.max(0, PILOT_USER_LIMIT - total), page, pageSize,
      accounts: accounts.map(account => ({ id: account.id, name: account.name, email: account.email, role: account.role,
        onboarded: account.onboarded, createdAt: account.createdAt, loginProviders: [...new Set(account.signInAccounts.map(link => link.provider))],
        activeSessions: account._count.sessions, isSelf: account.id === actor.id })) }, { headers });
  } catch { return Response.json({ error: "Could not load account access overview." }, { status: 500, headers }); }
}

export async function POST(req: Request) {
  const actor = await getCurrentUser();
  if (!actor) return Response.json({ error: "Sign in required." }, { status: 401, headers });
  if (actor.role !== "admin") return Response.json({ error: "Administrator access required." }, { status: 403, headers });
  if (!resetOriginAllowed(req)) return Response.json({ error: "Invalid origin." }, { status: 403, headers });
  if (!rateLimit(`admin-revoke-sessions:${actor.id}`, 20, 15 * 60_000).ok) return Response.json({ error: "Too many requests." }, { status: 429, headers });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400, headers }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Invalid request." }, { status: 400, headers });
  const input = body as Record<string, unknown>;
  if (input.action !== "revoke_sessions" || input.confirmed !== true || typeof input.userId !== "string" || !input.userId || input.userId.length > 200 || Object.keys(input).some(key => !["action", "confirmed", "userId"].includes(key)))
    return Response.json({ error: "Choose an account and explicitly confirm session revocation." }, { status: 400, headers });
  if (input.userId === actor.id) return Response.json({ error: "Use normal sign-out or password recovery for your own account. This control preserves your administrator session." }, { status: 400, headers });
  try {
    const targetId = input.userId;
    const result = await prisma.$transaction(async tx => {
      const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
      if (!target) return null;
      const removed = await tx.authSession.deleteMany({ where: { userId: target.id } });
      await tx.signInTransaction.deleteMany({ where: { linkUserId: target.id } });
      await tx.auditLog.create({ data: { actorId: actor.id, subjectId: target.id, action: "account.sessions_revoked", entityId: target.id,
        after: JSON.stringify({ deletedSessions: removed.count }), note: "Administrator confirmed session revocation; password, role, records and provider connections unchanged. New sign-in remains allowed." } });
      return removed.count;
    });
    if (result === null) return Response.json({ error: "Account not found." }, { status: 404, headers });
    return Response.json({ ok: true, deletedSessions: result, message: "Existing sessions revoked. The user can sign in again; their account and records remain intact." }, { headers });
  } catch { return Response.json({ error: "Session revocation could not be confirmed. Refresh the overview before retrying." }, { status: 500, headers }); }
}
