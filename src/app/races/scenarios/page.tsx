import type { Metadata } from "next";
import { ProtectedPage } from "@/components/gate";
import { RaceScenarioWorkspace } from "@/components/race-scenario-workspace";

export const metadata: Metadata = {
  title: "AdvanzedRacing scenarios | JMM",
  description: "Review race evidence, course and conditions in an unvalidated scenario workspace.",
  robots: { index: false, follow: false },
};

export default function RaceScenariosPage() {
  return <ProtectedPage><RaceScenarioWorkspace /></ProtectedPage>;
}
