"use client";
import type { ReactNode } from "react";
import { useAuth } from "./auth";
import { publicHref } from "@/lib/public-routes";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-shell";
import { PUBLIC_CONTACT_EMAIL, PUBLIC_CONTACT_MAILTO } from "@/lib/public-contact";
export function PolicyPage({title,children}:{title:string;children:ReactNode}) {
 const {language:locale}=useAuth();
 return <><SiteHeader/><main id="main-content" tabIndex={-1} className="pub-container py-12 max-w-3xl mx-auto"><p className="micro">AI DYNAMICS INC · Updated / Actualizado: October 25, 2026</p><h1 className="font-display text-3xl font-bold mt-3 mb-6">{title}</h1><div className="space-y-5 text-sm leading-relaxed text-ink-700">{children}<section className="rounded-2xl border p-5"><h2 className="font-bold">Company and contact / Empresa y contacto</h2><p>AI DYNAMICS INC · 401 69th St, Apt 709, Miami Beach, FL 33141, USA</p><p lang="en">AI DYNAMICS INC is responsible for processing JMM users’ personal data.</p><p lang="es">AI DYNAMICS INC es responsable del tratamiento de los datos personales de los usuarios de JMM.</p><a href={PUBLIC_CONTACT_MAILTO} className="underline">{PUBLIC_CONTACT_EMAIL}</a></section><Link className="inline-block underline" href={publicHref(locale,"/policies")}>All policies and notices / Todas las políticas y avisos</Link></div></main><SiteFooter/></>;
}
