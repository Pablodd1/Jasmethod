import { WebsitePage } from "@/components/website-page";
import { publicLocale } from "@/lib/public-site";
import { websiteMetadata } from "@/lib/website-metadata";
export async function generateMetadata(){return websiteMetadata("/how-it-works",await publicLocale());}
export default async function Page(){return <WebsitePage path="/how-it-works" locale={await publicLocale()}/>;}