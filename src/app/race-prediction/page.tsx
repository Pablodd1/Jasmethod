import type { Metadata } from "next";
import { CoachingShowcase } from "@/components/coaching-showcase";
export const metadata:Metadata={title:"AdvanzedRacing | Race preparation and forecast status | JMM",description:"Prepare your race with reviewed goals, event details and HYROX scenarios. Understand why personalized numeric forecasts remain unavailable in the JMM pilot.",alternates:{canonical:"/race-prediction"}};
export default function Page(){return <CoachingShowcase kind="racing"/>;}
