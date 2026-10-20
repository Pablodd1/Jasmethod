"use client";

// Public privacy policy — required by OAuth providers (Whoop/Strava/Oura show
// this link in the authorization flow). Bilingual EN + ES on one page.
import { PUBLIC_CONTACT_EMAIL, PUBLIC_CONTACT_MAILTO } from "@/lib/public-contact";
import { SiteHeader, SiteFooter } from "@/components/site-shell";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="pub-container py-12 max-w-3xl mx-auto">
        <h1 className="font-display text-3xl font-bold mb-2">Privacy Policy · Política de Privacidad</h1>
        <p className="micro mb-8">JasMiamiMethod · <a href={PUBLIC_CONTACT_MAILTO} className="underline">{PUBLIC_CONTACT_EMAIL}</a> · Last updated: October 20, 2026</p>

        <section className="space-y-4 text-sm leading-relaxed text-ink-700">
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display font-bold text-lg mb-1">1. What we collect / Qué recopilamos</h2>
            <p><strong>EN:</strong> Your account (name, email, language), the profile data you choose to enter (age, physiology like threshold heart rate or FTP), your daily check-in answers, and — only if you connect a device — your wearable data (workouts, heart rate, HRV, recovery, sleep) via that provider (Whoop, Strava, Garmin, Apple Health, Oura, COROS). Blood-panel and DNA results are optional and only stored if you upload them yourself.</p>
            <p className="mt-2"><strong>ES:</strong> Tu cuenta (nombre, correo, idioma), los datos de perfil que decidas ingresar (edad, fisiología como FC umbral o FTP), tus respuestas del chequeo diario y — solo si conectas un dispositivo — los datos de tu wearable (entrenamientos, FC, VFC, recuperación, sueño) a través de ese proveedor (Whoop, Strava, Garmin, Apple Health, Oura, COROS). Los análisis de sangre y ADN son opcionales y solo se guardan si tú los subes.</p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display font-bold text-lg mb-1">2. How we use it / Cómo lo usamos</h2>
            <p><strong>EN:</strong> JMM uses your information for training, fueling, recovery and coaching. Optional DeepSeek text coaching requires named consent for each message. That request can include your message, up to four recent messages from you, language, confirmed goal, explicitly answered experience, manually sourced weight, today’s self-reported check-in and up to ten manual activities unlinked to imports from the last 30 days (date, sport, actual minutes and RPE). Profile identity/contact fields, raw notes, imported/device/Strava data, screenshots and credentials are excluded from that text context. Common credentials and contact details in text are filtered; do not include secrets. OpenAI screenshot analysis requires separate consent for that image. Without external consent or when the provider is unavailable, local coaching remains available. External guidance can be mistaken and cannot save changes, clear exercise or confirm device delivery; changes require JMM review and confirmation.</p>
            <p className="mt-2"><strong>ES:</strong> JMM usa tu información para entrenamiento, nutrición, recuperación y coaching. El texto opcional de DeepSeek requiere consentimiento por nombre para cada mensaje. Esa solicitud puede incluir tu mensaje, hasta cuatro mensajes tuyos recientes, idioma, objetivo confirmado, experiencia explícita, peso de fuente manual, check-in reportado por ti hoy y hasta diez actividades manuales sin vínculo a importaciones de los últimos 30 días (fecha, deporte, minutos reales y RPE). Se excluyen identidad/contacto del perfil, notas, datos importados/de dispositivos/Strava, capturas y credenciales de ese contexto de texto. Se filtran credenciales comunes y datos de contacto en el texto; no incluyas secretos. El análisis de capturas de OpenAI exige consentimiento separado para esa imagen. Sin consentimiento externo o si el proveedor no responde, el coaching local sigue disponible. La orientación externa puede equivocarse y no guarda cambios, autoriza ejercicio ni confirma recepción en dispositivos; los cambios requieren revisión y confirmación en JMM.</p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display font-bold text-lg mb-1">3. Storage, retention & security / Almacenamiento y seguridad</h2>
            <p><strong>EN:</strong> Data is stored in an encrypted-access managed Postgres database (Supabase, US region) with row-level security; device access tokens are encrypted at rest. We keep your data while your account is active. You may request export or full deletion of your data at any time by emailing <a href={PUBLIC_CONTACT_MAILTO} className="underline">{PUBLIC_CONTACT_EMAIL}</a> — deletion is final and completes within 30 days.</p>
            <p className="mt-2"><strong>ES:</strong> Los datos se guardan en una base de datos Postgres gestionada (Supabase, región EE.UU.) con seguridad por filas; los tokens de dispositivos se cifran en reposo. Conservamos tus datos mientras tu cuenta esté activa. Puedes solicitar exportación o eliminación total en cualquier momento escribiendo a <a href={PUBLIC_CONTACT_MAILTO} className="underline">{PUBLIC_CONTACT_EMAIL}</a> — la eliminación es definitiva y se completa en 30 días.</p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display font-bold text-lg mb-1">4. Your controls / Tus controles</h2>
            <p><strong>EN:</strong> Connecting a device is always optional and revocable — disconnect in the app or at the provider at any time. Health information here is educational coaching, not medical diagnosis; consult a physician for medical decisions.</p>
            <p className="mt-2"><strong>ES:</strong> Conectar un dispositivo siempre es opcional y revocable — desconéctalo en la app o en el proveedor cuando quieras. La información de salud aquí es coaching educativo, no diagnóstico médico; consulta a un médico para decisiones médicas.</p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display font-bold text-lg mb-1">5. Public inquiries and booking / Consultas públicas y reservas</h2>
            <p><strong>EN:</strong> If you submit the public contact form, JMM processes your name, reply email, selected topic and message to respond. The form first uses the existing administrator Telegram channel when available, with the JMM business mailbox as an SMTP fallback. A provider receipt does not prove that the message has been read or reached an inbox. Do not include medical records or sensitive information. If you choose the external Cal.com calendar, Cal.com processes the booking details under its own terms and privacy practices. Contact JMM to request deletion of inquiry information held by JMM.</p>
            <p className="mt-2"><strong>ES:</strong> Si envías el formulario público, JMM utiliza nombre, correo, tema y mensaje para responder. El formulario utiliza primero el canal de Telegram del administrador cuando está disponible y el buzón empresarial por SMTP como alternativa. La aceptación del proveedor no confirma la lectura ni la llegada a la bandeja. No incluyas historiales médicos ni información sensible. Si usas el calendario externo de Cal.com, ese servicio procesa los datos de reserva conforme a sus propias condiciones. Escribe a JMM para solicitar la eliminación de consultas conservadas por JMM.</p>
          </div>

          <div className="rounded-2xl border border-vermillion-300 bg-paper-100 p-5">
            <h2 className="font-display font-bold text-lg mb-1">Contact / Contacto</h2>
            <p>Jasmel Acosta · <a href={PUBLIC_CONTACT_MAILTO} className="underline">{PUBLIC_CONTACT_EMAIL}</a> · Miami, FL</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
