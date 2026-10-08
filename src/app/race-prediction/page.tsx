import type { Metadata } from "next";
import { CoachingShowcase } from "@/components/coaching-showcase";
export const metadata:Metadata={title:"AdvanzedRacing | Race scenario planning | JMM",description:"Explore race scenarios with dated athlete references, course profiles, editable conditions and practiced fueling context. All scenario calculations remain unvalidated.",alternates:{canonical:"/race-prediction"}};
export default function Page(){return <CoachingShowcase kind="racing"/>;}
