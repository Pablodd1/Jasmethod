"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth";
import { ProtectedPage } from "@/components/gate";
import { CoachConversation } from "@/components/daily-training/coach-conversation";

// Chat loads independently of Today, device sync and the training dashboard.
export default function CoachPage() {
  const { user } = useAuth();
  const es = user?.language === "es";
  return <ProtectedPage><main className="max-w-3xl mx-auto space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-3xl font-bold">Jas KCoach</h1>
      <Link className="text-sm text-slate-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" href="/today">{es ? "Entrenamiento de hoy" : "Today's training"}</Link>
    </div>
    {user && <CoachConversation key={user.id} athleteId={user.id} es={es} onConfirmed={() => undefined} />}
  </main></ProtectedPage>;
}
