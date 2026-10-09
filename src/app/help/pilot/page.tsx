import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Free pilot: workflow and next steps | JMM",
  robots: { index: false, follow: false },
};

// This public guide keeps its server metadata. Explicit language links also
// work before registration, without needing an athlete profile or device.
export default async function PilotGuide({ searchParams }: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const es = (await searchParams).lang !== "en";
  const copy = (spanish: string, english: string) => es ? spanish : english;
  const steps = [
    [copy("1. Entra y revisa tu perfil", "1. Sign in and review your profile"), "/onboard?redo=1", copy("Usa Google o correo y contraseña. Revisa tus datos; puedes omitir las preguntas y continuar sin reloj. Añade los detalles de planificación cuando quieras preparar un ciclo personalizado.", "Use Google or email and password. Review your details; you can skip questions and continue without a watch. Add planning details when you want a personalized training cycle.")],
    [copy("2. Cuéntanos cómo estás", "2. Tell us how you feel"), "/checkin", copy("Completa el chequeo diario con tu sueño, energía, molestias y tiempo disponible. Puedes usar la conversación para explicar lo que pasó. Revisa los datos y la propuesta antes de confirmar un cambio de entrenamiento.", "Complete the daily check-in with your sleep, energy, soreness and available time. Use the conversation to explain what happened. Review the information and proposed workout before confirming a training change.")],
    [copy("3. Revisa tu entrenamiento", "3. Review your workout"), "/today", copy("Abre Hoy. Revisa los pasos, objetivos y la explicación. Aprueba la versión actual antes de enviarla. Si faltan datos para personalizar, JMM te indica qué revisar; no inventa tu capacidad.", "Open Today. Review the steps, targets and explanation. Approve the current version before sending it. If information needed for personalization is missing, JMM tells you what to review; it does not invent your ability.")],
    [copy("4. Entrena y registra el resultado", "4. Train and record the result"), "/dashboard", copy("Sigue la sesión en JMM o compruébala en tu reloj. Después revisa la actividad importada o registra lo que hiciste. El entrenamiento previsto y el realizado se mantienen separados.", "Follow the session in JMM or check it on your watch. Afterwards, review the imported activity or record what you did. Planned and completed training stay separate.")],
  ];
  const links = [
    [copy("Hoy", "Today"), "/today"], [copy("Chequeo diario", "Daily check-in"), "/checkin"], ["J Koach", "/coach"],
    [copy("Perfil y zonas", "Profile and zones"), "/settings"], [copy("Plan y calendario", "Plan and calendar"), "/calendar"],
    [copy("Conexiones", "Connections"), "/connectors"], [copy("Progreso", "Progress"), "/dashboard"],
    [copy("Entrenamiento y pruebas", "Training and baseline tests"), "/training"], [copy("Nutrición", "Nutrition"), "/nutrition"],
    [copy("Sueño", "Sleep"), "/sleep"], [copy("Carreras y escenarios", "Races and scenarios"), "/races"],
    [copy("Ciencia", "Science"), "/science"], [copy("Ayuda", "Help"), "/help"],
  ];
  const summaryClass = "cursor-pointer font-semibold py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-600";
  return <div className="min-h-screen bg-paper"><SiteHeader /><main lang={es ? "es" : "en"} className="pub-container py-10 max-w-4xl space-y-6">
    <nav aria-label={copy("Idioma de esta guía", "Guide language")} className="flex gap-3 text-sm">
      <Link href="/help/pilot?lang=es" hrefLang="es" aria-current={es ? "page" : undefined} className="underline py-2">Español</Link>
      <Link href="/help/pilot?lang=en" hrefLang="en" aria-current={!es ? "page" : undefined} className="underline py-2">English</Link>
    </nav>
    <h1 className="font-display text-3xl sm:text-4xl">{copy("Tu día en JMM, paso a paso", "Your day in JMM, step by step")}</h1>
    <p className="text-lg">{copy("Revisa tu perfil → haz el chequeo → abre Hoy → registra el resultado. Puedes empezar sin reloj.", "Review your profile → check in → open Today → record the result. You can start without a watch.")}</p>
    <div className="flex flex-wrap gap-3"><Link className="btn-primary" href="/today">{copy("Abrir Hoy", "Open Today")}</Link><Link className="btn-secondary" href="/login?mode=signup">{copy("Crear cuenta", "Create account")}</Link></div>
    <section className="grid sm:grid-cols-2 gap-4" aria-label={copy("Rutina diaria", "Daily routine")}>{steps.map(([title, href, description]) => <article className="card space-y-2" key={href}><h2 className="font-bold"><Link href={href} className="underline">{title}</Link></h2><p className="text-sm">{description}</p></article>)}</section>
    <section className="card space-y-3" aria-labelledby="garmin-guide-title">
      <h2 id="garmin-guide-title" className="font-bold text-xl">{copy("Lleva carrera y bicicleta a Garmin", "Get run and bike workouts onto Garmin")}</h2>
      <ol className="list-decimal pl-5 space-y-2 text-sm">
        <li>{copy("En tus Ajustes de Intervals.icu, conecta tu cuenta Garmin Connect y activa «Upload planned workouts» para tu dispositivo compatible.", "In your Intervals.icu Settings, connect your Garmin Connect account and enable “Upload planned workouts” for your compatible device.")}</li>
        <li>{copy("En Conexiones de JMM, conecta tu propia cuenta Intervals.icu. Autoriza actividades, bienestar y calendario; revisa la última importación.", "In JMM Connections, connect your own Intervals.icu account. Allow activity, wellness and calendar access; check the last import.")}</li>
        <li>{copy("En Hoy, revisa y aprueba la versión actual de la sesión. Publícala o activa el envío automático de sesiones aprobadas si la opción está disponible.", "In Today, review and approve the current workout version. Publish it or enable automatic publication of approved workouts if that option is available.")}</li>
        <li>{copy("Comprueba los pasos y objetivos en Garmin Connect. Sincroniza el reloj y abre la sesión allí antes de entrenar.", "Check the steps and targets in Garmin Connect. Sync your watch and open the workout there before training.")}</li>
      </ol>
      <p className="text-sm font-semibold">{copy("«Aceptado por Intervals.icu» significa que Intervals.icu recibió la sesión. JMM no recibe confirmación de Garmin Connect ni del reloj.", "“Accepted by Intervals.icu” means Intervals.icu received the workout. JMM does not receive confirmation from Garmin Connect or the watch.")}</p>
      <Link href="/connectors#intervals-connection" className="btn-secondary">{copy("Revisar mi conexión", "Review my connection")}</Link>
      <details><summary className={summaryClass}>{copy("¿No aparece en mi reloj?", "Not appearing on my watch?")}</summary><div className="space-y-2 text-sm pt-2">
        <p>{copy("Comprueba que las cuentas son tuyas, que el envío de sesiones está activado en Intervals.icu y que aprobaste la última versión en Hoy. Revisa el error en Conexiones. No crees una sesión duplicada para forzar el envío.", "Check that the accounts are yours, workout forwarding is enabled in Intervals.icu, and you approved the latest version in Today. Review any error in Connections. Do not create a duplicate workout to force delivery.")}</p>
        <p>{copy("Si la conexión no está habilitada, sigue la sesión en Hoy. Para un Garmin compatible, revisa la opción FIT en Hoy: descarga el archivo, conecta el reloj a un ordenador con cable USB de datos y cópialo a Garmin/NewFiles. Consulta el manual de tu modelo; algunos dispositivos requieren Windows. Descargar el archivo tampoco confirma recepción.", "If the connection is not enabled, follow the workout in Today. For a compatible Garmin, review the FIT option in Today: download the file, connect the watch to a computer with a data-capable USB cable and copy it to Garmin/NewFiles. Check your model’s manual; some devices require Windows. Downloading the file also does not confirm receipt.")}</p>
        <p>{copy("La publicación automática admite carrera y bicicleta. Natación, fuerza y HYROX requieren revisar las opciones disponibles de cada sesión; JMM no confirma entrega nativa para COROS o Apple Watch.", "Automatic publication supports run and bike. For swimming, strength and HYROX, review each workout’s available options; JMM does not confirm native delivery to COROS or Apple Watch.")}</p>
        <a href="https://forum.intervals.icu/t/upload-planned-workouts-to-garmin-connect/1521" target="_blank" rel="noopener noreferrer" className="underline inline-block py-2">{copy("Guía de Intervals.icu para Garmin", "Intervals.icu Garmin guide")}</a>
      </div></details>
    </section>
    <details className="card"><summary className={summaryClass}>{copy("Qué datos llegan y cuáles debes revisar", "What imports and what you need to review")}</summary><div className="space-y-3 text-sm pt-3">
      <p>{copy("La conexión puede importar actividades realizadas y datos de bienestar disponibles según el proveedor y tus permisos. La autorización por sí sola no confirma que llegaron datos. Revisa la fecha de importación y los errores en Conexiones.", "A connection can import completed activities and available wellness data, depending on the provider and your permissions. Authorization alone does not confirm that data arrived. Check the import date and errors in Connections.")}</p>
      <p>{copy("Intervals.icu no completa automáticamente tu perfil Garmin, zonas o umbrales. Revisa fuente, deporte y fecha en Perfil y zonas. El FTP de bicicleta no es un umbral de potencia de carrera Stryd. Una observación aislada no establece una referencia.", "Intervals.icu does not automatically fill your Garmin profile, zones or thresholds. Review the source, sport and date in Profile and zones. Cycling FTP is not a Stryd running-power threshold. One observation does not establish a baseline.")}</p>
      <p>{copy("Registra tus molestias, enfermedad, horario, equipo y objetivos. El peso importado es una sugerencia que debes revisar; no sustituye automáticamente el dato guardado. Vincular un proveedor es distinto de iniciar sesión con Google.", "Report pain, illness, schedule, equipment and goals. Imported weight is a suggestion to review; it does not automatically replace your saved value. Linking a provider is separate from signing in with Google.")}</p>
    </div></details>
    <details className="card"><summary className={summaryClass}>{copy("Piloto gratuito y límites", "Free pilot and limits")}</summary><p className="text-sm pt-3">{copy("JMM no cobra en este piloto. El límite es de 50 cuentas registradas, incluidos atletas, coaches y administradores. Al llegar al límite, los usuarios existentes conservan el acceso y la recuperación de contraseña. Los proveedores o dispositivos externos pueden tener sus propias tarifas y límites.", "JMM collects no payment in this pilot. The limit is 50 registered accounts, including athletes, coaches and administrators. At capacity, existing users retain sign-in and password recovery. External providers or devices may have their own fees and limits.")}</p></details>
    <details className="card"><summary className={summaryClass}>{copy("Herramientas para el coach y administrador", "Coach and administrator tools")}</summary><p className="text-sm pt-3">{copy("En Administrador puedes revisar cuentas, roles, métodos de acceso, incorporación y sesiones vigentes. Puedes solicitar un restablecimiento al correo guardado o revocar las sesiones de otra cuenta. Revocar sesiones no suspende la cuenta. La aceptación por el correo no garantiza llegada a la bandeja. La entrega al reloj requiere una comprobación con el atleta y su dispositivo.", "In Administrator, review accounts, roles, sign-in methods, onboarding and unexpired sessions. Request a reset to the saved email or revoke another account’s sessions. Revocation does not suspend the account. Email acceptance does not guarantee inbox delivery. Watch delivery requires a check with the athlete and their device.")}</p><Link href="/admin" className="underline inline-block py-2">{copy("Abrir Administrador", "Open Administrator")}</Link></details>
    <section><h2 className="font-bold text-xl mb-3">{copy("Accesos rápidos", "Quick links")}</h2><div className="grid sm:grid-cols-2 gap-3">{links.map(([label, href]) => <Link className="rounded-lg border p-3 underline" key={href} href={href}>{label}</Link>)}</div><p className="text-sm mt-3">{copy("Las páginas protegidas requieren iniciar sesión. Las funciones de administración requieren el rol correspondiente. La existencia de una página no confirma la validación de una predicción ni la entrega a un dispositivo.", "Protected pages require sign-in. Administrator features require the corresponding role. A page’s existence does not confirm a validated prediction or device delivery.")}</p></section>
  </main><SiteFooter /></div>;
}
