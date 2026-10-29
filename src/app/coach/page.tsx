"use client";

import { useAuth } from "@/components/auth";
import { ProtectedPage } from "@/components/gate";
import { CoachConversation } from "@/components/daily-training/coach-conversation";

// Chat loads independently of Today, device sync and the training dashboard.
export default function CoachPage() {
  const { user } = useAuth();
  const es = user?.language === "es";
  return <ProtectedPage><main className="coach-chat-route" aria-label={es ? "Conversación con JMM Coach" : "JMM Coach conversation"}>
    <h1 className="sr-only">JMM Coach</h1>
    {user && <CoachConversation key={user.id} fullPage athleteId={user.id} es={es} onConfirmed={() => undefined} />}
  </main></ProtectedPage>;
}
