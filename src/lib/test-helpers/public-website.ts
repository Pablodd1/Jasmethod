import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as routes from "../public-routes";
import * as copy from "../website-content";
import * as science from "../website-science";
import * as contact from "../public-contact";
import * as booking from "../public-booking";
const require=createRequire(import.meta.url);
/** Render the actual public components with no session, browser or transport dependencies. */
export function renderWebsite(language:"en"|"es",path="/") {
  const dependencies:Record<string,unknown>={react:React,"react/jsx-runtime":require("react/jsx-runtime"),"next/link":{__esModule:true,default:({children,...props}:any)=>React.createElement("a",props,children)},
    "next/navigation":{usePathname:()=>routes.publicHref(language,path)},"./auth":{useAuth:()=>({language,user:null})},"@/components/auth":{useAuth:()=>({language,user:null})},
    "@/lib/public-routes":routes,"@/lib/website-content":copy,"@/lib/website-science":science,"@/lib/public-contact":contact,"@/lib/public-booking":booking};
  function load(file:string){const compiled=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
    const loaded={exports:{} as any};runInNewContext(compiled,{module:loaded,exports:loaded.exports,process:{env:{}},require:(name:string)=>{if(name in dependencies)return dependencies[name];throw Error("Unexpected public-render dependency: "+name);}});return loaded.exports;}
  dependencies["./site-shell"]=load("src/components/site-shell.tsx");dependencies["./public-inquiry-form"]=load("src/components/public-inquiry-form.tsx");
  const {WebsitePage}=load("src/components/website-page.tsx");return renderToStaticMarkup(React.createElement(WebsitePage,{path,locale:language}));
}
