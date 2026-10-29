"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth";
import { publicHref,publicRoute,englishReferenceRoute } from "@/lib/public-routes";
import type { Lang } from "@/lib/i18n";
export function PublicLanguageSelect({compact}:{compact?:boolean}) {
  const pathname=usePathname(),route=publicRoute(pathname),{language,setLanguage}=useAuth();
  if(englishReferenceRoute(pathname))return <Link href="/es/science" className="website-language text-xs" lang="es" aria-label="Spanish guides; this reference page is in English">Guías en español ↗</Link>;
  return <label className={compact?"text-sm":"text-sm inline-flex gap-2 items-center"}><span className="sr-only">Language</span><select aria-label="Language" className="website-language" value={route.localized?route.locale:language==="es"?"es":"en"} onChange={e=>{
    if(route.localized)window.location.assign(publicHref(e.target.value,route.base)+window.location.hash);
    else void setLanguage(e.target.value as Lang);
  }}><option value="en">English</option><option value="es">Español</option></select></label>;
}
export function SiteHeader(){
  const pathname=usePathname(),{language,user}=useAuth(),route=publicRoute(pathname),locale=route.localized?route.locale:language,es=locale==="es",href=(path:string)=>publicHref(locale,path);
  const links=[["/how-it-works",es?"Cómo funciona":"How it works"],["/capabilities",es?"Qué puedes hacer":"Capabilities"],["/science",es?"Ciencia":"Science"],["/contact",es?"Contacto":"Contact"]];
  const nav=(mobile=false)=><nav aria-label={es?"Navegación pública":"Public navigation"} className={mobile?"website-mobile-links":"website-desktop-links"}>{links.map(([path,label])=><Link key={path} href={href(path)} aria-current={route.base===path?"page":undefined}>{label}</Link>)}{mobile&&<Link href={user?"/today":"/login"}>{user?(es?"Mi entrenamiento":"My training"):(es?"Entrar":"Sign in")}</Link>}</nav>;
  return <header className="website-header"><a className="website-skip" href="#main-content">{es?"Ir al contenido":"Skip to content"}</a><div className="pub-container website-header-row">
    <Link href={href("/")} className="website-brand" aria-label="Jas Miami Method"><span aria-hidden="true" className="website-brand-mark">j</span><span>Jas Miami Method</span><span className="website-brand-short">JMM</span></Link>
    {nav()}<div className="website-header-actions"><PublicLanguageSelect compact/><Link className="website-signin" href={user?"/today":"/login"}>{user?(es?"Mi entrenamiento":"My training"):(es?"Entrar":"Sign in")}</Link><details className="website-mobile-menu"><summary>{es?"Menú":"Menu"}</summary>{nav(true)}</details></div>
  </div></header>;
}
export function SiteFooter(){
  const {language}=useAuth(),route=publicRoute(usePathname()),locale=route.localized?route.locale:language,es=locale==="es",href=(path:string)=>publicHref(locale,path);
  return <footer className="website-footer"><div className="pub-container"><div className="website-footer-top"><div><Link href={href("/")} className="website-brand">Jas Miami Method</Link><p>{es?"Entrenamiento, alimentación y recuperación con contexto.":"Training, fueling and recovery in context."}</p></div><nav aria-label={es?"Más información":"More information"}>{[["/personal-coaching","JMM Coach"],["/book",es?"Reservar una conversación":"Book a conversation"],["/faq",es?"Preguntas frecuentes":"FAQ"],["/blog",es?"Artículos (inglés)":"Articles"],["/help",es?"Ayuda":"Help"]].map(([path,label])=><Link key={path} href={href(path)}>{label}</Link>)}</nav></div>
    <nav className="website-policy-links" aria-label={es?"Políticas":"Policies"}>{[["/policies",es?"Políticas y avisos":"Policies and notices"],["/privacy",es?"Privacidad e IA":"Privacy and AI"],["/terms",es?"Términos":"Terms"],["/cookies",es?"Cookies y almacenamiento":"Cookies and storage"],["/data-rights",es?"Derechos y eliminación":"Data rights and deletion"]].map(([path,label])=><Link key={path} href={href(path)}>{label}</Link>)}</nav>
    <p className="website-footer-note">AI DYNAMICS INC · {es?"Información educativa y herramientas de entrenamiento. No es diagnóstico ni autorización médica para entrenar.":"Educational information and training tools. Not diagnosis or medical exercise clearance."}</p>
  </div></footer>;
}
