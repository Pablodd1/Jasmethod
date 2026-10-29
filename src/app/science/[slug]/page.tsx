import { notFound } from "next/navigation";
import { WebsitePage } from "@/components/website-page";
import { publicLocale } from "@/lib/public-site";
import { websiteMetadata } from "@/lib/website-metadata";
import { WEBSITE_SCIENCE } from "@/lib/website-science";
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const slug=(await params).slug;if(!Object.hasOwn(WEBSITE_SCIENCE,slug))return {title:"Not found | Jas Miami Method",robots:{index:false}};return websiteMetadata("/science/"+slug,await publicLocale());}
export default async function Page({params}:{params:Promise<{slug:string}>}){const slug=(await params).slug;if(!Object.hasOwn(WEBSITE_SCIENCE,slug))notFound();return <WebsitePage path={"/science/"+slug} locale={await publicLocale()}/>;}
