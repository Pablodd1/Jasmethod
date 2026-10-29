import { WebsitePage } from "@/components/website-page";
import { publicLocale } from "@/lib/public-site";
import { websiteMetadata } from "@/lib/website-metadata";
export async function generateMetadata(){return websiteMetadata("/faq",await publicLocale());}
export default async function Page(){return <WebsitePage path="/faq" locale={await publicLocale()}/>;}