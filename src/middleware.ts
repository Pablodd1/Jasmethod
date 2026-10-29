import { NextResponse, type NextRequest } from "next/server";
import { publicRoute,englishReferenceRoute } from "@/lib/public-routes";
export function middleware(request:NextRequest) {
  const route=publicRoute(request.nextUrl.pathname),headers=new Headers(request.headers);
  // Server-owned routing hints, never authorization or athlete identity.
  headers.delete("x-jmm-public-locale");headers.delete("x-jmm-public-path");
  if(route.localized){headers.set("x-jmm-public-locale",route.locale);headers.set("x-jmm-public-path",route.base);}
  else if(englishReferenceRoute(request.nextUrl.pathname)){headers.set("x-jmm-public-locale","en");}
  const response=NextResponse.next({request:{headers}});
  const privateRoots=["/today","/daily","/dashboard","/checkin","/training","/settings","/connectors","/races","/admin","/onboard","/nutrition","/blood","/dna","/labs","/prs","/calendar","/brain","/sleep","/gear","/hyrox","/sport-data","/reminders","/workout-email","/admin-recovery","/account","/login","/forgot-password","/reset-password"];
  if(privateRoots.some(path=>request.nextUrl.pathname===path||request.nextUrl.pathname.startsWith(path+"/")))response.headers.set("X-Robots-Tag","noindex, nofollow, noarchive");
  return response;
}
export const config={matcher:["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.[a-zA-Z0-9]+$).*)"]};
