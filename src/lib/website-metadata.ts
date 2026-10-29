import { publicMetadata } from "./public-site";
import { WEBSITE_TITLES,WEBSITE_DESCRIPTIONS,wording } from "./website-content";
import { WEBSITE_SCIENCE } from "./website-science";
import type { PublicLocale } from "./public-routes";
export function websiteMetadata(path:string,locale:PublicLocale){
  const guide=path.startsWith("/science/")&&Object.hasOwn(WEBSITE_SCIENCE,path.slice(9))?WEBSITE_SCIENCE[path.slice(9)]:null;
  return publicMetadata(path,locale,wording(locale,guide?.title||WEBSITE_TITLES[path])+" | Jas Miami Method",wording(locale,guide?.intro||WEBSITE_DESCRIPTIONS[path]));
}
