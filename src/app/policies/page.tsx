import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage } from "@/components/policy-page";
export const metadata:Metadata={title:"Policies and notices — JasMiamiMethod",alternates:{canonical:"/policies"}};
const notices=[
 ["/privacy","Privacy and AI consent / Privacidad y consentimiento de IA","Data categories, recipients, optional OpenAI, Garmin restrictions and retention / Datos, destinatarios, OpenAI opcional, restricciones Garmin y conservación"],
 ["/terms","Terms of Service / Términos de servicio","Service, health limitations, current free pilot and separately arranged coaching / Servicio, límites de salud, piloto gratuito y coaching acordado por separado"],
 ["/cookies","Cookies and browser storage / Cookies y almacenamiento","Sign-in cookies, language, drafts and browser controls / Cookies de sesión, idioma, borradores y controles"],
 ["/data-rights","Data rights and deletion / Derechos de datos y eliminación","Access, correction, export, consent withdrawal and deletion requests / Acceso, corrección, exportación, retirada de permisos y eliminación"],
 ["/privacy#optional-ai","AI transparency / Transparencia de IA","What OpenAI can receive, independent consent and manual alternatives / Qué puede recibir OpenAI, consentimiento independiente y alternativas manuales"],
 ["/terms#health-and-training","Health and training limitations / Límites de salud y entrenamiento","Educational coaching, no medical clearance or guaranteed results / Coaching educativo, sin autorización médica ni resultados garantizados"]];
export default function Policies(){return <PolicyPage title="Policies and notices · Políticas y avisos"><p lang="en">Read these notices before creating an account, connecting a service or choosing optional AI. Consent to one feature does not authorize another.</p><p lang="es">Lee estos avisos antes de crear una cuenta, conectar un servicio o elegir IA opcional. Autorizar una función no autoriza otra.</p><ul className="space-y-4">{notices.map(([href,label,detail])=><li key={href} className="rounded-2xl border border-ink-200 bg-white p-5"><Link href={href} className="font-bold underline">{label}</Link><p className="mt-2">{detail}</p></li>)}</ul></PolicyPage>}
