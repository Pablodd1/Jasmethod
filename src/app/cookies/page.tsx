import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
export const metadata: Metadata = {title: "Cookies and browser storage · Cookies y almacenamiento del navegador — JasMiamiMethod", alternates: {canonical: "/cookies"}};
const sections = [
  {
    "id": "sign-in",
    "title": "1. Sign-in and security / Inicio de sesión y seguridad",
    "en": "JMM uses the jmm_session cookie to keep you signed in, with a configured lifetime of 30 days. Signing out clears that browser cookie; expiring or revoking the corresponding server session also removes access. Short-lived jmm_signin_* and jmm_oauth_* cookies, and jmm_coros_oauth when that connection is available, bind authorization flows and are configured for up to 10 minutes. These cookies support account/security features, not advertising. Browser settings may clear them sooner.",
    "es": "JMM usa la cookie jmm_session para mantener la sesión, con duración configurada de 30 días. Cerrar sesión elimina la cookie de ese navegador; caducar o revocar la sesión del servidor también impide acceso. Las cookies jmm_signin_*, jmm_oauth_* y jmm_coros_oauth cuando esté disponible vinculan autorizaciones y duran hasta 10 minutos. Sirven para cuenta y seguridad, no publicidad. El navegador puede borrarlas antes."
  },
  {
    "id": "local-storage",
    "title": "2. Preferences and drafts / Preferencias y borradores",
    "en": "Browser local storage can retain language (jmm_lang), the last signed-in account identifier (jmm_last_user), and app caches. Session storage can retain unsaved onboarding or check-in drafts so you can return to the form. Such drafts may contain information you entered. Language/local-storage entries have no automatic cookie expiry; storage can persist until cleared by the app, browser or you. Closing a tab generally ends its session storage. Do not rely on a shared browser to keep drafts private.",
    "es": "El almacenamiento local puede conservar idioma (jmm_lang), identificador de la última cuenta (jmm_last_user) y cachés. El almacenamiento de sesión puede conservar borradores no guardados de configuración o check-in; pueden contener datos que ingresaste. El almacenamiento local no tiene caducidad automática de cookie: permanece hasta que la aplicación, navegador o tú lo borren. Cerrar una pestaña suele terminar su almacenamiento de sesión. No supongas privacidad en un navegador compartido."
  },
  {
    "id": "tracking",
    "title": "3. Hosting and optional tracking / Alojamiento y seguimiento opcional",
    "en": "This application version does not embed an advertising or third-party analytics SDK. The hosting platform may still process traffic and operational logs. Vercel analytics configuration exists; current collection and retention require operator verification, as explained in Privacy. This page does not claim that all platform tracking is absent. Any future optional tracking must have an accurate notice and applicable consent/choice controls before use. Visiting a policy page does not consent to AI, marketing or device-data transfers.",
    "es": "Esta versión no incorpora SDK de publicidad ni analítica externa. La plataforma de alojamiento puede tratar tráfico y logs operativos. Existe configuración de analítica Vercel; su recopilación y conservación requieren verificación del operador, como explica Privacidad. No se afirma que no haya seguimiento de plataforma. El seguimiento opcional futuro debe tener aviso exacto y controles de elección o consentimiento aplicables antes de usarse. Visitar estas páginas no autoriza IA, marketing ni transferencias de dispositivos."
  },
  {
    "id": "controls",
    "title": "4. Your browser controls / Controles del navegador",
    "en": "You can sign out, clear cookies and site data in your browser, use private browsing or block storage. Blocking sign-in/security cookies can prevent login or connections. Clearing browser data can remove unsaved drafts and preferences but does not erase server-side account records. Use the Data rights page to request access or deletion of those records.",
    "es": "Puedes cerrar sesión, borrar cookies y datos del sitio, usar navegación privada o bloquear almacenamiento. Bloquear cookies de seguridad puede impedir el acceso o las conexiones. Borrar datos del navegador puede eliminar borradores y preferencias, pero no elimina registros del servidor. Usa Derechos de datos para solicitar acceso o eliminación."
  }
];
export default function Page(){return <PolicyPage title="Cookies and browser storage · Cookies y almacenamiento del navegador">{sections.map(s=><section id={s.id} key={s.id} className="rounded-2xl border border-ink-200 bg-white p-5"><h2 className="font-display font-bold text-lg mb-2">{s.title}</h2><p lang="en"><strong>EN:</strong> {s.en}</p><p lang="es" className="mt-2"><strong>ES:</strong> {s.es}</p></section>)}</PolicyPage>}
