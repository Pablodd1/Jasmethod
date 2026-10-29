import { publicLocale,publicMetadata } from "@/lib/public-site";
import { PolicyPage } from "@/components/policy-page";
export async function generateMetadata(){const locale=await publicLocale();return publicMetadata("/data-rights",locale,(locale==="es"?"Derechos y eliminación":"Data rights and deletion")+" | Jas Miami Method",locale==="es"?"Consulta los avisos y controles de AI DYNAMICS INC para Jas Miami Method.":"Read the AI DYNAMICS INC notices and controls for Jas Miami Method.");}
const sections = [
  {
    "id": "request",
    "title": "1. Submit a request / Presentar una solicitud",
    "en": "To request access, correction, an export, restriction, objection or deletion of your JMM personal data, email jasmel@jasmiamimethod.fit or write to AI DYNAMICS INC at the business address below. Specify the account email, request type and relevant records. You do not need to disclose a diagnosis, password, verification code or full device export in the initial message. Opening an email link does not submit a request; send the message and retain the reply.",
    "es": "Para solicitar acceso, corrección, exportación, limitación, oposición o eliminación de tus datos de JMM, escribe a jasmel@jasmiamimethod.fit o a AI DYNAMICS INC en la dirección indicada abajo. Indica correo de la cuenta, solicitud y registros relevantes. No necesitas incluir diagnóstico, contraseña, código de verificación ni exportación completa de dispositivo en el mensaje inicial. Abrir el enlace de correo no envía la solicitud: envía el mensaje y conserva la respuesta."
  },
  {
    "id": "delete-account",
    "title": "2. Account and data deletion / Eliminación de cuenta y datos",
    "en": "JMM currently handles account/data deletion requests through the contact process; it does not offer a verified one-click account-erasure flow. Tell us whether you want the whole account or selected records deleted. We will verify the account relationship, explain scope and respond under applicable law. Required legal/security records, provider logs and backups may follow separate retention rules; we do not promise immediate erasure, a fixed deletion deadline or deletion from another provider’s account.",
    "es": "JMM tramita la eliminación de cuenta y datos mediante contacto; no ofrece un flujo verificado de borrado total con un clic. Indica si solicitas eliminar toda la cuenta o registros seleccionados. Verificaremos la relación con la cuenta, explicaremos el alcance y responderemos conforme a la ley aplicable. Los registros legales o de seguridad, logs y copias pueden tener reglas separadas; no prometemos borrado inmediato, plazo fijo ni eliminación de cuentas de otros proveedores."
  },
  {
    "id": "disconnect",
    "title": "3. Withdraw optional permissions / Retirar permisos opcionales",
    "en": "You can leave AI controls unchecked, uncheck the page-level education choice, and disconnect supported providers from Connections. New images require separate consent each time. Disconnecting stops that JMM connection but does not by itself erase imported history, the source account, previously delivered email/calendar events or information already processed by a provider. Clearing chat is distinct from deleting your account and preserves confirmed training/audit records as described in the confirmation screen.",
    "es": "Puedes dejar la IA sin marcar, desactivar educación en la página y desconectar proveedores compatibles en Conexiones. Cada imagen nueva requiere consentimiento separado. Desconectar detiene esa conexión, pero no borra por sí solo historial, cuenta de origen, correos o eventos entregados ni información ya tratada por un proveedor. Borrar el chat es distinto de eliminar la cuenta y conserva registros confirmados de entrenamiento y auditoría según su pantalla de confirmación."
  },
  {
    "id": "complaints",
    "title": "4. Questions, concerns and complaints / Consultas, preocupaciones y reclamaciones",
    "en": "Contact AI DYNAMICS INC if information is wrong, a request cannot be completed, a child supplied information without appropriate authorization, or you suspect unauthorized access/disclosure. We may request proportionate identity verification and will explain a refusal or retained records where applicable. Depending on your location, you may also have a right to complain to a data-protection regulator. This contact channel is not monitored as an emergency service.",
    "es": "Contacta con AI DYNAMICS INC por datos incorrectos, solicitudes incompletas, información de menores sin autorización adecuada o sospecha de acceso o divulgación no autorizados. Podemos pedir verificación de identidad proporcionada y explicar negativas o registros conservados cuando corresponda. Según tu ubicación, también puedes reclamar ante una autoridad de protección de datos. Este canal no es un servicio de emergencias."
  }
];
export default function Page(){return <PolicyPage title="Data rights and deletion · Derechos de datos y eliminación">{sections.map(s=><section id={s.id} key={s.id} className="rounded-2xl border border-ink-200 bg-white p-5"><h2 className="font-display font-bold text-lg mb-2">{s.title}</h2><p lang="en"><strong>EN:</strong> {s.en}</p><p lang="es" className="mt-2"><strong>ES:</strong> {s.es}</p></section>)}</PolicyPage>}
