import test from "node:test";
import assert from "node:assert/strict";
import { publicInquiryOriginAllowed } from "./public-inquiry-origin";
import { PUBLIC_SITE_ORIGIN } from "./public-routes";
test("public inquiries accept the verified www alias only for the configured production site",()=>{
 const env={NODE_ENV:"production",NEXT_PUBLIC_APP_URL:PUBLIC_SITE_ORIGIN};
 const request=(origin?:string,headers={})=>new Request("http://localhost:3220/api/public-inquiry",{headers:{...(origin?{origin}:{}),...headers}});
 assert.equal(publicInquiryOriginAllowed(request(PUBLIC_SITE_ORIGIN),env),true);
 assert.equal(publicInquiryOriginAllowed(request("https://www.jasmiamimethod.fit"),env),true);
 assert.equal(publicInquiryOriginAllowed(request("https://www.jasmiamimethod.fit",{"sec-fetch-site":"cross-site"}),env),false);
 for(const origin of [undefined,"https://foreign.example.invalid","https://jasmiamimethod.fit.foreign.example.invalid","http://www.jasmiamimethod.fit"])assert.equal(publicInquiryOriginAllowed(request(origin,{host:"www.jasmiamimethod.fit","x-forwarded-host":"www.jasmiamimethod.fit"}),env),false);
 assert.equal(publicInquiryOriginAllowed(request("https://www.jasmiamimethod.fit"),{NODE_ENV:"production",NEXT_PUBLIC_APP_URL:"https://preview.example.invalid"}),false);
 assert.equal(publicInquiryOriginAllowed(request("https://www.jasmiamimethod.fit"),{NODE_ENV:"production"}),false);
});
