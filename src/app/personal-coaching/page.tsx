import type { Metadata } from "next";
import { CoachingShowcase } from "@/components/coaching-showcase";
export const metadata:Metadata={title:"J Koach | Personalized daily coaching | JMM",description:"Explore connection-first setup, reviewed training cycles, daily check-ins, coaching conversations, fueling, recovery and workout feedback—with or without a wearable.",alternates:{canonical:"/personal-coaching"}};
export default function Page(){return <CoachingShowcase kind="coaching"/>;}
