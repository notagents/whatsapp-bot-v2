"use client";

import { useState, useEffect } from "react";
import { ContextTab } from "./debug-tabs/context-tab";
import { StateTab } from "./debug-tabs/state-tab";
import { TurnsTab } from "./debug-tabs/turns-tab";
import { RunsTab } from "./debug-tabs/runs-tab";
import { MemoryTab } from "./debug-tabs/memory-tab";
import type { MonitorConversationDetail } from "@/lib/types/monitor";

type DebugTabId = "context" | "state" | "turns" | "runs" | "memory";

const TABS: { id: DebugTabId; label: string }[] = [
  { id: "context", label: "Context" },
  { id: "state", label: "State" },
  { id: "turns", label: "Turns" },
  { id: "runs", label: "Runs" },
  { id: "memory", label: "Memory" },
];

type Props = {
  conversationDetail: MonitorConversationDetail | null;
  selectedTurnId?: string | null;
};

export function DebugPanel({ conversationDetail, selectedTurnId }: Props) {
  const [activeTab, setActiveTab] = useState<DebugTabId>("context");

  useEffect(() => {
    if (selectedTurnId) queueMicrotask(() => setActiveTab("turns"));
  }, [selectedTurnId]);

  if (!conversationDetail) {
    return (
      <div className="flex h-full items-center justify-center border-l bg-muted/20 text-muted-foreground text-sm">
        Selecciona una conversación para ver el debug
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l">
      <div className="flex shrink-0 gap-0.5 border-b p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {activeTab === "context" && (
          <ContextTab
            memory={conversationDetail.memory}
            responsesEnabled={conversationDetail.responsesEnabled}
          />
        )}
        {activeTab === "state" && <StateTab state={conversationDetail.state} />}
        {activeTab === "turns" && (
          <TurnsTab
            turns={conversationDetail.turns}
            selectedTurnId={selectedTurnId ?? null}
          />
        )}
        {activeTab === "runs" && (
          <RunsTab agentRuns={conversationDetail.agentRuns} />
        )}
        {activeTab === "memory" && (
          <MemoryTab memory={conversationDetail.memory} />
        )}
      </div>
    </div>
  );
}
