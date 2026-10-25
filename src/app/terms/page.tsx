import type { Metadata } from "next";
import { PolicyPage } from "@/components/policy-page";
export const metadata: Metadata = {title: "Terms of Service · Términos de servicio — JasMiamiMethod", alternates: {canonical: "/terms"}};
const sections = [
  {
    "id": "service",
    "title": "1. Service and operator / Servicio y operador",
    "en": "AI DYNAMICS INC operates JasMiamiMethod (JMM), an exercise-planning and educational coaching service. These terms govern use of JMM. The privacy, AI, cookie and data-rights notices are available from the Policies page and public footer. They describe processing and choices; reading these terms does not authorize an optional AI call or provider connection.",
    "es": "AI DYNAMICS INC opera JasMiamiMethod (JMM), un servicio de planificación del ejercicio y coaching educativo. Estos términos regulan el uso de JMM. Los avisos de privacidad, IA, cookies y derechos están en la página de Políticas y el pie público. Describen el tratamiento y las opciones; leer estos términos no autoriza IA opcional ni conexiones."
  },
  {
    "id": "health-and-training",
    "title": "2. Health and training limitations / Límites de salud y entrenamiento",
    "en": "JMM is not a medical device, diagnostic service or substitute for a qualified health professional. Plans, nutrition estimates, readiness indicators and race predictions can be wrong or incomplete. They do not diagnose, treat, clear you to exercise, guarantee performance or confirm watch delivery. Review all instructions and estimates. Stop exercise and seek appropriate help for concerning symptoms; do not rely on JMM as an emergency or continuous monitoring service. Training and nutrition changes may require qualified professional advice.",
    "es": "JMM no es un dispositivo médico, servicio diagnóstico ni sustituto de un profesional cualificado. Los planes, estimaciones nutricionales, indicadores y predicciones pueden ser erróneos o incompletos. No diagnostican, tratan, autorizan ejercicio, garantizan rendimiento ni confirman entrega al reloj. Revisa instrucciones y estimaciones. Detén el ejercicio y busca ayuda adecuada ante síntomas preocupantes; JMM no es un servicio de emergencias ni monitorización continua. Los cambios pueden requerir asesoramiento profesional."
  },
  {
    "id": "accounts",
    "title": "3. Accounts and appropriate use / Cuentas y uso adecuado",
    "en": "Provide information you have the right to use, keep account access private, and do not impersonate others, bypass access controls, upload malicious content or use someone else’s connected account. Personal plan creation requires the adult eligibility confirmation and review shown in setup; an account or checkbox is not a medical clearance. Contact us about access by a child or use requiring guardian consent before providing that child’s information.",
    "es": "Facilita información que tengas derecho a usar, protege el acceso y no suplantes a otros, evites controles, cargues contenido malicioso ni uses conexiones ajenas. Crear un plan personal exige la confirmación de elegibilidad adulta y revisión de la configuración; una cuenta o casilla no autoriza ejercicio. Consúltanos sobre acceso de menores o consentimiento del tutor antes de proporcionar sus datos."
  },
  {
    "id": "connections-and-ai",
    "title": "4. Connections, consent and optional AI / Conexiones, consentimiento e IA",
    "en": "Connections and external AI are optional. This version supports direct OpenAI API features only when configured and specifically consented to. Local chat, plan review and manual meal entry remain available without external AI. AI may make mistakes; no AI response can silently approve or save a plan change. Garmin-origin activity imports through Intervals.icu remain blocked pending permission verification, and Garmin-derived data is not authorized for external AI processing or model training. Connection approval is not Garmin approval or proof of device receipt. See Privacy for recipients and limits.",
    "es": "Las conexiones y la IA externa son opcionales. Esta versión admite la API directa de OpenAI solo cuando está configurada y autorizada específicamente. El chat local, revisión de planes y entrada manual de comidas siguen disponibles sin IA externa. La IA puede equivocarse y no puede aprobar ni guardar silenciosamente cambios. Las actividades de origen Garmin mediante Intervals.icu siguen bloqueadas hasta verificar permisos; sus datos derivados no están autorizados para IA externa ni entrenamiento de modelos. Aprobar una conexión no equivale a aprobación de Garmin ni recepción en el dispositivo. Consulta Privacidad."
  },
  {
    "id": "billing",
    "title": "5. Current pilot, paid services and cancellations / Piloto actual, servicios de pago y cancelaciones",
    "en": "The current JMM app is a free pilot and does not implement automatic subscription billing or an in-app subscription-cancellation flow. Do not assume that a paid coaching service, renewal or refund policy exists because a contact or booking page is available. For separately arranged coaching, obtain written price, scope, cancellation and refund terms before agreeing to pay; ask the contact address about an existing arrangement. Mandatory consumer rights remain applicable.",
    "es": "La aplicación JMM actual es un piloto gratuito y no implementa cobros automáticos ni un flujo de cancelación de suscripciones. Las páginas de contacto o reservas no implican un servicio de pago, renovación ni política de reembolso. Para coaching acordado por separado, solicita por escrito precio, alcance, cancelación y reembolso antes de aceptar pagar; consulta el correo de contacto sobre un acuerdo existente. Se mantienen los derechos obligatorios del consumidor."
  },
  {
    "id": "availability",
    "title": "6. Availability, changes and rights / Disponibilidad, cambios y derechos",
    "en": "We may update JMM or restrict abusive use. Availability of third-party connections depends on those providers and your authorization. We do not guarantee uninterrupted access, complete source data or a particular training result. Nothing in these terms excludes liability or consumer rights that applicable law does not permit us to exclude. Material service or processing changes should be described in updated notices and require new consent where applicable. Contact AI DYNAMICS INC with questions or complaints.",
    "es": "Podemos actualizar JMM o restringir usos abusivos. Las conexiones dependen del proveedor y de tu autorización. No garantizamos acceso continuo, datos completos ni resultados de entrenamiento. Estos términos no excluyen responsabilidad ni derechos que la ley aplicable no permita excluir. Los cambios materiales del servicio o tratamiento deben describirse en avisos actualizados y requerir nuevo consentimiento cuando corresponda. Contacta con AI DYNAMICS INC para consultas o reclamaciones."
  }
];
export default function Page(){return <PolicyPage title="Terms of Service · Términos de servicio">{sections.map(s=><section id={s.id} key={s.id} className="rounded-2xl border border-ink-200 bg-white p-5"><h2 className="font-display font-bold text-lg mb-2">{s.title}</h2><p lang="en"><strong>EN:</strong> {s.en}</p><p lang="es" className="mt-2"><strong>ES:</strong> {s.es}</p></section>)}</PolicyPage>}
