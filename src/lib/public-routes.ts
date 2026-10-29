export type PublicLocale = "en" | "es";
export const PUBLIC_SITE_ORIGIN = "https://jasmiamimethod.fit";
export const LOCALIZED_PUBLIC_PATHS = ["/", "/how-it-works", "/capabilities", "/personal-coaching", "/contact", "/book", "/faq", "/science", "/science/supplements", "/science/ergogenic-aids", "/science/sleep", "/science/nutrition", "/science/race-fuel", "/privacy", "/terms", "/policies", "/cookies", "/data-rights", "/help"] as const;
export function englishReferenceRoute(pathname:string){return ["/metrics","/science/j-metrics","/protocols","/race-prediction","/blog"].includes(pathname)||pathname.startsWith("/blog/");}
export function publicRoute(pathname:string) {
  const path=pathname.replace(/\/$/,"")||"/";
  const locale:PublicLocale=path==="/es"||path.startsWith("/es/")?"es":"en";
  const base=locale==="es"?(path.slice(3)||"/"):path;
  return {locale,base,localized:(LOCALIZED_PUBLIC_PATHS as readonly string[]).includes(base)};
}
export function publicHref(locale:string,path:string) {
  const [base,hash]=path.split("#");
  return (locale==="es"&&(LOCALIZED_PUBLIC_PATHS as readonly string[]).includes(base)?"/es"+(base==="/"?"":base):base)+(hash?"#"+hash:"");
}
