import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@"))
    throw new Error(
      "Usage: npm run admin:grant -- existing-account@example.com",
    );
  const user = await db.user.findUnique({ where: { email } });
  if (!user)
    throw new Error(
      "No existing account with that email. Create the account through the app first, then run this command.",
    );
  if (await bcrypt.compare("demo1234", user.passwordHash))
    throw new Error(
      "This account still uses the shared demo password. Set a unique password before granting administrator access.",
    );
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { role: "admin" } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        subjectId: user.id,
        action: "operator.grant-admin",
        before: JSON.stringify({ role: user.role }),
        after: JSON.stringify({ role: "admin" }),
        note: "Granted by a server operator using scripts/grant-admin.ts",
      },
    });
  });
  console.log(
    `Administrator access granted to ${email}. Sign in normally and open /admin.`,
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
