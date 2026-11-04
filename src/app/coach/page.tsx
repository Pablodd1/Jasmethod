"use client";

import { useAuth } from "@/components/auth";
import { ProtectedPage } from "@/components/gate";
import { CoachConversation } from "@/components/daily-training/coach-conversation";

// Chat loads independently of Today, device sync and the training dashboard.
export default function CoachPage() {
  const { user } = useAuth();
  const es = user?.language === "es";
  return <ProtectedPage immersive><main className="coach-chat-route" aria-label={es ? "Conversación con JMM Koach" : "JMM Koach conversation"}>
    <h1 className="sr-only">JMM Koach</h1>
    {user && <CoachConversation key={user.id} fullPage athleteId={user.id} es={es} onConfirmed={() => undefined} />}
  </main></ProtectedPage>;
}
