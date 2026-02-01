"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SimulatorConversationsSidebar } from "@/components/simulator-conversations-sidebar";
import { SimulatorChatWindow } from "@/components/simulator-chat-window";
import { SimulatorDebugPanel } from "@/components/simulator-debug-panel";

type Props = {
  sessionId: string;
  configOverride?: "draft" | "published";
};

export function SimulatorSession({ sessionId, configOverride }: Props) {
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

  const configBadge =
    configOverride === "draft"
      ? "Using: Draft"
      : configOverride === "published"
      ? "Using: Published"
      : "Using: Auto (Draft)";

  return (
    <div className="flex h-screen bg-background">
      <header className="absolute top-0 left-0 right-0 h-12 border-b flex items-center px-4 z-10 bg-background">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sim">← Sim</Link>
        </Button>
        <span className="ml-2 font-mono text-sm truncate">{sessionId}</span>
        <span
          className={`ml-2 rounded px-2 py-0.5 text-xs font-medium ${
            configOverride === "draft"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
              : configOverride === "published"
              ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200"
              : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
          }`}
        >
          {configBadge}
        </span>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link href={`/ui/sessions/${encodeURIComponent(sessionId)}`}>
            Config
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/kb/${encodeURIComponent(sessionId)}`}>
            Gestionar KB
          </Link>
        </Button>
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
          configOverride={configOverride}
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
