import { publicLocale,publicMetadata } from "@/lib/public-site";
export async function generateMetadata(){const locale=await publicLocale();return publicMetadata("/privacy",locale,locale==="es"?"Privacidad y consentimiento de IA | Jas Miami Method":"Privacy and AI consent | Jas Miami Method",locale==="es"?"Datos, destinatarios, IA opcional, controles y límites de conservación de JMM.":"JMM data, recipients, optional AI, controls and retention limitations.");}
export default function PrivacyLayout({children}:{children:React.ReactNode}){return children;}
