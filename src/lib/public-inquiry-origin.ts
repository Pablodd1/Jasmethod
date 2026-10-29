import { appMutationOriginAllowed } from "./request-origin";
import { PUBLIC_SITE_ORIGIN } from "./public-routes";
/** The verified public www alias serves the same anonymous contact page. */
export function publicInquiryOriginAllowed(req:Request,env:Record<string,string|undefined>=process.env) {
  if(appMutationOriginAllowed(req,env))return true;
  try {
    if(new URL(env.APP_URL||env.NEXT_PUBLIC_APP_URL||"").origin!==PUBLIC_SITE_ORIGIN)return false;
    const alias=new URL(PUBLIC_SITE_ORIGIN);alias.hostname="www."+alias.hostname;
    return appMutationOriginAllowed(req,{...env,APP_URL:alias.origin});
  }catch{return false;}
}
