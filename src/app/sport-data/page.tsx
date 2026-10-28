"use client";
import { ProtectedPage } from "@/components/gate";
import { SportDataPanel } from "@/components/SportDataPanel";
import { useAuth } from "@/components/auth";
export default function SportDataPage(){const {language}=useAuth();return <ProtectedPage><div className="max-w-2xl mx-auto"><h1 className="sr-only">{language==="es"?"Datos por deporte":"Sport data"}</h1><SportDataPanel/></div></ProtectedPage>;}
