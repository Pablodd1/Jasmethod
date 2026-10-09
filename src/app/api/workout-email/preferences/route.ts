import { manualEmailLanguage } from "@/lib/manual-workout-email-locale";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { manualEmailConfigured, MANUAL_EMAIL_CONSENT, parseManualEmailSettings } from "@/lib/manual-workout-email";
export const dynamic = "force-dynamic";
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!manualEmailConfigured()) return Response.json({ configured: false, enabled: false, language: user.language, languageSupported: !!manualEmailLanguage(user.language), message: "Manual workout email is not enabled for this installation." });
  const pref = await prisma.manualWorkoutEmailPreference.findUnique({ where: { userId: user.id } });
  return Response.json({ configured: true, language: user.language, languageSupported: !!manualEmailLanguage(user.language), consentVersion: MANUAL_EMAIL_CONSENT, email: user.email,
    preference: pref ? { enabled: pref.enabled, daily: pref.daily, revisions: pref.revisions, calendarGuidance: pref.calendarGuidance, timezone: pref.timezone, minuteOfDay: pref.minuteOfDay, leadMinutes: pref.leadMinutes, verified: !!pref.verifiedAt && pref.recipient === user.email } : { enabled: false, daily: false, revisions: false, calendarGuidance: false, timezone: user.timezone, minuteOfDay: 360, leadMinutes: 60, verified: false } }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!manualEmailConfigured()) return Response.json({ error: user.language === "es" ? "El correo de entrenamientos manuales está desactivado" : "Manual workout email is disabled" }, { status: 503 });
  try {
    const data = parseManualEmailSettings(await req.json());
    if (data.enabled && !manualEmailLanguage(user.language)) return Response.json({ error: "Workout email is unavailable in your saved language. Reviewed English and Spanish content are currently supported.", code: "unsupported_language" }, { status: 409 });
    const pref = await prisma.manualWorkoutEmailPreference.findUnique({ where: { userId: user.id } });
    if (data.enabled && (!pref?.verifiedAt || pref.recipient !== user.email)) return Response.json({ error: user.language === "es" ? "Primero verifica el correo actual de tu cuenta" : "Verify your current account email first" }, { status: 409 });
    // Session dates/readiness use the athlete's current timezone. Avoid two conflicting clocks.
    if (data.timezone !== user.timezone) return Response.json({ error: user.language === "es" ? "Usa la zona horaria de tu perfil; cámbiala primero en los ajustes del perfil" : "Use your athlete profile timezone; change it in profile settings first" }, { status: 400 });
    await prisma.manualWorkoutEmailPreference.upsert({ where: { userId: user.id },
      create: { userId: user.id, ...data, consentVersion: data.enabled ? MANUAL_EMAIL_CONSENT : null, consentAt: data.enabled ? new Date() : null },
      update: { ...data, ...(data.enabled ? { consentVersion: MANUAL_EMAIL_CONSENT, consentAt: new Date() } : {}) } });
    if (!data.enabled) await prisma.manualWorkoutEmailOutbox.updateMany({ where: { userId: user.id, status: "queued" }, data: { status: "cancelled" } });
    return Response.json({ ok: true, enabled: data.enabled });
  } catch { return Response.json({ error: user.language === "es" ? "Revisa los fines, la zona horaria, la hora local y la antelación." : "Invalid settings. Review purposes, timezone, local send time and lead time." }, { status: 400 }); }
}
