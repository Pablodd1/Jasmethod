"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DetailedAthleteSetup } from "@/components/detailed-athlete-setup";
import { PilotOnboarding } from "@/components/pilot-onboarding";
function Setup() { const query=useSearchParams();return query.get("advanced")==="1"?<DetailedAthleteSetup/>:<PilotOnboarding/>; }
export default function OnboardPage(){return <Suspense fallback={<p role="status">Loading athlete setup…</p>}><Setup/></Suspense>;}
