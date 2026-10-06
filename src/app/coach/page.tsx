"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth";
import { ProtectedPage } from "@/components/gate";
import { CoachConversation } from "@/components/daily-training/coach-conversation";

// Chat loads independently of Today, device sync and the training dashboard.
export default function CoachPage() {
  const { user } = useAuth();
  const es = user?.language === "es";
  return <ProtectedPage><main className="max-w-4xl mx-auto space-y-5">
    <div><h1 className="font-display text-3xl font-bold">J Koach</h1>
      <p className="mt-2 text-slate-600">{es
        ? "Tu conversación privada. Revisa cualquier cambio propuesto antes de guardarlo."
        : "Your private coaching conversation. Review proposed changes before saving them."}</p>
    </div>
    {user && <CoachConversation key={user.id} athleteId={user.id} es={es} onConfirmed={() => undefined} />}
    <Link className="btn-secondary inline-flex" href="/today">{es ? "Volver al entrenamiento de hoy" : "Back to today's training"}</Link>
  </main></ProtectedPage>;
}
