import { manualEmailLanguage } from "@/lib/manual-workout-email-locale";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { manualEmailConfigured } from "@/lib/manual-workout-email";
import { sendManualEmail } from "@/lib/manual-workout-email-transport";
export const dynamic = "force-dynamic";
const digest = (userId: string, email: string, code: string) => createHash("sha256").update(JSON.stringify([userId, email, code])).digest("hex");
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!manualEmailConfigured()) return Response.json({ error: user.language === "es" ? "El correo de entrenamientos manuales está desactivado" : "Manual workout email is disabled" }, { status: 503 });
  const language = manualEmailLanguage(user.language);
  if (!language) return Response.json({ error: "Workout email is unavailable in your saved language. Reviewed English and Spanish content are currently supported.", code: "unsupported_language" }, { status: 409 });
  const t = (en: string, es: string) => language === "es" ? es : en;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: t("Invalid request", "Solicitud no válida") }, { status: 400 });
  const now = new Date();
  if (body.action === "request" && body.sendCodeToAccountEmail === true) {
    const code = randomBytes(6).toString("hex").toUpperCase();
    const reserved = await prisma.$transaction(async tx => {
      await tx.manualWorkoutEmailPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, timezone: user.timezone }, update: {} });
      return tx.manualWorkoutEmailPreference.updateMany({ where: { userId: user.id, OR: [{ challengeSentAt: null }, { challengeSentAt: { lt: new Date(now.getTime() - 60_000) } }] },
        data: { enabled: false, recipient: user.email, verifiedAt: null, challengeHash: digest(user.id, user.email, code), challengeExpiresAt: new Date(now.getTime() + 15 * 60_000), challengeSentAt: now, challengeAttempts: 0 } });
    });
    if (!reserved.count) return Response.json({ error: t("Wait one minute before requesting another code", "Espera un minuto antes de solicitar otro código") }, { status: 429 });
    const current = await getCurrentUser();
    if (!current || current.id !== user.id || current.email !== user.email || current.language !== language) return Response.json({ error: t("Account details changed. Request a new code.", "Los datos de tu cuenta cambiaron. Solicita otro código.") }, { status: 409 });
    const subject = t("Verify your JMM workout email", "Verifica tu correo de entrenamientos JMM");
    const text = language === "es"
      ? `Tu código de verificación es ${code}. Introdúcelo en los ajustes de correo de JMM con tu sesión iniciada en los próximos 15 minutos. Esto no activa los correos de entrenamiento. Si no lo solicitaste, ignora este mensaje.`
      : `Your verification code is ${code}. Enter it in your signed-in JMM email settings within 15 minutes. This does not enable workout emails. If you did not request it, ignore this message.`;
    const receipt = await sendManualEmail({ to: user.email, subject, text, html: `<p>${text}</p>` });
    return Response.json({ status: receipt.status, message: receipt.status === "accepted" ? t("SMTP accepted the verification email. Check your inbox; delivery is not yet verified.", "El servidor de correo aceptó el mensaje. Revisa tu bandeja; aún no se ha verificado la entrega.") : t("The verification email could not be confirmed. If it arrives, you can still use the code.", "No se pudo confirmar el correo. Si llega, aún puedes usar el código.") }, { status: receipt.status === "accepted" ? 202 : 502 });
  }
  if (body.action !== "confirm" || typeof body.code !== "string" || !/^[A-Fa-f0-9]{12}$/.test(body.code.trim())) return Response.json({ error: t("Enter the 12-character verification code", "Introduce el código de 12 caracteres") }, { status: 400 });
  const pref = await prisma.manualWorkoutEmailPreference.findUnique({ where: { userId: user.id } });
  if (!pref?.challengeHash || !pref.challengeExpiresAt || pref.challengeExpiresAt <= now || pref.challengeAttempts >= 5 || pref.recipient !== user.email) return Response.json({ error: t("Code expired or unavailable. Request a new code.", "El código ha caducado o no está disponible. Solicita otro.") }, { status: 409 });
  const attempt = await prisma.manualWorkoutEmailPreference.updateMany({ where: { userId: user.id, challengeHash: pref.challengeHash, challengeAttempts: { lt: 5 }, challengeExpiresAt: { gt: now } }, data: { challengeAttempts: { increment: 1 } } });
  const expected = digest(user.id, user.email, body.code.trim().toUpperCase());
  if (!attempt.count || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(pref.challengeHash, "hex"))) return Response.json({ error: t("Incorrect or unavailable code", "Código incorrecto o no disponible") }, { status: 400 });
  const confirmed = await prisma.manualWorkoutEmailPreference.updateMany({ where: { userId: user.id, recipient: user.email, challengeHash: pref.challengeHash, challengeExpiresAt: { gt: now } }, data: { verifiedAt: now, challengeHash: null, challengeExpiresAt: null } });
  return Response.json({ verified: confirmed.count === 1 }, { status: confirmed.count ? 200 : 409 });
}
