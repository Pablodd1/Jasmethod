import { prisma } from "./db";

// ADMIN_EMAILS — comma-separated allowlist. On every auth path (password
// login, signup, Google sign-in, one-tap demo) an email on the list is
// promoted to role="admin". This is the bootstrap mechanism: it needs no
// direct database access, just an env var.
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  return adminEmails().includes(email.toLowerCase());
}

// Returns the user's (possibly updated) role. Idempotent — a no-op when the
// role already matches or the email isn't on the list.
export async function syncAdminRole(user: {
  id: string;
  email: string;
  role: string;
}): Promise<string> {
  if (user.role === "admin" || !isAdminEmail(user.email)) return user.role;
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "admin" },
  });
  return "admin";
}
