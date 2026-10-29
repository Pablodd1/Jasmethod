import { notFound } from "next/navigation";
import { WebsitePage } from "@/components/website-page";
import { websiteMetadata } from "@/lib/website-metadata";
import { WEBSITE_TITLES } from "@/lib/website-content";
import { WEBSITE_SCIENCE } from "@/lib/website-science";
import { publicMetadata } from "@/lib/public-site";
import Privacy from "@/app/privacy/page";
import Terms from "@/app/terms/page";
import Policies from "@/app/policies/page";
import Cookies from "@/app/cookies/page";
import Rights from "@/app/data-rights/page";
import Help from "@/app/help/page";
const notices:Record<string,{component:()=>React.ReactNode;title:string}>={"/privacy":{component:Privacy,title:"Privacidad y consentimiento de IA"},"/terms":{component:Terms,title:"Términos del servicio"},"/policies":{component:Policies,title:"Políticas y avisos"},"/cookies":{component:Cookies,title:"Cookies y almacenamiento"},"/data-rights":{component:Rights,title:"Derechos y eliminación"},"/help":{component:Help,title:"Ayuda y soporte"}};
const pathOf=(parts?:string[])=>"/"+(parts||[]).join("/");
const available=(path:string)=>Object.hasOwn(WEBSITE_TITLES,path)||(path.startsWith("/science/")&&Object.hasOwn(WEBSITE_SCIENCE,path.slice(9)));
export async function generateMetadata({params}:{params:Promise<{path?:string[]}>}){const path=pathOf((await params).path);if(available(path))return websiteMetadata(path,"es");if(notices[path])return publicMetadata(path,"es",notices[path].title+" | Jas Miami Method","Consulta los avisos, controles y vías de contacto de AI DYNAMICS INC para Jas Miami Method.");return {title:"Página no encontrada | Jas Miami Method",robots:{index:false,follow:false}};}
export default async function SpanishPage({params}:{params:Promise<{path?:string[]}>}){const path=pathOf((await params).path);if(available(path))return <WebsitePage path={path} locale="es"/>;if(notices[path]){const Component=notices[path].component;return <Component/>;}notFound();}
