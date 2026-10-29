import { headers } from "next/headers";
import type { Metadata } from "next";
import { PUBLIC_SITE_ORIGIN, publicHref, type PublicLocale } from "./public-routes";
export async function publicLocale():Promise<PublicLocale>{return (await headers()).get("x-jmm-public-locale")==="es"?"es":"en";}
export function publicMetadata(path:string,locale:PublicLocale,title:string,description:string):Metadata {
  const canonical=publicHref(locale,path),url=PUBLIC_SITE_ORIGIN+canonical;
  return {title,description,alternates:{canonical,languages:{en:PUBLIC_SITE_ORIGIN+path,es:PUBLIC_SITE_ORIGIN+publicHref("es",path),"x-default":PUBLIC_SITE_ORIGIN+path}},
    openGraph:{type:"website",url,title,description,siteName:"Jas Miami Method",locale:locale==="es"?"es_US":"en_US",alternateLocale:locale==="es"?["en_US"]:["es_US"],images:[{url:PUBLIC_SITE_ORIGIN+"/website-social-"+locale+".png",width:1200,height:630,alt:locale==="es"?"Jas Miami Method — entrenamiento, alimentación y recuperación":"Jas Miami Method — training, fueling and recovery"}]},
    twitter:{card:"summary_large_image",title,description,images:[PUBLIC_SITE_ORIGIN+"/website-social-"+locale+".png"]}};
}
