"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SimulatorConversationsSidebar } from "@/components/simulator-conversations-sidebar";
import { SimulatorChatWindow } from "@/components/simulator-chat-window";
import { SimulatorDebugPanel } from "@/components/simulator-debug-panel";

type Props = {
  sessionId: string;
};

export function SimulatorSession({ sessionId }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [debugKey, setDebugKey] = useState(0);

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
  }, []);

  const handleNewConversation = useCallback((id: string) => {
    setConversationId(id);
  }, []);

  const handleResetDone = useCallback(() => {
    setDebugKey((k) => k + 1);
  }, []);

  return (
    <div className="flex h-screen bg-background">
      <header className="absolute top-0 left-0 right-0 h-12 border-b flex items-center px-4 z-10 bg-background">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sim">← Sim</Link>
        </Button>
        <span className="ml-2 font-mono text-sm truncate">{sessionId}</span>
      </header>
      <div className="flex flex-1 pt-12 min-h-0">
        <SimulatorConversationsSidebar
          sessionId={sessionId}
          selectedConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
        />
        <SimulatorChatWindow
          sessionId={sessionId}
          conversationId={conversationId}
          onResetDone={handleResetDone}
        />
        <SimulatorDebugPanel
          key={debugKey}
          conversationId={conversationId}
          onResponsesUpdated={handleResetDone}
        />
      </div>
    </div>
  );
}
