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
        <p className="micro mb-8">JasMiamiMethod · <a href={PUBLIC_CONTACT_MAILTO} className="underline">{PUBLIC_CONTACT_EMAIL}</a> · Last updated: September 2026</p>

        <section className="space-y-4 text-sm leading-relaxed text-ink-700">
          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display font-bold text-lg mb-1">1. What we collect / Qué recopilamos</h2>
            <p><strong>EN:</strong> Your account (name, email, language), the profile data you choose to enter (age, physiology like threshold heart rate or FTP), your daily check-in answers, and — only if you connect a device — your wearable data (workouts, heart rate, HRV, recovery, sleep) via that provider (Whoop, Strava, Garmin, Apple Health, Oura, COROS). Blood-panel and DNA results are optional and only stored if you upload them yourself.</p>
            <p className="mt-2"><strong>ES:</strong> Tu cuenta (nombre, correo, idioma), los datos de perfil que decidas ingresar (edad, fisiología como FC umbral o FTP), tus respuestas del chequeo diario y — solo si conectas un dispositivo — los datos de tu wearable (entrenamientos, FC, VFC, recuperación, sueño) a través de ese proveedor (Whoop, Strava, Garmin, Apple Health, Oura, COROS). Los análisis de sangre y ADN son opcionales y solo se guardan si tú los subes.</p>
          </div>

          <div className="rounded-2xl border border-ink-200 bg-white p-5">
            <h2 className="font-display font-bold text-lg mb-1">2. How we use it / Cómo lo usamos</h2>
            <p><strong>EN:</strong> Exclusively to generate and adapt your training, fueling and recovery guidance, and your daily coach briefing. Your data may be summarized and sent to our AI provider (Google Gemini) to produce your coaching text — never sold, never used for advertising, never shared with third parties beyond the hosting (Vercel), database (Supabase) and notification services (email/Telegram) needed to run the app.</p>
            <p className="mt-2"><strong>ES:</strong> Exclusivamente para generar y adaptar tu entrenamiento, nutrición y recuperación, y tu briefing diario del coach. Tus datos pueden resumirse y enviarse a nuestro proveedor de IA (Google Gemini) para producir tu texto de coaching — nunca se venden, nunca se usan para publicidad, ni se comparten con terceros más allá del hosting (Vercel), la base de datos (Supabase) y los servicios de notificación (correo/Telegram) necesarios para operar.</p>
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
